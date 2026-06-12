import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rangoDe, type Periodo } from '@/features/reports/api'

// ============================================================================
// Contabilidad (solo admin). A diferencia de ventas/gastos rápidos del POS,
// estas operaciones de administración van DIRECTO a Supabase (no por la cola
// offline): se usan desde el panel del admin, con conexión. El dinero sensible
// (saldo de una deuda) lo recalcula el servidor en la RPC `registrar_abono`.
// ============================================================================

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia'

export const METODOS: { id: MetodoPago; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
]

// ----------------------------------------------------------------------------
// Proveedores
// ----------------------------------------------------------------------------

export interface Proveedor {
  id: string
  nombre: string
  contacto: string | null
  notas: string | null
  activo: boolean
}

export function useProveedores(tenantId: string | null) {
  return useQuery({
    queryKey: ['proveedores', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Proveedor[]> => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, nombre, contacto, notas, activo')
        .eq('tenant_id', tenantId!)
        .order('nombre')
      if (error) throw error
      return (data ?? []) as Proveedor[]
    },
  })
}

export interface NuevoProveedor {
  id?: string
  nombre: string
  contacto: string | null
  notas: string | null
}

export function useGuardarProveedor(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: NuevoProveedor) => {
      if (p.id) {
        const { error } = await supabase
          .from('suppliers')
          .update({ nombre: p.nombre, contacto: p.contacto, notas: p.notas })
          .eq('id', p.id)
          .eq('tenant_id', tenantId!)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert({ tenant_id: tenantId!, nombre: p.nombre, contacto: p.contacto, notas: p.notas })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores', tenantId] }),
  })
}

export function useEliminarProveedor(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores', tenantId] })
      qc.invalidateQueries({ queryKey: ['cuentas-por-pagar', tenantId] })
    },
  })
}

// ----------------------------------------------------------------------------
// Cuentas por pagar
// ----------------------------------------------------------------------------

export type EstadoCuenta = 'pendiente' | 'parcial' | 'pagada' | 'cancelada'

export interface CuentaPorPagar {
  id: string
  supplier_id: string | null
  proveedor: string | null // nombre resuelto
  concepto: string
  categoria: string | null
  monto_total: number
  monto_pagado: number
  saldo: number
  estado: EstadoCuenta
  vencimiento: string | null // YYYY-MM-DD
  vencida: boolean
  creado_en: string
}

export interface ResumenCxP {
  cuentas: CuentaPorPagar[]
  totalPendiente: number // saldo de cuentas no pagadas/canceladas
  totalVencido: number // saldo de cuentas con vencimiento pasado y aún con saldo
}

export function useCuentasPorPagar(tenantId: string | null) {
  return useQuery({
    queryKey: ['cuentas-por-pagar', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumenCxP> => {
      const { data, error } = await supabase
        .from('payables')
        .select(
          'id, supplier_id, concepto, categoria, monto_total, monto_pagado, estado, vencimiento, creado_en, suppliers(nombre)',
        )
        .eq('tenant_id', tenantId!)
        .order('vencimiento', { ascending: true, nullsFirst: false })
        .order('creado_en', { ascending: false })
      if (error) throw error

      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)

      let totalPendiente = 0
      let totalVencido = 0
      const cuentas: CuentaPorPagar[] = (data ?? []).map((c: any) => {
        const total = Number(c.monto_total)
        const pagado = Number(c.monto_pagado)
        const saldo = Math.max(total - pagado, 0)
        const abierta = c.estado === 'pendiente' || c.estado === 'parcial'
        const vencida =
          abierta && saldo > 0 && c.vencimiento != null && new Date(c.vencimiento) < hoy
        if (abierta) totalPendiente += saldo
        if (vencida) totalVencido += saldo
        return {
          id: c.id,
          supplier_id: c.supplier_id,
          proveedor: c.suppliers?.nombre ?? null,
          concepto: c.concepto,
          categoria: c.categoria,
          monto_total: total,
          monto_pagado: pagado,
          saldo,
          estado: c.estado,
          vencimiento: c.vencimiento,
          vencida,
          creado_en: c.creado_en,
        }
      })

      return { cuentas, totalPendiente, totalVencido }
    },
  })
}

export interface NuevaCuenta {
  supplier_id: string | null
  concepto: string
  categoria: string | null
  monto_total: number
  vencimiento: string | null
}

export function useCrearCuenta(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: NuevaCuenta) => {
      const { error } = await supabase.from('payables').insert({
        tenant_id: tenantId!,
        supplier_id: c.supplier_id,
        concepto: c.concepto,
        categoria: c.categoria,
        monto_total: c.monto_total,
        vencimiento: c.vencimiento,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuentas-por-pagar', tenantId] }),
  })
}

// Abono a una cuenta: el saldo lo valida y recalcula el servidor (RPC).
export function useRegistrarAbono(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { payableId: string; monto: number; metodo: MetodoPago }) => {
      const { error } = await supabase.rpc('registrar_abono', {
        p_tenant: tenantId!,
        p_payable: a.payableId,
        p_monto: a.monto,
        p_metodo: a.metodo,
        p_idempotencia: crypto.randomUUID(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuentas-por-pagar', tenantId] })
      qc.invalidateQueries({ queryKey: ['flujo-caja', tenantId] })
    },
  })
}

// Cancela una cuenta (no se borra: deja rastro contable).
export function useCancelarCuenta(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payables')
        .update({ estado: 'cancelada' })
        .eq('id', id)
        .eq('tenant_id', tenantId!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuentas-por-pagar', tenantId] }),
  })
}

// ----------------------------------------------------------------------------
// Gestión completa de gastos (listar / editar / eliminar). El alta rápida con
// soporte offline vive en features/reports; aquí el admin administra los ya
// registrados dentro de un periodo.
// ----------------------------------------------------------------------------

export interface Gasto {
  id: string
  concepto: string
  monto: number
  categoria_gasto: string | null
  metodo_pago: MetodoPago
  creado_en: string
}

export function useGastos(tenantId: string | null, periodo: Periodo, ancla: Date) {
  const rango = rangoDe(periodo, ancla)
  return useQuery({
    queryKey: ['gastos', tenantId, periodo, rango.inicio.toISOString()],
    enabled: !!tenantId,
    queryFn: async (): Promise<Gasto[]> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, concepto, monto, categoria_gasto, metodo_pago, creado_en')
        .eq('tenant_id', tenantId!)
        .gte('creado_en', rango.inicio.toISOString())
        .lt('creado_en', rango.fin.toISOString())
        .order('creado_en', { ascending: false })
      if (error) throw error
      return (data ?? []).map((g: any) => ({
        id: g.id,
        concepto: g.concepto,
        monto: Number(g.monto),
        categoria_gasto: g.categoria_gasto,
        metodo_pago: (g.metodo_pago ?? 'efectivo') as MetodoPago,
        creado_en: g.creado_en,
      }))
    },
  })
}

export interface GastoEditable {
  id?: string
  concepto: string
  monto: number
  categoria_gasto: string | null
  metodo_pago: MetodoPago
}

export function useGuardarGasto(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: GastoEditable) => {
      const fila = {
        concepto: g.concepto,
        monto: g.monto,
        categoria_gasto: g.categoria_gasto,
        metodo_pago: g.metodo_pago,
      }
      if (g.id) {
        const { error } = await supabase
          .from('expenses')
          .update(fila)
          .eq('id', g.id)
          .eq('tenant_id', tenantId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('expenses').insert({ tenant_id: tenantId!, ...fila })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos', tenantId] })
      qc.invalidateQueries({ queryKey: ['flujo-caja', tenantId] })
      qc.invalidateQueries({ queryKey: ['reporte'] })
    },
  })
}

export function useEliminarGasto(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos', tenantId] })
      qc.invalidateQueries({ queryKey: ['flujo-caja', tenantId] })
      qc.invalidateQueries({ queryKey: ['reporte'] })
    },
  })
}

// ----------------------------------------------------------------------------
// Flujo de caja del periodo: entradas vs salidas. La "caja" es el efectivo;
// se muestran también los movimientos por otros métodos como referencia.
// ----------------------------------------------------------------------------

export interface FlujoCaja {
  entradasEfectivo: number // ventas en efectivo
  entradasOtras: number // ventas tarjeta + transferencia
  salidasGastos: number // gastos en efectivo
  salidasAbonos: number // abonos a proveedores en efectivo
  salidasGastosOtras: number // gastos no-efectivo (referencia)
  salidasAbonosOtras: number // abonos no-efectivo (referencia)
  saldoEfectivo: number // entradasEfectivo - (salidasGastos + salidasAbonos)
}

export function useFlujoCaja(tenantId: string | null, periodo: Periodo, ancla: Date) {
  const rango = rangoDe(periodo, ancla)
  return useQuery({
    queryKey: ['flujo-caja', tenantId, periodo, rango.inicio.toISOString()],
    enabled: !!tenantId,
    queryFn: async (): Promise<FlujoCaja> => {
      const desde = rango.inicio.toISOString()
      const hasta = rango.fin.toISOString()

      const [ventasRes, gastosRes, abonosRes] = await Promise.all([
        supabase
          .from('sales')
          .select('total, metodo_pago')
          .eq('tenant_id', tenantId!)
          .eq('estado_venta', 'completada')
          .gte('creado_en', desde)
          .lt('creado_en', hasta),
        supabase
          .from('expenses')
          .select('monto, metodo_pago')
          .eq('tenant_id', tenantId!)
          .gte('creado_en', desde)
          .lt('creado_en', hasta),
        supabase
          .from('payable_payments')
          .select('monto, metodo_pago')
          .eq('tenant_id', tenantId!)
          .gte('creado_en', desde)
          .lt('creado_en', hasta),
      ])
      if (ventasRes.error) throw ventasRes.error
      if (gastosRes.error) throw gastosRes.error
      if (abonosRes.error) throw abonosRes.error

      const f: FlujoCaja = {
        entradasEfectivo: 0,
        entradasOtras: 0,
        salidasGastos: 0,
        salidasAbonos: 0,
        salidasGastosOtras: 0,
        salidasAbonosOtras: 0,
        saldoEfectivo: 0,
      }

      for (const v of ventasRes.data ?? []) {
        const m = Number(v.total)
        if (v.metodo_pago === 'efectivo') f.entradasEfectivo += m
        else f.entradasOtras += m
      }
      for (const g of gastosRes.data ?? []) {
        const m = Number(g.monto)
        if ((g.metodo_pago ?? 'efectivo') === 'efectivo') f.salidasGastos += m
        else f.salidasGastosOtras += m
      }
      for (const a of abonosRes.data ?? []) {
        const m = Number(a.monto)
        if ((a.metodo_pago ?? 'efectivo') === 'efectivo') f.salidasAbonos += m
        else f.salidasAbonosOtras += m
      }
      f.saldoEfectivo = f.entradasEfectivo - (f.salidasGastos + f.salidasAbonos)
      return f
    },
  })
}

// ----------------------------------------------------------------------------
// Inventario valorizado: cuánto vale el stock al costo, y qué está bajo mínimo.
// ----------------------------------------------------------------------------

export interface ItemInventario {
  id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
  costo: number
  valor: number // stock_actual * costo
  bajo: boolean // stock <= mínimo
}

export interface InventarioValorizado {
  items: ItemInventario[]
  valorTotal: number
  numBajoStock: number
}

export function useInventarioValorizado(tenantId: string | null) {
  return useQuery({
    queryKey: ['inventario-valorizado', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<InventarioValorizado> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, nombre, stock_actual, stock_minimo, costo')
        .eq('tenant_id', tenantId!)
        .eq('controla_stock', true)
        .order('nombre')
      if (error) throw error

      let valorTotal = 0
      let numBajoStock = 0
      const items: ItemInventario[] = (data ?? []).map((p: any) => {
        const stock = Number(p.stock_actual)
        const costo = Number(p.costo)
        const minimo = Number(p.stock_minimo)
        const valor = stock * costo
        const bajo = stock <= minimo
        valorTotal += valor
        if (bajo) numBajoStock += 1
        return {
          id: p.id,
          nombre: p.nombre,
          stock_actual: stock,
          stock_minimo: minimo,
          costo,
          valor,
          bajo,
        }
      })

      // Más valiosos primero (para que el resumen muestre lo importante).
      items.sort((a, b) => b.valor - a.valor)
      return { items, valorTotal, numBajoStock }
    },
  })
}

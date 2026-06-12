import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { encolar } from '@/lib/offlineQueue'

// ============================================================================
// Periodos y rangos de fecha (todo en hora local del dispositivo).
// ============================================================================

export type Periodo = 'dia' | 'semana' | 'mes' | 'anio'

export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'anio', label: 'Año' },
]

export interface Rango {
  inicio: Date
  fin: Date // exclusivo
}

function inicioDeDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function sumarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// Rango [inicio, fin) del periodo que CONTIENE a `ancla`.
export function rangoDe(periodo: Periodo, ancla: Date): Rango {
  switch (periodo) {
    case 'dia': {
      const inicio = inicioDeDia(ancla)
      return { inicio, fin: sumarDias(inicio, 1) }
    }
    case 'semana': {
      // Semana de lunes a domingo.
      const base = inicioDeDia(ancla)
      const offset = (base.getDay() + 6) % 7 // 0 = lunes
      const inicio = sumarDias(base, -offset)
      return { inicio, fin: sumarDias(inicio, 7) }
    }
    case 'mes': {
      const inicio = new Date(ancla.getFullYear(), ancla.getMonth(), 1)
      const fin = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 1)
      return { inicio, fin }
    }
    case 'anio': {
      const inicio = new Date(ancla.getFullYear(), 0, 1)
      const fin = new Date(ancla.getFullYear() + 1, 0, 1)
      return { inicio, fin }
    }
  }
}

// Devuelve un ancla en el periodo anterior/siguiente (dir = -1 o +1).
export function desplazar(periodo: Periodo, ancla: Date, dir: -1 | 1): Date {
  const { inicio } = rangoDe(periodo, ancla)
  switch (periodo) {
    case 'dia':
      return sumarDias(inicio, dir)
    case 'semana':
      return sumarDias(inicio, 7 * dir)
    case 'mes':
      return new Date(inicio.getFullYear(), inicio.getMonth() + dir, 1)
    case 'anio':
      return new Date(inicio.getFullYear() + dir, 0, 1)
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Etiqueta legible del periodo activo (encabezado del navegador de fechas).
export function etiquetaRango(periodo: Periodo, ancla: Date): string {
  const { inicio } = rangoDe(periodo, ancla)
  switch (periodo) {
    case 'dia':
      return `${inicio.getDate()} ${MESES[inicio.getMonth()]} ${inicio.getFullYear()}`
    case 'semana': {
      const fin = sumarDias(inicio, 6)
      return `${inicio.getDate()} ${MESES[inicio.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`
    }
    case 'mes': {
      const m = MESES[inicio.getMonth()]
      return `${m[0].toUpperCase()}${m.slice(1)} ${inicio.getFullYear()}`
    }
    case 'anio':
      return String(inicio.getFullYear())
  }
}

// ¿El periodo activo es el actual? (para deshabilitar el botón "siguiente").
export function esPeriodoActual(periodo: Periodo, ancla: Date): boolean {
  return rangoDe(periodo, new Date()).inicio.getTime() === rangoDe(periodo, ancla).inicio.getTime()
}

// ----------------------------------------------------------------------------
// Cubetas de la serie temporal (barras del gráfico).
// ----------------------------------------------------------------------------

interface Bucket {
  etiqueta: string
  ingresos: number
  utilidad: number
}

function plantillaBuckets(periodo: Periodo, rango: Rango): Bucket[] {
  switch (periodo) {
    case 'dia':
      return Array.from({ length: 24 }, (_, h) => ({
        etiqueta: `${h}`,
        ingresos: 0,
        utilidad: 0,
      }))
    case 'semana':
      return DIAS.map((d) => ({ etiqueta: d, ingresos: 0, utilidad: 0 }))
    case 'mes': {
      const dias = new Date(rango.inicio.getFullYear(), rango.inicio.getMonth() + 1, 0).getDate()
      return Array.from({ length: dias }, (_, i) => ({
        etiqueta: `${i + 1}`,
        ingresos: 0,
        utilidad: 0,
      }))
    }
    case 'anio':
      return MESES.map((m) => ({ etiqueta: m[0].toUpperCase() + m.slice(1), ingresos: 0, utilidad: 0 }))
  }
}

function indiceBucket(periodo: Periodo, fecha: Date): number {
  switch (periodo) {
    case 'dia':
      return fecha.getHours()
    case 'semana':
      return (fecha.getDay() + 6) % 7
    case 'mes':
      return fecha.getDate() - 1
    case 'anio':
      return fecha.getMonth()
  }
}

// ============================================================================
// Reporte agregado
// ============================================================================

export interface Reporte {
  ingresos: number
  costos: number
  utilidadBruta: number
  gastos: number
  descuentos: number // promos + descuentos manuales (informativo)
  utilidadNeta: number
  numVentas: number
  ticketPromedio: number
  margen: number // utilidad neta sobre ingresos, en %
  porMetodo: Record<string, number>
  gastosPorCategoria: { categoria: string; monto: number }[]
  topProductos: { nombre: string; cantidad: number; importe: number }[]
  serie: Bucket[]
}

export function useReporte(tenantId: string | null, periodo: Periodo, ancla: Date) {
  const rango = rangoDe(periodo, ancla)
  return useQuery({
    queryKey: ['reporte', tenantId, periodo, rango.inicio.toISOString()],
    enabled: !!tenantId,
    queryFn: async (): Promise<Reporte> => {
      const desde = rango.inicio.toISOString()
      const hasta = rango.fin.toISOString()

      const [ventasRes, gastosRes, itemsRes] = await Promise.all([
        supabase
          .from('sales')
          .select('total, costo_total, utilidad, descuento_total, metodo_pago, creado_en')
          .eq('tenant_id', tenantId!)
          .eq('estado_venta', 'completada')
          .gte('creado_en', desde)
          .lt('creado_en', hasta),
        supabase
          .from('expenses')
          .select('monto, categoria_gasto, creado_en')
          .eq('tenant_id', tenantId!)
          .gte('creado_en', desde)
          .lt('creado_en', hasta),
        supabase
          .from('sale_items')
          .select('nombre_snapshot, cantidad, subtotal, sales!inner(creado_en, estado_venta)')
          .eq('tenant_id', tenantId!)
          .eq('sales.estado_venta', 'completada')
          .gte('sales.creado_en', desde)
          .lt('sales.creado_en', hasta),
      ])

      if (ventasRes.error) throw ventasRes.error
      if (gastosRes.error) throw gastosRes.error
      if (itemsRes.error) throw itemsRes.error

      const ventas = ventasRes.data ?? []
      const gastosFilas = gastosRes.data ?? []
      const items = itemsRes.data ?? []

      // Totales de ventas.
      let ingresos = 0
      let costos = 0
      let utilidadBruta = 0
      let descuentos = 0
      const porMetodo: Record<string, number> = {}
      const serie = plantillaBuckets(periodo, rango)
      for (const v of ventas) {
        const total = Number(v.total)
        ingresos += total
        costos += Number(v.costo_total)
        utilidadBruta += Number(v.utilidad)
        descuentos += Number(v.descuento_total ?? 0)
        porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] ?? 0) + total
        const idx = indiceBucket(periodo, new Date(v.creado_en))
        if (serie[idx]) {
          serie[idx].ingresos += total
          serie[idx].utilidad += Number(v.utilidad)
        }
      }

      // Gastos.
      let gastos = 0
      const gastoCat: Record<string, number> = {}
      for (const g of gastosFilas) {
        const monto = Number(g.monto)
        gastos += monto
        const cat = g.categoria_gasto?.trim() || 'Sin categoría'
        gastoCat[cat] = (gastoCat[cat] ?? 0) + monto
      }

      // Top productos por importe vendido.
      const prod: Record<string, { cantidad: number; importe: number }> = {}
      for (const it of items) {
        const k = it.nombre_snapshot
        if (!prod[k]) prod[k] = { cantidad: 0, importe: 0 }
        prod[k].cantidad += Number(it.cantidad)
        prod[k].importe += Number(it.subtotal)
      }

      const numVentas = ventas.length
      const utilidadNeta = utilidadBruta - gastos

      return {
        ingresos,
        costos,
        utilidadBruta,
        gastos,
        descuentos,
        utilidadNeta,
        numVentas,
        ticketPromedio: numVentas ? ingresos / numVentas : 0,
        margen: ingresos ? (utilidadNeta / ingresos) * 100 : 0,
        porMetodo,
        gastosPorCategoria: Object.entries(gastoCat)
          .map(([categoria, monto]) => ({ categoria, monto }))
          .sort((a, b) => b.monto - a.monto),
        topProductos: Object.entries(prod)
          .map(([nombre, v]) => ({ nombre, ...v }))
          .sort((a, b) => b.importe - a.importe)
          .slice(0, 8),
        serie,
      }
    },
  })
}

// ----------------------------------------------------------------------------
// Alta de gastos (alimenta los reportes).
// ----------------------------------------------------------------------------

export interface NuevoGasto {
  concepto: string
  monto: number
  categoria_gasto: string | null
}

export function useAgregarGasto(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: NuevoGasto) => {
      await encolar({
        id: crypto.randomUUID(),
        tipo: 'gasto',
        tenantId: tenantId!,
        payload: { concepto: g.concepto, monto: g.monto, categoria_gasto: g.categoria_gasto },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reporte'] })
    },
  })
}

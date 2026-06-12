import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { estaOnline } from '@/lib/online'
import { encolar } from '@/lib/offlineQueue'
import type { Customer } from '@/lib/types'
import type { CartLine } from './cartStore'

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia'

// Identifica/crea un cliente por teléfono y devuelve su contador de compras.
export function useRegistrarCliente(tenantId: string) {
  return useMutation({
    mutationFn: async (datos: { telefono: string; nombre?: string }): Promise<Customer> => {
      const { data, error } = await supabase.rpc('registrar_cliente', {
        p_tenant: tenantId,
        p_telefono: datos.telefono,
        p_nombre: datos.nombre ?? null,
      })
      if (error) throw error
      return data as Customer
    },
  })
}

// Línea de venta: la del carrito + la promo aplicada por el motor.
export type LineaVenta = CartLine & {
  descuento?: number
  promo?: string | null
}

// Descuento manual del ticket (solo admin; el servidor lo re-valida).
export interface DescuentoManual {
  monto: number
  motivo: string | null
}

export interface VentaInput {
  lineas: LineaVenta[]
  metodo_pago: MetodoPago
  monto_recibido?: number | null
  cliente_id?: string | null
  descuento_manual?: number
  descuento_motivo?: string | null
}

export interface VentaResultado {
  offline: boolean
  cambio: number | null
}

// Registra la venta SIN esperar a la red: la guarda en la cola local (operación
// instantánea, nunca se cuelga) y el SyncProvider la envía al servidor por
// detrás —al momento si hay internet, o al reconectar si no—. El token de
// idempotencia evita duplicados aunque se reintente. El cobro es inmediato.
export function useCreateSale(tenantId: string) {
  return useMutation({
    mutationFn: async (v: VentaInput): Promise<VentaResultado> => {
      const items = v.lineas.map((l) => ({
        product_id: l.product_id,
        nombre: l.nombre,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario, // ya incluye los extras
        variante: null,
        modificadores: l.modificadores,
        notas: l.notas,
        descuento: l.descuento ?? 0,
        promo: l.promo ?? null,
      }))
      const payload = {
        items,
        metodo_pago: v.metodo_pago,
        monto_recibido: v.monto_recibido ?? null,
        cliente_id: v.cliente_id ?? null,
        descuento_manual: v.descuento_manual ?? 0,
        descuento_motivo: v.descuento_motivo ?? null,
      }
      await encolar({ id: crypto.randomUUID(), tipo: 'venta', tenantId, payload })

      const bruto = v.lineas.reduce(
        (s, l) => s + l.precio_unitario * l.cantidad - (l.descuento ?? 0),
        0,
      )
      const total = Math.max(bruto - (v.descuento_manual ?? 0), 0)
      const cambio =
        v.metodo_pago === 'efectivo' && v.monto_recibido != null
          ? Math.max(v.monto_recibido - total, 0)
          : null

      return { offline: !estaOnline(), cambio }
    },
  })
}

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ResumenDia {
  ventas: number
  ingresos: number
  utilidad: number
  ticketPromedio: number
  porMetodo: Record<string, number>
}

// Inicio del día local en ISO, para filtrar las ventas de hoy.
function inicioDeHoy(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function useResumenDia(tenantId: string | null) {
  return useQuery({
    queryKey: ['dashboard', tenantId],
    enabled: !!tenantId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ResumenDia> => {
      const { data, error } = await supabase
        .from('sales')
        .select('total, utilidad, metodo_pago')
        .eq('estado_venta', 'completada')
        .gte('creado_en', inicioDeHoy())
      if (error) throw error

      const filas = data ?? []
      const ingresos = filas.reduce((s, v) => s + Number(v.total), 0)
      const utilidad = filas.reduce((s, v) => s + Number(v.utilidad), 0)
      const porMetodo: Record<string, number> = {}
      for (const v of filas) {
        porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] ?? 0) + Number(v.total)
      }

      return {
        ventas: filas.length,
        ingresos,
        utilidad,
        ticketPromedio: filas.length ? ingresos / filas.length : 0,
        porMetodo,
      }
    },
  })
}

export interface ProductoBajo {
  id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
}

// Productos con stock por debajo del mínimo (alertas de inventario).
export function useStockBajo(tenantId: string | null) {
  return useQuery({
    queryKey: ['stock-bajo', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ProductoBajo[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, nombre, stock_actual, stock_minimo')
        .eq('controla_stock', true)
      if (error) throw error
      return (data ?? []).filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo))
    },
  })
}

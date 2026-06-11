import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type EstadoCocina = 'pendiente' | 'en_preparacion' | 'completada'

export interface KitchenItem {
  id: string
  nombre_snapshot: string
  cantidad: number
  modificadores: { nombre: string; precio: number }[]
  notas: string | null
}

export interface KitchenOrder {
  id: string
  folio: number
  estado_cocina: EstadoCocina
  creado_en: string
  sale_items: KitchenItem[]
}

// Comandas activas (pendientes y en preparación). Se refresca por polling
// cada 5s; la sincronización en tiempo real (Realtime) es una mejora futura.
export function useKitchenOrders(tenantId: string | null) {
  return useQuery({
    queryKey: ['kitchen', tenantId],
    enabled: !!tenantId,
    refetchInterval: 5000,
    queryFn: async (): Promise<KitchenOrder[]> => {
      const { data, error } = await supabase
        .from('sales')
        .select(
          'id, folio, estado_cocina, creado_en, sale_items(id, nombre_snapshot, cantidad, modificadores, notas)',
        )
        .in('estado_cocina', ['pendiente', 'en_preparacion'])
        .eq('estado_venta', 'completada')
        .order('creado_en', { ascending: true })
      if (error) throw error
      return (data as KitchenOrder[]) ?? []
    },
  })
}

export function useAdvanceOrder(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoCocina }) => {
      const { error } = await supabase.rpc('avanzar_cocina', {
        p_sale: id,
        p_estado: estado,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen', tenantId] }),
  })
}

import { useEffect } from 'react'
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

// Suscripción Realtime: cuando entra una venta del negocio (o cambia su
// estado), invalida las comandas al instante. Requiere la migración 0008
// (publicar `sales` en supabase_realtime); los eventos respetan RLS.
export function useRealtimeCocina(tenantId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!tenantId) return
    const canal = supabase
      .channel(`kds-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['kitchen', tenantId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [tenantId, qc])
}

// Comandas activas (pendientes y en preparación). Realtime las actualiza al
// instante; el polling queda como respaldo por si el socket se cae.
export function useKitchenOrders(tenantId: string | null) {
  return useQuery({
    queryKey: ['kitchen', tenantId],
    enabled: !!tenantId,
    refetchInterval: 30_000,
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

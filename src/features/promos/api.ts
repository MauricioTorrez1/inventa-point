import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ----------------------------------------------------------------------------
// Promociones automáticas: porcentaje, precio fijo o NxM (2x1, 3x2...) sobre
// un producto o una categoría, con vigencia opcional.
// ----------------------------------------------------------------------------
export type TipoPromo = 'porcentaje' | 'precio_fijo' | 'nxm'

export interface Promotion {
  id: string
  nombre: string
  tipo: TipoPromo
  valor: number
  n: number | null
  m: number | null
  producto_id: string | null
  categoria_id: string | null
  inicia: string | null
  termina: string | null
  activo: boolean
}

function leerCache<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

export function usePromos(tenantId: string | null) {
  return useQuery({
    queryKey: ['promos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Promotion[]> => {
      const cacheKey = `cache.promos.${tenantId}`
      try {
        const { data, error } = await supabase
          .from('promotions')
          .select('id, nombre, tipo, valor, n, m, producto_id, categoria_id, inicia, termina, activo')
          .order('creado_en', { ascending: false })
        if (error) throw error
        const filas = data ?? []
        try {
          localStorage.setItem(cacheKey, JSON.stringify(filas))
        } catch {
          /* sin espacio: se ignora */
        }
        return filas
      } catch (e) {
        const cache = leerCache<Promotion[]>(cacheKey)
        if (cache) return cache
        throw e
      }
    },
  })
}

export interface PromoInput {
  nombre: string
  tipo: TipoPromo
  valor: number
  n: number | null
  m: number | null
  producto_id: string | null
  categoria_id: string | null
  inicia: string | null
  termina: string | null
}

export function useSavePromo(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: PromoInput) => {
      const { error } = await supabase
        .from('promotions')
        .insert({ tenant_id: tenantId, ...p })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promos', tenantId] }),
  })
}

export function useTogglePromo(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('promotions').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promos', tenantId] }),
  })
}

export function useDeletePromo(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('promotions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promos', tenantId] }),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ----------------------------------------------------------------------------
// Combos: paquete con precio especial. Cada espacio (slot) es "elige 1 de la
// categoría X" o un producto fijo incluido siempre.
// ----------------------------------------------------------------------------
export interface ComboSlot {
  id: string
  etiqueta: string | null
  categoria_id: string | null
  producto_id: string | null
  orden: number
}

export interface Combo {
  id: string
  nombre: string
  precio: number
  activo: boolean
  combo_slots: ComboSlot[]
}

function leerCache<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

export function useCombos(tenantId: string | null) {
  return useQuery({
    queryKey: ['combos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Combo[]> => {
      const cacheKey = `cache.combos.${tenantId}`
      try {
        const { data, error } = await supabase
          .from('combos')
          .select('id, nombre, precio, activo, combo_slots(id, etiqueta, categoria_id, producto_id, orden)')
          .order('creado_en', { ascending: false })
        if (error) throw error
        const filas = (data ?? []).map((c) => ({
          ...c,
          combo_slots: [...(c.combo_slots ?? [])].sort((a, b) => a.orden - b.orden),
        }))
        try {
          localStorage.setItem(cacheKey, JSON.stringify(filas))
        } catch {
          /* sin espacio: se ignora */
        }
        return filas
      } catch (e) {
        const cache = leerCache<Combo[]>(cacheKey)
        if (cache) return cache
        throw e
      }
    },
  })
}

export interface SlotInput {
  etiqueta: string | null
  categoria_id: string | null
  producto_id: string | null
}

export function useSaveCombo(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { nombre: string; precio: number; slots: SlotInput[] }) => {
      // Inserta el combo y luego sus espacios; si los espacios fallan, se
      // elimina el combo para no dejarlo a medias.
      const { data, error } = await supabase
        .from('combos')
        .insert({ tenant_id: tenantId, nombre: c.nombre, precio: c.precio })
        .select('id')
        .single()
      if (error) throw error
      const comboId = (data as { id: string }).id

      const { error: errSlots } = await supabase.from('combo_slots').insert(
        c.slots.map((s, i) => ({
          tenant_id: tenantId,
          combo_id: comboId,
          etiqueta: s.etiqueta,
          categoria_id: s.categoria_id,
          producto_id: s.producto_id,
          orden: i,
        })),
      )
      if (errSlots) {
        await supabase.from('combos').delete().eq('id', comboId)
        throw errSlots
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos', tenantId] }),
  })
}

export function useToggleCombo(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('combos').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos', tenantId] }),
  })
}

export function useDeleteCombo(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('combos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos', tenantId] }),
  })
}

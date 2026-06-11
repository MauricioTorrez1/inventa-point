import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Rol } from '@/lib/types'

export interface Miembro {
  user_id: string
  email: string
  rol: Rol
  creado_en: string
}

// Lista de miembros del negocio (con correo) vía RPC SECURITY DEFINER.
export function useMiembros(tenantId: string | null) {
  return useQuery({
    queryKey: ['miembros', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Miembro[]> => {
      const { data, error } = await supabase.rpc('tenant_miembros', { p_tenant: tenantId })
      if (error) throw error
      return (data as Miembro[]) ?? []
    },
  })
}

// Genera un código de invitación para un rol y lo devuelve.
export function useCrearInvitacion(tenantId: string | null) {
  return useMutation({
    mutationFn: async (rol: Rol): Promise<string> => {
      const { data, error } = await supabase.rpc('crear_invitacion', {
        p_tenant: tenantId,
        p_rol: rol,
      })
      if (error) throw error
      return data as string
    },
  })
}

export function useCambiarRol(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, rol }: { userId: string; rol: Rol }) => {
      const { error } = await supabase
        .from('memberships')
        .update({ rol })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['miembros', tenantId] }),
  })
}

export function useQuitarMiembro(tenantId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['miembros', tenantId] }),
  })
}

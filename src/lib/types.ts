// Tipos del dominio (espejo del esquema SQL). En etapas posteriores se pueden
// autogenerar con `supabase gen types`, pero a mano son suficientes y claros.

export type Rol = 'admin' | 'cajero' | 'cocina'

export interface Tenant {
  id: string
  nombre: string
  logo_url: string | null
  color_acento: string
  modo_tema: 'claro' | 'oscuro' | 'auto'
  moneda: string
  plan: 'gratis' | 'pro'
  kds_activo: boolean
  lealtad_activa: boolean
  lealtad_meta: number
  lealtad_premio: string | null
  creado_en: string
}

// Cliente frecuente (fidelización por teléfono).
export interface Customer {
  id: string
  telefono: string
  nombre: string | null
  compras: number
}

export interface Membership {
  id: string
  tenant_id: string
  user_id: string
  rol: Rol
  creado_en: string
}

// Membresía + datos del negocio, tal como la consume el front.
export interface MembershipWithTenant extends Membership {
  tenants: Tenant
}

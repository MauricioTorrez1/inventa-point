import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { MembershipWithTenant, Rol, Tenant } from '@/lib/types'
import { applyAccent, applyTheme } from '@/lib/theme'
import { aplicarMoneda } from '@/lib/format'

const ACTIVE_TENANT_KEY = 'pos.activeTenantId'

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  memberships: MembershipWithTenant[]
  activeTenantId: string | null
  tenant: Tenant | null
  rol: Rol | null
  setActiveTenant: (tenantId: string) => void
  refreshMemberships: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<MembershipWithTenant[]>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_TENANT_KEY),
  )

  const loadMemberships = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setMemberships([])
      return
    }
    const { data, error } = await supabase
      .from('memberships')
      .select('*, tenants(*)')
      .order('creado_en', { ascending: true })
    if (error) {
      console.error('Error cargando membresías:', error.message)
      setMemberships([])
      return
    }
    setMemberships((data as MembershipWithTenant[]) ?? [])
  }, [])

  // Suscripción al estado de sesión de Supabase.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadMemberships(data.session?.user.id).finally(() => setLoading(false))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadMemberships(newSession?.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadMemberships])

  // Membresía/tenant activos.
  const activeMembership = useMemo(() => {
    if (memberships.length === 0) return null
    return (
      memberships.find((m) => m.tenant_id === activeTenantId) ?? memberships[0]
    )
  }, [memberships, activeTenantId])

  const tenant = activeMembership?.tenants ?? null
  const rol = activeMembership?.rol ?? null

  // Aplica marca (acento + tema) cuando cambia el tenant activo.
  useEffect(() => {
    if (!tenant) return
    applyAccent(tenant.color_acento)
    applyTheme(tenant.modo_tema)
    aplicarMoneda(tenant.moneda)
  }, [tenant])

  const setActiveTenant = useCallback((tenantId: string) => {
    localStorage.setItem(ACTIVE_TENANT_KEY, tenantId)
    setActiveTenantId(tenantId)
  }, [])

  const refreshMemberships = useCallback(
    () => loadMemberships(session?.user.id),
    [loadMemberships, session],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(ACTIVE_TENANT_KEY)
    setActiveTenantId(null)
  }, [])

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    memberships,
    activeTenantId: activeMembership?.tenant_id ?? null,
    tenant,
    rol,
    setActiveTenant,
    refreshMemberships,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

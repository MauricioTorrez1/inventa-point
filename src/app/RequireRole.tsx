import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Rol } from '@/lib/types'

// Restringe una ruta a ciertos roles. Si el rol activo no está permitido,
// redirige al inicio (la cocina, p.ej., no debe ver el catálogo).
export function RequireRole({
  roles,
  children,
}: {
  roles: Rol[]
  children: React.ReactNode
}) {
  const { rol } = useAuth()
  if (!rol || !roles.includes(rol)) {
    const inicio = rol === 'cocina' ? '/cocina' : '/'
    return <Navigate to={inicio} replace />
  }
  return <>{children}</>
}

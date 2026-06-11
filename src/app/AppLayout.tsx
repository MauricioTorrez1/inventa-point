import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSync } from '@/features/offline/SyncProvider'
import type { Rol } from '@/lib/types'

interface NavItem {
  to: string
  label: string
  icon: string
  roles: Rol[]
}

// Navegación inferior. Se acota a ≤5 destinos por rol; el resto del admin
// vive en el hub "Más" (/mas) para mantener la barra limpia en el iPad.
const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: '🏠', roles: ['admin', 'cajero'] },
  { to: '/venta', label: 'Vender', icon: '🛒', roles: ['admin', 'cajero'] },
  { to: '/cocina', label: 'Cocina', icon: '🍳', roles: ['cocina'] },
  { to: '/caja', label: 'Caja', icon: '💵', roles: ['cajero'] },
  { to: '/reportes', label: 'Reportes', icon: '📊', roles: ['admin'] },
  { to: '/catalogo', label: 'Catálogo', icon: '📦', roles: ['admin'] },
  { to: '/mas', label: 'Más', icon: '☰', roles: ['admin'] },
]

export function AppLayout() {
  const { tenant, rol, memberships, activeTenantId, setActiveTenant, signOut } =
    useAuth()
  const location = useLocation()

  const items = NAV.filter((i) => rol && i.roles.includes(rol))

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior con la marca del negocio (se mantiene fija, respeta el notch). */}
      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/70 px-4 pb-3 pt-safe backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt=""
              className="h-10 w-10 rounded-2xl object-cover shadow-soft"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-base font-bold text-accent-fg shadow-soft">
              {tenant?.nombre?.charAt(0).toUpperCase() ?? '?'}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{tenant?.nombre}</p>
            <p className="text-xs capitalize text-slate-500">{rol}</p>
          </div>

          {/* Conmutador de negocio si el usuario pertenece a varios. */}
          {memberships.length > 1 && (
            <select
              value={activeTenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="max-w-[8rem] rounded-xl border border-slate-200 bg-white/60 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900/60"
            >
              {memberships.map((m) => (
                <option key={m.tenant_id} value={m.tenant_id}>
                  {m.tenants.nombre}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={signOut}
            className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Estado de conexión / sincronización. */}
      <SyncBanner />

      {/* Contenido de la ruta activa (con transición suave al cambiar de ruta). */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div key={location.pathname} className="animate-fade-in h-full">
          <Outlet />
        </div>
      </main>

      {/* (Banner de sincronización definido abajo) */}

      {/* Navegación inferior flotante (mobile-first, también cómoda en iPad). */}
      <nav className="px-3 pb-safe">
        <div className="mx-auto mb-2 flex max-w-lg items-center justify-around gap-1 rounded-[1.75rem] border border-slate-200/70 bg-white/80 p-1.5 shadow-soft backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/80">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[0.7rem] font-medium transition ${
                  isActive
                    ? 'bg-[rgb(var(--accent)/0.12)] text-accent'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`
              }
            >
              <span className="text-xl leading-none">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

// Barra fina que avisa si no hay conexión o hay ventas/gastos por sincronizar.
function SyncBanner() {
  const { online, pendientes, sincronizando } = useSync()
  if (online && pendientes === 0) return null

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium ${
        online
          ? 'bg-[rgb(var(--accent)/0.12)] text-accent'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
      }`}
    >
      {!online && <span>📴 Sin conexión — las ventas se guardan en el dispositivo</span>}
      {online && sincronizando && <span>🔄 Sincronizando…</span>}
      {pendientes > 0 && (
        <span>
          {online && !sincronizando ? '⏳ ' : '· '}
          {pendientes} por sincronizar
        </span>
      )}
    </div>
  )
}

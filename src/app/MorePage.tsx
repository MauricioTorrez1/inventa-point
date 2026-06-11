import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'

interface Acceso {
  to: string
  icon: string
  titulo: string
  desc: string
}

const ACCESOS: Acceso[] = [
  { to: '/cocina', icon: '🍳', titulo: 'Cocina', desc: 'Pantalla de preparación (KDS)' },
  { to: '/caja', icon: '💵', titulo: 'Corte de caja', desc: 'Arqueo de efectivo del turno' },
  { to: '/equipo', icon: '👥', titulo: 'Equipo', desc: 'Invitar y gestionar roles' },
  { to: '/ajustes', icon: '⚙️', titulo: 'Ajustes', desc: 'Marca, moneda y logo del negocio' },
]

export function MorePage() {
  const { tenant, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-28">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Más opciones</h1>
        <p className="text-sm text-slate-500">{tenant?.nombre}</p>
      </div>

      <div className="stagger space-y-3">
        {ACCESOS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card flex items-center gap-4 transition active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent)/0.1)] text-2xl">
              {a.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{a.titulo}</span>
              <span className="block text-sm text-slate-500">{a.desc}</span>
            </span>
            <span className="text-slate-300">›</span>
          </Link>
        ))}
      </div>

      <button onClick={signOut} className="btn-neutral w-full py-3">
        Cerrar sesión
      </button>

      <p className="text-center text-xs text-slate-400">Versión {__BUILD_ID__}</p>
    </div>
  )
}

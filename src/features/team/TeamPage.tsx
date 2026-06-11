import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Rol } from '@/lib/types'
import {
  useCambiarRol,
  useCrearInvitacion,
  useMiembros,
  useQuitarMiembro,
} from './api'

const ROLES: { id: Rol; label: string; desc: string }[] = [
  { id: 'admin', label: 'Admin', desc: 'Acceso total' },
  { id: 'cajero', label: 'Cajero', desc: 'Venta, caja e inicio' },
  { id: 'cocina', label: 'Cocina', desc: 'Solo pantalla de cocina' },
]

export function TeamPage() {
  const { activeTenantId, user } = useAuth()
  const miembros = useMiembros(activeTenantId)
  const cambiarRol = useCambiarRol(activeTenantId)
  const quitar = useQuitarMiembro(activeTenantId)
  const crearInvitacion = useCrearInvitacion(activeTenantId)

  const [rolInvitado, setRolInvitado] = useState<Rol>('cajero')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function generar() {
    setCodigo(null)
    const c = await crearInvitacion.mutateAsync(rolInvitado)
    setCodigo(c)
  }

  async function copiar() {
    if (!codigo) return
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin portapapeles: el usuario copia a mano */
    }
  }

  const soloUnAdmin =
    (miembros.data?.filter((m) => m.rol === 'admin').length ?? 0) <= 1

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Equipo</h1>

      {/* Invitar. */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Invitar a alguien</h2>
        <p className="text-sm text-slate-500">
          Genera un código y compártelo. La persona se registra en la app y lo
          ingresa en “Unirme a un negocio”.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRolInvitado(r.id)}
              className={`rounded-2xl border py-2.5 text-sm font-medium transition ${
                rolInvitado === r.id
                  ? 'border-accent bg-[rgb(var(--accent)/0.1)] text-accent'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          onClick={generar}
          disabled={crearInvitacion.isPending}
          className="btn-accent w-full py-2.5 text-sm"
        >
          {crearInvitacion.isPending ? 'Generando…' : 'Generar código'}
        </button>

        {crearInvitacion.isError && (
          <p className="text-sm text-red-600">No se pudo generar el código.</p>
        )}

        {codigo && (
          <button
            onClick={copiar}
            className="flex w-full items-center justify-between rounded-2xl border border-dashed border-accent bg-[rgb(var(--accent)/0.06)] px-4 py-3"
          >
            <span className="font-mono text-xl font-bold tracking-widest text-accent">
              {codigo}
            </span>
            <span className="text-xs text-slate-500">{copiado ? '¡Copiado!' : 'Tocar para copiar'}</span>
          </button>
        )}
      </section>

      {/* Miembros. */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Miembros</h2>
        {miembros.isLoading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : (
          <ul className="space-y-3">
            {miembros.data?.map((m) => {
              const esYo = m.user_id === user?.id
              return (
                <li key={m.user_id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.email} {esYo && <span className="text-xs text-slate-400">(tú)</span>}
                    </p>
                  </div>
                  <select
                    value={m.rol}
                    disabled={esYo && soloUnAdmin}
                    onChange={(e) =>
                      cambiarRol.mutate({ userId: m.user_id, rol: e.target.value as Rol })
                    }
                    className="rounded-xl border border-slate-200 bg-white/60 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900/60"
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {!esYo && (
                    <button
                      onClick={() => {
                        if (confirm(`¿Quitar a ${m.email} del negocio?`)) quitar.mutate(m.user_id)
                      }}
                      className="rounded-xl px-2 py-1.5 text-sm text-slate-400 transition hover:text-red-600"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

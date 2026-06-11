import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { money, entero } from '@/lib/format'
import { useCortes, useRegistrarCorte, useResumenCaja } from './api'

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CashCutPage() {
  const { activeTenantId, user } = useAuth()
  const resumen = useResumenCaja(activeTenantId)
  const cortes = useCortes(activeTenantId)
  const registrar = useRegistrarCorte(activeTenantId, user?.id ?? null)

  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [ok, setOk] = useState(false)

  const esperado = resumen.data?.esperado ?? 0
  const contadoNum = Number(contado || 0)
  const diferencia = contadoNum - esperado

  async function cerrar(e: React.FormEvent) {
    e.preventDefault()
    if (!resumen.data) return
    await registrar.mutateAsync({
      esperado,
      contado: contadoNum,
      turnoInicio: resumen.data.turnoInicio,
      notas: notas.trim() || null,
    })
    setContado('')
    setNotas('')
    setOk(true)
    setTimeout(() => setOk(false), 2500)
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-28">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Corte de caja</h1>
        {resumen.data && (
          <p className="text-sm text-slate-500">
            Turno desde {fechaHora(resumen.data.turnoInicio)}
          </p>
        )}
      </div>

      {/* Efectivo esperado. */}
      <section
        className="rounded-3xl p-5 text-accent-fg shadow-soft"
        style={{ backgroundImage: 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent)/0.82))' }}
      >
        <p className="text-xs opacity-80">Efectivo esperado en caja</p>
        <p className="mt-1 text-3xl font-bold tabular">{money(esperado)}</p>
        <p className="mt-1 text-xs opacity-80">
          {entero(resumen.data?.numVentas ?? 0)} ventas en efectivo este turno
        </p>
      </section>

      {/* Conteo real. */}
      <form onSubmit={cerrar} className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Efectivo contado</label>
          <input
            className="field text-lg"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={contado}
            onChange={(e) => setContado(e.target.value)}
            required
          />
        </div>

        {contado !== '' && (
          <div
            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold ${
              diferencia === 0
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : diferencia > 0
                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400'
                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
            }`}
          >
            <span>{diferencia === 0 ? 'Cuadra' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
            <span className="tabular">{money(Math.abs(diferencia))}</span>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Notas (opcional)</label>
          <input
            className="field"
            placeholder="Ej. retiro de $200 a mitad de turno"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        {registrar.isError && (
          <p className="text-sm text-red-600">No se pudo registrar el corte.</p>
        )}
        {ok && <p className="text-sm text-emerald-600">Corte registrado ✓</p>}

        <button
          type="submit"
          disabled={registrar.isPending || contado === ''}
          className="btn-accent w-full py-3"
        >
          {registrar.isPending ? 'Registrando…' : 'Cerrar caja'}
        </button>
      </form>

      {/* Historial. */}
      {(cortes.data?.length ?? 0) > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Cortes recientes</h2>
          <ul className="space-y-2">
            {cortes.data!.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">{fechaHora(c.turno_fin)}</span>
                <span className="tabular">{money(c.contado)}</span>
                <span
                  className={`w-20 text-right tabular ${
                    Number(c.diferencia) === 0
                      ? 'text-slate-400'
                      : Number(c.diferencia) > 0
                        ? 'text-sky-600'
                        : 'text-red-600'
                  }`}
                >
                  {Number(c.diferencia) >= 0 ? '+' : ''}
                  {money(c.diferencia)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

import { useState } from 'react'
import { money } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { useRegistrarCliente, type DescuentoManual, type MetodoPago } from './api'

const METODOS: { id: MetodoPago; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: '💵' },
  { id: 'tarjeta', label: 'Tarjeta', icon: '💳' },
  { id: 'transferencia', label: 'Transferencia', icon: '📲' },
]

export interface ClienteVenta {
  id: string
  preCompras: number // compras ANTES de esta venta
}

export interface LealtadConfig {
  activa: boolean
  meta: number
  premio: string | null
}

export function CheckoutModal({
  total,
  procesando,
  tenantId,
  lealtad,
  onCobrar,
  onCancelar,
}: {
  total: number
  procesando: boolean
  tenantId: string
  lealtad: LealtadConfig
  onCobrar: (
    metodo: MetodoPago,
    montoRecibido: number | null,
    cliente: ClienteVenta | null,
    descuento: DescuentoManual | null,
  ) => void
  onCancelar: () => void
}) {
  const { rol } = useAuth()
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [recibido, setRecibido] = useState('')

  // Descuento manual del ticket: SOLO admin (el servidor también lo valida).
  const esAdmin = rol === 'admin'
  const [descAbierto, setDescAbierto] = useState(false)
  const [descTipo, setDescTipo] = useState<'%' | '$'>('%')
  const [descValor, setDescValor] = useState('')
  const [descMotivo, setDescMotivo] = useState('')
  const v = Number(descValor) || 0
  const montoDescuento = esAdmin && descAbierto && v > 0
    ? Math.min(descTipo === '%' ? (total * Math.min(v, 100)) / 100 : v, total)
    : 0
  const totalFinal = Math.max(total - montoDescuento, 0)

  // Cliente (fidelización).
  const registrar = useRegistrarCliente(tenantId)
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [cliente, setCliente] = useState<{ id: string; nombre: string | null; compras: number } | null>(null)

  const montoRecibido = recibido === '' ? null : Number(recibido)
  const cambio =
    metodo === 'efectivo' && montoRecibido !== null ? montoRecibido - totalFinal : null
  const faltante = cambio !== null && cambio < 0

  const sugeridos = [totalFinal, Math.ceil(totalFinal / 50) * 50, Math.ceil(totalFinal / 100) * 100]
  const rapidos = [...new Set(sugeridos)].filter((n) => n >= totalFinal)

  // Progreso de lealtad. `compras` son las ya hechas (antes de esta venta).
  //   enCiclo = avance dentro del ciclo actual (0..meta-1)
  //   faltan  = compras restantes para el premio, INCLUIDA la actual
  //   ganaPremio = esta venta es la que cierra el ciclo (faltan === 1)
  const enCiclo = cliente ? cliente.compras % lealtad.meta : 0
  const faltanParaPremio = lealtad.meta - enCiclo
  const ganaPremio = !!cliente && lealtad.activa && faltanParaPremio === 1

  async function identificar() {
    if (!telefono.trim()) return
    try {
      const c = await registrar.mutateAsync({ telefono: telefono.trim(), nombre: nombre.trim() })
      setCliente({ id: c.id, nombre: c.nombre, compras: c.compras })
    } catch {
      /* el error se muestra abajo */
    }
  }

  return (
    <div className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div className="animate-slide-up max-h-full w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-3xl">
        <p className="text-center text-sm text-slate-500">Total a cobrar</p>
        <p className="mb-1 text-center text-4xl font-bold tabular">{money(totalFinal)}</p>
        {montoDescuento > 0 && (
          <p className="mb-1 text-center text-sm text-emerald-600">
            Descuento −{money(montoDescuento)} <s className="text-slate-400">{money(total)}</s>
          </p>
        )}

        {/* Descuento manual (solo admin). */}
        {esAdmin && (
          <div className="mb-4 mt-2">
            {!descAbierto ? (
              <button
                type="button"
                onClick={() => setDescAbierto(true)}
                className="mx-auto block text-sm font-medium text-accent"
              >
                Aplicar descuento
              </button>
            ) : (
              <div className="animate-fade-in space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
                <div className="flex gap-2">
                  <div className="flex rounded-xl bg-slate-200 p-0.5 dark:bg-slate-700">
                    {(['%', '$'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDescTipo(t)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                          descTipo === t ? 'bg-white text-accent dark:bg-slate-900' : 'text-slate-500'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={descValor}
                    onChange={(e) => setDescValor(e.target.value)}
                    placeholder={descTipo === '%' ? 'ej. 10' : 'ej. 50.00'}
                    className="field flex-1 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => { setDescAbierto(false); setDescValor(''); setDescMotivo('') }}
                    className="text-sm text-slate-400"
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={descMotivo}
                  onChange={(e) => setDescMotivo(e.target.value)}
                  placeholder="Motivo (ej. cliente frecuente)"
                  className="field py-2 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* ---- Cliente frecuente (solo si la lealtad está activa) ---- */}
        {lealtad.activa && (
          <div className="mb-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
            {!cliente ? (
              <>
                <p className="mb-2 text-sm font-medium">🎁 Cliente frecuente (opcional)</p>
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))}
                    placeholder="Teléfono"
                    className="field flex-1"
                  />
                  <button
                    type="button"
                    onClick={identificar}
                    disabled={registrar.isPending || !telefono.trim()}
                    className="btn-neutral px-4 text-sm"
                  >
                    {registrar.isPending ? '…' : 'Buscar'}
                  </button>
                </div>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre (opcional, para nuevos)"
                  className="field mt-2 text-sm"
                />
                {registrar.isError && (
                  <p className="mt-1 text-sm text-red-600">No se pudo identificar al cliente.</p>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{cliente.nombre || 'Cliente'}</p>
                  <p className="text-xs text-slate-500">{telefono}</p>
                </div>
                {ganaPremio ? (
                  <span className="chip animate-pulse bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    🎉 ¡Premio!
                  </span>
                ) : (
                  <span className="text-right text-xs text-slate-500">
                    {cliente.compras} compras
                    <br />
                    faltan {faltanParaPremio} para premio
                  </span>
                )}
              </div>
            )}
            {ganaPremio && (
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Con esta compra gana: {lealtad.premio?.trim() || '¡un premio!'}
              </p>
            )}
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-2">
          {METODOS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetodo(m.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl border py-3 text-sm ${
                metodo === m.id
                  ? 'border-accent bg-[rgb(var(--accent)/0.1)] text-accent'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <span className="text-2xl">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        {metodo === 'efectivo' && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Monto recibido</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                placeholder="0.00"
                className="field text-lg"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {rapidos.map((n) => (
                <button
                  key={n}
                  onClick={() => setRecibido(String(n))}
                  className="rounded-full bg-slate-200 px-4 py-1.5 text-sm dark:bg-slate-800"
                >
                  {money(n)}
                </button>
              ))}
            </div>
            {cambio !== null && (
              <p className={`text-center text-lg font-semibold ${faltante ? 'text-red-600' : 'text-emerald-600'}`}>
                {faltante ? `Faltan ${money(-cambio)}` : `Cambio: ${money(cambio)}`}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onCancelar} className="btn-neutral flex-1 py-3 text-base">
            Cancelar
          </button>
          <button
            onClick={() =>
              onCobrar(
                metodo,
                montoRecibido,
                cliente ? { id: cliente.id, preCompras: cliente.compras } : null,
                montoDescuento > 0
                  ? { monto: montoDescuento, motivo: descMotivo.trim() || null }
                  : null,
              )
            }
            disabled={procesando || faltante}
            className="btn-accent flex-1 py-3 text-base disabled:opacity-60"
          >
            {procesando ? 'Cobrando…' : 'Cobrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

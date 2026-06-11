import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MONEDAS } from '@/lib/format'
import { useAuth } from './AuthProvider'

// Paleta vibrante sugerida; el dueño también puede elegir color libre.
const COLORES = [
  '#6366f1', '#2563eb', '#dc2626', '#ea580c',
  '#16a34a', '#9333ea', '#db2777', '#0891b2',
]

type Modo = 'crear' | 'unirme'

export function OnboardingPage() {
  const { refreshMemberships, setActiveTenant, signOut } = useAuth()
  const [modo, setModo] = useState<Modo>('crear')
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(COLORES[0])
  const [moneda, setMoneda] = useState('MXN')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    const { data, error } = await supabase.rpc('crear_negocio', {
      p_nombre: nombre,
      p_color: color,
      p_moneda: moneda,
    })
    if (error) {
      setError(error.message)
      setCargando(false)
      return
    }
    const tenant = data as { id: string }
    await refreshMemberships()
    if (tenant?.id) setActiveTenant(tenant.id)
    setCargando(false)
  }

  async function unirme(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    const { data, error } = await supabase.rpc('unirse_con_codigo', {
      p_codigo: codigo.trim(),
    })
    if (error) {
      setError(error.message)
      setCargando(false)
      return
    }
    const tenant = data as { id: string }
    await refreshMemberships()
    if (tenant?.id) setActiveTenant(tenant.id)
    setCargando(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-soft dark:bg-slate-900">
        {/* Conmutador crear / unirse. */}
        <div className="mb-6 flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['crear', 'unirme'] as Modo[]).map((m) => (
            <button
              key={m}
              onClick={() => { setModo(m); setError(null) }}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                modo === m ? 'bg-white text-accent shadow-soft dark:bg-slate-900' : 'text-slate-500'
              }`}
            >
              {m === 'crear' ? 'Crear negocio' : 'Unirme con código'}
            </button>
          ))}
        </div>

        {modo === 'crear' ? (
          <>
            <h1 className="mb-1 text-2xl font-bold">Crea tu negocio</h1>
            <p className="mb-6 text-sm text-slate-500">
              Configura lo básico. Podrás cambiar logo, colores y menú después.
            </p>

            <form onSubmit={crear} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium">Nombre del negocio</label>
                <input
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Tacos El Güero"
                  className="field"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Moneda</label>
                <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="field">
                  {MONEDAS.map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Color de acento</label>
                <div className="flex flex-wrap gap-3">
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-10 w-10 rounded-full ring-offset-2 transition ${
                        color === c ? 'ring-2 ring-slate-900 dark:ring-white' : ''
                      }`}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    aria-label="Color libre"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={cargando} className="btn-accent w-full">
                {cargando ? 'Creando…' : 'Crear negocio'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold">Unirme a un negocio</h1>
            <p className="mb-6 text-sm text-slate-500">
              Ingresa el código que te compartió el administrador.
            </p>

            <form onSubmit={unirme} className="space-y-5">
              <input
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="CÓDIGO"
                className="field text-center font-mono text-xl tracking-widest"
                maxLength={8}
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={cargando} className="btn-accent w-full">
                {cargando ? 'Uniéndome…' : 'Unirme'}
              </button>
            </form>
          </>
        )}

        <button onClick={signOut} className="mt-5 w-full text-center text-sm text-slate-500">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

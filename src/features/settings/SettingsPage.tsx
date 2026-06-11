import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { applyAccent, applyTheme } from '@/lib/theme'
import { aplicarMoneda, MONEDAS } from '@/lib/format'
import { subirImagen } from '@/lib/storage'
import type { Tenant } from '@/lib/types'

const COLORES = [
  '#6366f1', '#2563eb', '#dc2626', '#ea580c',
  '#16a34a', '#9333ea', '#db2777', '#0891b2',
]

const TEMAS: { id: Tenant['modo_tema']; label: string }[] = [
  { id: 'claro', label: 'Claro' },
  { id: 'oscuro', label: 'Oscuro' },
  { id: 'auto', label: 'Automático' },
]

export function SettingsPage() {
  const { tenant, activeTenantId, refreshMemberships } = useAuth()
  const [nombre, setNombre] = useState(tenant?.nombre ?? '')
  const [color, setColor] = useState(tenant?.color_acento ?? COLORES[0])
  const [tema, setTema] = useState<Tenant['modo_tema']>(tenant?.modo_tema ?? 'auto')
  const [moneda, setMoneda] = useState(tenant?.moneda ?? 'MXN')
  const [kds, setKds] = useState(tenant?.kds_activo ?? true)
  const [lealtadActiva, setLealtadActiva] = useState(tenant?.lealtad_activa ?? false)
  const [lealtadMeta, setLealtadMeta] = useState(String(tenant?.lealtad_meta ?? 5))
  const [lealtadPremio, setLealtadPremio] = useState(tenant?.lealtad_premio ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(tenant?.logo_url ?? null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function previewColor(c: string) {
    setColor(c)
    applyAccent(c)
  }
  function previewTema(t: Tenant['modo_tema']) {
    setTema(t)
    applyTheme(t)
  }
  function previewMoneda(m: string) {
    setMoneda(m)
    aplicarMoneda(m)
  }

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeTenantId) return
    setSubiendo(true)
    setError(null)
    try {
      const url = await subirImagen('branding', activeTenantId, file)
      setLogoUrl(url)
    } catch (err) {
      setError('No se pudo subir el logo: ' + (err as Error).message)
    }
    setSubiendo(false)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setGuardado(false)

    const { error } = await supabase
      .from('tenants')
      .update({
        nombre: nombre.trim(),
        color_acento: color,
        modo_tema: tema,
        moneda,
        kds_activo: kds,
        lealtad_activa: lealtadActiva,
        lealtad_meta: Math.max(2, Number(lealtadMeta) || 5),
        lealtad_premio: lealtadPremio.trim() || null,
        logo_url: logoUrl,
      })
      .eq('id', activeTenantId!)

    if (error) {
      setError(error.message)
    } else {
      await refreshMemberships()
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    }
    setGuardando(false)
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes del negocio</h1>

      <form onSubmit={guardar} className="space-y-6">
        {/* Logo. */}
        <div>
          <label className="mb-2 block text-sm font-medium">Logo</label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-soft" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-fg">
                {nombre.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={subirLogo} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={subiendo}
              className="btn-neutral px-4 py-2.5 text-sm"
            >
              {subiendo ? 'Subiendo…' : logoUrl ? 'Cambiar' : 'Subir imagen'}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl(null)}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Nombre del negocio</label>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" />
        </div>

        {/* Moneda. */}
        <div>
          <label className="mb-1 block text-sm font-medium">Moneda</label>
          <select value={moneda} onChange={(e) => previewMoneda(e.target.value)} className="field">
            {MONEDAS.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.etiqueta}
              </option>
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
                onClick={() => previewColor(c)}
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
              onChange={(e) => previewColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0"
              aria-label="Color libre"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Tema</label>
          <div className="grid grid-cols-3 gap-2">
            {TEMAS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => previewTema(t.id)}
                className={`rounded-2xl border py-2.5 text-sm transition ${
                  tema === t.id
                    ? 'border-accent bg-[rgb(var(--accent)/0.1)] text-accent'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="card flex items-center justify-between">
          <span>
            <span className="block font-medium">Pantalla de cocina (KDS)</span>
            <span className="block text-sm text-slate-500">
              Las ventas pasan a cocina antes de completarse.
            </span>
          </span>
          <input
            type="checkbox"
            checked={kds}
            onChange={(e) => setKds(e.target.checked)}
            className="h-6 w-6 accent-[rgb(var(--accent))]"
          />
        </label>

        {/* Programa de lealtad. */}
        <div className="card space-y-4">
          <label className="flex items-center justify-between">
            <span>
              <span className="block font-medium">🎁 Programa de lealtad</span>
              <span className="block text-sm text-slate-500">
                Registra clientes por teléfono y premia su recurrencia.
              </span>
            </span>
            <input
              type="checkbox"
              checked={lealtadActiva}
              onChange={(e) => setLealtadActiva(e.target.checked)}
              className="h-6 w-6 accent-[rgb(var(--accent))]"
            />
          </label>

          {lealtadActiva && (
            <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
              <div>
                <label className="mb-1 block text-sm font-medium">Premiar cada cuántas compras</label>
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={lealtadMeta}
                  onChange={(e) => setLealtadMeta(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Premio</label>
                <input
                  value={lealtadPremio}
                  onChange={(e) => setLealtadPremio(e.target.value)}
                  placeholder="Ej. Un postre gratis"
                  className="field"
                />
              </div>
              <p className="text-xs text-slate-500">
                En la caja, al identificar al cliente, el sistema avisará cuando llegue a su compra
                n.º {Math.max(2, Number(lealtadMeta) || 5)}.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {guardado && <p className="text-sm text-emerald-600">Cambios guardados ✓</p>}

        <button type="submit" disabled={guardando} className="btn-accent w-full py-3">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}

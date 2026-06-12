import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCategories, useProducts } from '@/features/catalog/api'
import { money } from '@/lib/format'
import { promoVigente } from '@/features/sale/promoEngine'
import {
  useDeletePromo,
  usePromos,
  useSavePromo,
  useTogglePromo,
  type Promotion,
  type TipoPromo,
} from './api'

const TIPOS: { id: TipoPromo; label: string }[] = [
  { id: 'porcentaje', label: '% Desc.' },
  { id: 'precio_fijo', label: 'Precio fijo' },
  { id: 'nxm', label: 'N×M' },
]

export function PromosPage() {
  const { activeTenantId } = useAuth()
  const tenantId = activeTenantId!

  const promos = usePromos(tenantId)
  const productos = useProducts(tenantId)
  const categorias = useCategories(tenantId)
  const guardar = useSavePromo(tenantId)
  const alternar = useTogglePromo(tenantId)
  const eliminar = useDeletePromo(tenantId)

  const [creando, setCreando] = useState(false)

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promociones</h1>
          <p className="text-sm text-slate-500">Se aplican solas en el carrito</p>
        </div>
        <button onClick={() => setCreando((v) => !v)} className="btn-accent px-4 py-2 text-sm">
          {creando ? 'Cancelar' : '+ Nueva'}
        </button>
      </div>

      {creando && (
        <FormPromo
          productos={productos.data ?? []}
          categorias={categorias.data ?? []}
          guardando={guardar.isPending}
          error={guardar.isError}
          onGuardar={async (p) => {
            await guardar.mutateAsync(p)
            setCreando(false)
          }}
        />
      )}

      {/* Lista. */}
      <div className="stagger space-y-2">
        {(promos.data ?? []).map((p) => (
          <PromoCard
            key={p.id}
            promo={p}
            productos={productos.data ?? []}
            categorias={categorias.data ?? []}
            onToggle={(activo) => alternar.mutate({ id: p.id, activo })}
            onEliminar={() => {
              if (confirm(`¿Eliminar la promoción "${p.nombre}"?`)) eliminar.mutate(p.id)
            }}
          />
        ))}
      </div>

      {!promos.isLoading && (promos.data?.length ?? 0) === 0 && !creando && (
        <p className="py-8 text-center text-sm text-slate-500">
          Sin promociones. Crea la primera con “+ Nueva”.
        </p>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------

function PromoCard({
  promo,
  productos,
  categorias,
  onToggle,
  onEliminar,
}: {
  promo: Promotion
  productos: { id: string; nombre: string }[]
  categorias: { id: string; nombre: string }[]
  onToggle: (activo: boolean) => void
  onEliminar: () => void
}) {
  const objetivo = promo.producto_id
    ? productos.find((p) => p.id === promo.producto_id)?.nombre ?? 'Producto'
    : `Categoría: ${categorias.find((c) => c.id === promo.categoria_id)?.nombre ?? '—'}`

  const detalle =
    promo.tipo === 'porcentaje'
      ? `−${Number(promo.valor)}%`
      : promo.tipo === 'precio_fijo'
        ? `a ${money(promo.valor)}`
        : `${promo.n}×${promo.m}`

  const vigente = promoVigente(promo, new Date())
  const expirada = promo.termina !== null && new Date(promo.termina) < new Date()

  return (
    <div className="card flex items-center gap-3 !p-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-semibold">
          {promo.nombre}
          <span className="chip !py-0.5 text-xs">{detalle}</span>
        </p>
        <p className="truncate text-xs text-slate-500">
          {objetivo}
          {promo.termina &&
            ` · hasta ${new Date(promo.termina).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`}
          {expirada && ' · expirada'}
        </p>
      </div>
      <input
        type="checkbox"
        checked={promo.activo && vigente}
        disabled={expirada}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-6 w-6 accent-[rgb(var(--accent))]"
        title={promo.activo ? 'Desactivar' : 'Activar'}
      />
      <button
        onClick={onEliminar}
        className="rounded-lg px-1 py-1 text-sm text-slate-400 hover:text-red-600"
        aria-label="Eliminar"
      >
        ✕
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------------

function FormPromo({
  productos,
  categorias,
  guardando,
  error,
  onGuardar,
}: {
  productos: { id: string; nombre: string }[]
  categorias: { id: string; nombre: string }[]
  guardando: boolean
  error: boolean
  onGuardar: (p: {
    nombre: string
    tipo: TipoPromo
    valor: number
    n: number | null
    m: number | null
    producto_id: string | null
    categoria_id: string | null
    inicia: string | null
    termina: string | null
  }) => void
}) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoPromo>('porcentaje')
  const [valor, setValor] = useState('')
  const [n, setN] = useState('2')
  const [m, setM] = useState('1')
  const [alcance, setAlcance] = useState<'producto' | 'categoria'>('producto')
  const [objetivoId, setObjetivoId] = useState('')
  const [termina, setTermina] = useState('')

  const opciones = alcance === 'producto' ? productos : categorias
  const valida =
    nombre.trim() &&
    objetivoId &&
    (tipo === 'nxm'
      ? Number(n) > Number(m) && Number(m) >= 1
      : Number(valor) > 0)

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valida) return
    onGuardar({
      nombre: nombre.trim(),
      tipo,
      valor: tipo === 'nxm' ? 0 : Number(valor),
      n: tipo === 'nxm' ? Number(n) : null,
      m: tipo === 'nxm' ? Number(m) : null,
      producto_id: alcance === 'producto' ? objetivoId : null,
      categoria_id: alcance === 'categoria' ? objetivoId : null,
      inicia: null,
      // Fin de vigencia al final del día elegido (hora local).
      termina: termina ? new Date(`${termina}T23:59:59`).toISOString() : null,
    })
  }

  return (
    <form onSubmit={enviar} className="card animate-fade-in space-y-3">
      <input
        className="field"
        placeholder="Nombre (ej. 2x1 en tacos)"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />

      {/* Tipo. */}
      <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipo(t.id)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              tipo === t.id ? 'bg-white text-accent shadow-soft dark:bg-slate-900' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tipo === 'nxm' ? (
        <div className="flex items-center gap-2">
          <input
            type="number" min="2" step="1" value={n}
            onChange={(e) => setN(e.target.value)}
            className="field flex-1 text-center" aria-label="Lleva N"
          />
          <span className="text-sm text-slate-500">×</span>
          <input
            type="number" min="1" step="1" value={m}
            onChange={(e) => setM(e.target.value)}
            className="field flex-1 text-center" aria-label="Paga M"
          />
          <div className="flex gap-1">
            {[['2', '1'], ['3', '2']].map(([a, b]) => (
              <button
                key={a}
                type="button"
                onClick={() => { setN(a); setM(b) }}
                className="rounded-full bg-slate-200 px-3 py-1.5 text-xs dark:bg-slate-700"
              >
                {a}×{b}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <input
          type="number" inputMode="decimal" min="0" step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={tipo === 'porcentaje' ? 'Porcentaje (ej. 20)' : 'Precio promocional'}
          className="field"
          required
        />
      )}

      {/* Alcance. */}
      <div className="flex gap-2">
        {(['producto', 'categoria'] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => { setAlcance(a); setObjetivoId('') }}
            className={`flex-1 rounded-2xl border py-2 text-sm font-medium transition ${
              alcance === a
                ? 'border-accent bg-[rgb(var(--accent)/0.1)] text-accent'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            {a === 'producto' ? 'Un producto' : 'Una categoría'}
          </button>
        ))}
      </div>
      <select
        value={objetivoId}
        onChange={(e) => setObjetivoId(e.target.value)}
        className="field"
        required
      >
        <option value="">Elegir {alcance === 'producto' ? 'producto' : 'categoría'}…</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Vigencia hasta (opcional)
        </label>
        <input
          type="date"
          value={termina}
          onChange={(e) => setTermina(e.target.value)}
          className="field"
        />
      </div>

      {error && <p className="text-sm text-red-600">No se pudo guardar la promoción.</p>}

      <button type="submit" disabled={guardando || !valida} className="btn-accent w-full py-2.5">
        {guardando ? 'Guardando…' : 'Crear promoción'}
      </button>
    </form>
  )
}

import { useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { subirImagen } from '@/lib/storage'
import { money } from '@/lib/format'
import { useDeleteModifier, useModifiers, useSaveModifier } from './api'
import type { Category, Product, ProductInput } from './api'

const VACIO: ProductInput = {
  categoria_id: null,
  nombre: '',
  precio_venta: 0,
  costo: 0,
  foto_url: null,
  activo: true,
  controla_stock: false,
  stock_actual: 0,
  stock_minimo: 0,
}

// Editor de producto en modal. Sirve tanto para crear como para editar.
export function ProductEditor({
  producto,
  categorias,
  guardando,
  onGuardar,
  onCancelar,
}: {
  producto: Product | null
  categorias: Category[]
  guardando: boolean
  onGuardar: (p: ProductInput) => void
  onCancelar: () => void
}) {
  const [form, setForm] = useState<ProductInput>(
    producto
      ? {
          id: producto.id,
          categoria_id: producto.categoria_id,
          nombre: producto.nombre,
          precio_venta: producto.precio_venta,
          costo: producto.costo,
          foto_url: producto.foto_url,
          activo: producto.activo,
          controla_stock: producto.controla_stock,
          stock_actual: producto.stock_actual,
          stock_minimo: producto.stock_minimo,
          orden: producto.orden,
        }
      : VACIO,
  )

  const { activeTenantId } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errorFoto, setErrorFoto] = useState<string | null>(null)

  function set<K extends keyof ProductInput>(k: K, v: ProductInput[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeTenantId) return
    setSubiendo(true)
    setErrorFoto(null)
    try {
      const url = await subirImagen('productos', activeTenantId, file)
      set('foto_url', url)
    } catch (err) {
      setErrorFoto('No se pudo subir la foto: ' + (err as Error).message)
    }
    setSubiendo(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    onGuardar({ ...form, nombre: form.nombre.trim() })
  }

  return (
    <div className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="animate-slide-up max-h-full w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-3xl">
        <h2 className="mb-4 text-lg font-bold">
          {producto ? 'Editar producto' : 'Nuevo producto'}
        </h2>

        <form onSubmit={submit} className="space-y-4">
          {/* Foto del producto. */}
          <div>
            <label className="mb-2 block text-sm font-medium">Foto</label>
            <div className="flex items-center gap-4">
              {form.foto_url ? (
                <img src={form.foto_url} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-soft" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl dark:bg-slate-800">
                  🍽️
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={subirFoto} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={subiendo}
                className="btn-neutral px-4 py-2.5 text-sm"
              >
                {subiendo ? 'Subiendo…' : form.foto_url ? 'Cambiar' : 'Subir'}
              </button>
              {form.foto_url && (
                <button
                  type="button"
                  onClick={() => set('foto_url', null)}
                  className="text-sm text-slate-400 hover:text-red-600"
                >
                  Quitar
                </button>
              )}
            </div>
            {errorFoto && <p className="mt-1 text-sm text-red-600">{errorFoto}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Nombre</label>
            <input
              required
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Categoría</label>
            <select
              value={form.categoria_id ?? ''}
              onChange={(e) => set('categoria_id', e.target.value || null)}
              className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Precio venta</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.precio_venta}
                onChange={(e) => set('precio_venta', Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Costo</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.costo}
                onChange={(e) => set('costo', Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.controla_stock}
              onChange={(e) => set('controla_stock', e.target.checked)}
              className="h-5 w-5 accent-[rgb(var(--accent))]"
            />
            Controlar inventario
          </label>

          {form.controla_stock && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Stock actual</label>
                <input
                  type="number"
                  step="0.001"
                  value={form.stock_actual}
                  onChange={(e) => set('stock_actual', Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Stock mínimo</label>
                <input
                  type="number"
                  step="0.001"
                  value={form.stock_minimo}
                  onChange={(e) => set('stock_minimo', Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => set('activo', e.target.checked)}
              className="h-5 w-5 accent-[rgb(var(--accent))]"
            />
            Disponible para venta
          </label>

          {/* Extras / toppings / salsas. Solo al editar (necesita el id). */}
          {producto?.id ? (
            <ModifiersSection productId={producto.id} />
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-800/40">
              💡 Guarda el producto y vuelve a abrirlo para agregar extras
              (toppings, salsas…).
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancelar}
              className="btn-neutral flex-1 py-3 text-base"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="btn-accent flex-1 py-3 text-base disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Extras del producto (toppings, salsas...). Se guardan al instante, fuera del
// submit del formulario principal.
// ----------------------------------------------------------------------------
function ModifiersSection({ productId }: { productId: string }) {
  const { activeTenantId } = useAuth()
  const tenantId = activeTenantId!
  const modifiers = useModifiers(tenantId)
  const guardar = useSaveModifier(tenantId)
  const eliminar = useDeleteModifier(tenantId)

  const [grupo, setGrupo] = useState('')
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [obligatorio, setObligatorio] = useState(false)

  const propios = (modifiers.data ?? []).filter((m) => m.product_id === productId)

  // Agrupados para mostrar (grupo vacío -> "Extras").
  const grupos = new Map<string, typeof propios>()
  for (const m of propios) {
    const g = m.grupo?.trim() || 'Extras'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g)!.push(m)
  }

  async function agregar() {
    if (!nombre.trim()) return
    await guardar.mutateAsync({
      product_id: productId,
      grupo: grupo.trim() || null,
      nombre: nombre.trim(),
      precio: Number(precio) || 0,
      obligatorio,
    })
    setNombre('')
    setPrecio('')
  }

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
      <p className="text-sm font-medium">🧂 Extras y opciones</p>
      <p className="text-xs text-slate-500">
        Agrupa con un nombre (ej. “Salsa”, “Extras”). Si marcas una opción como
        obligatoria, en la venta se pedirá elegir <b>una</b> del grupo.
      </p>

      {[...grupos.entries()].map(([g, items]) => (
        <div key={g}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {g} {items.some((i) => i.obligatorio) && '· obligatorio'}
          </p>
          <ul className="space-y-1">
            {items.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"
              >
                <span>{m.nombre}</span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-500">
                    {m.precio > 0 ? `+${money(m.precio)}` : 'Gratis'}
                  </span>
                  <button
                    type="button"
                    onClick={() => eliminar.mutate(m.id)}
                    className="text-slate-400 hover:text-red-600"
                    aria-label={`Quitar ${m.nombre}`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Alta rápida. */}
      <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
        <div className="flex gap-2">
          <input
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            placeholder="Grupo (ej. Salsa)"
            className="field flex-1 py-2 text-sm"
          />
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Verde)"
            className="field flex-1 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="Precio extra (0 = gratis)"
            className="field flex-1 py-2 text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={obligatorio}
              onChange={(e) => setObligatorio(e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            Obligatorio
          </label>
          <button
            type="button"
            onClick={agregar}
            disabled={guardar.isPending || !nombre.trim()}
            className="btn-accent px-4 py-2 text-sm"
          >
            +
          </button>
        </div>
        {guardar.isError && (
          <p className="text-xs text-red-600">No se pudo guardar el extra.</p>
        )}
      </div>
    </div>
  )
}

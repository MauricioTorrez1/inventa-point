import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCategories, useProducts } from '@/features/catalog/api'
import { money } from '@/lib/format'
import {
  useCombos,
  useDeleteCombo,
  useSaveCombo,
  useToggleCombo,
  type SlotInput,
} from './api'

export function CombosPage() {
  const { activeTenantId } = useAuth()
  const tenantId = activeTenantId!

  const combos = useCombos(tenantId)
  const productos = useProducts(tenantId)
  const categorias = useCategories(tenantId)
  const guardar = useSaveCombo(tenantId)
  const alternar = useToggleCombo(tenantId)
  const eliminar = useDeleteCombo(tenantId)

  const [creando, setCreando] = useState(false)

  const nombreDe = (s: { categoria_id: string | null; producto_id: string | null }) =>
    s.producto_id
      ? productos.data?.find((p) => p.id === s.producto_id)?.nombre ?? 'Producto'
      : `1 de ${categorias.data?.find((c) => c.id === s.categoria_id)?.nombre ?? 'categoría'}`

  return (
    <div className="mx-auto max-w-md space-y-5 p-4 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Combos</h1>
          <p className="text-sm text-slate-500">Paquetes con precio especial</p>
        </div>
        <button onClick={() => setCreando((v) => !v)} className="btn-accent px-4 py-2 text-sm">
          {creando ? 'Cancelar' : '+ Nuevo'}
        </button>
      </div>

      {creando && (
        <FormCombo
          productos={productos.data ?? []}
          categorias={categorias.data ?? []}
          guardando={guardar.isPending}
          error={guardar.isError}
          onGuardar={async (c) => {
            await guardar.mutateAsync(c)
            setCreando(false)
          }}
        />
      )}

      <div className="stagger space-y-2">
        {(combos.data ?? []).map((c) => (
          <div key={c.id} className="card flex items-center gap-3 !p-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-semibold">
                🎁 {c.nombre}
                <span className="chip !py-0.5 text-xs">{money(c.precio)}</span>
              </p>
              <p className="truncate text-xs text-slate-500">
                {c.combo_slots.map(nombreDe).join(' + ')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={c.activo}
              onChange={(e) => alternar.mutate({ id: c.id, activo: e.target.checked })}
              className="h-6 w-6 accent-[rgb(var(--accent))]"
              title={c.activo ? 'Desactivar' : 'Activar'}
            />
            <button
              onClick={() => {
                if (confirm(`¿Eliminar el combo "${c.nombre}"?`)) eliminar.mutate(c.id)
              }}
              className="rounded-lg px-1 py-1 text-sm text-slate-400 hover:text-red-600"
              aria-label="Eliminar"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {!combos.isLoading && (combos.data?.length ?? 0) === 0 && !creando && (
        <p className="py-8 text-center text-sm text-slate-500">
          Sin combos. Crea el primero con “+ Nuevo”.
        </p>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------

interface SlotForm extends SlotInput {
  tipo: 'categoria' | 'producto'
}

function FormCombo({
  productos,
  categorias,
  guardando,
  error,
  onGuardar,
}: {
  productos: { id: string; nombre: string; precio_venta: number }[]
  categorias: { id: string; nombre: string }[]
  guardando: boolean
  error: boolean
  onGuardar: (c: { nombre: string; precio: number; slots: SlotInput[] }) => void
}) {
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [slots, setSlots] = useState<SlotForm[]>([
    { tipo: 'categoria', etiqueta: null, categoria_id: null, producto_id: null },
  ])

  function setSlot(i: number, cambios: Partial<SlotForm>) {
    setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...cambios } : x)))
  }

  const valida =
    nombre.trim() &&
    Number(precio) > 0 &&
    slots.length > 0 &&
    slots.every((s) =>
      s.tipo === 'categoria' ? !!s.categoria_id : !!s.producto_id,
    )

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valida) return
    onGuardar({
      nombre: nombre.trim(),
      precio: Number(precio),
      slots: slots.map((s) => ({
        etiqueta: s.etiqueta?.trim() || null,
        categoria_id: s.tipo === 'categoria' ? s.categoria_id : null,
        producto_id: s.tipo === 'producto' ? s.producto_id : null,
      })),
    })
  }

  return (
    <form onSubmit={enviar} className="card animate-fade-in space-y-3">
      <input
        className="field"
        placeholder="Nombre (ej. Combo desayuno)"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />
      <input
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        className="field"
        placeholder="Precio del combo"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        required
      />

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Incluye
      </p>
      {slots.map((s, i) => (
        <div key={i} className="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-xl bg-slate-200 p-0.5 dark:bg-slate-700">
              {(['categoria', 'producto'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSlot(i, { tipo: t, categoria_id: null, producto_id: null })}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                    s.tipo === t ? 'bg-white text-accent dark:bg-slate-900' : 'text-slate-500'
                  }`}
                >
                  {t === 'categoria' ? 'Elegir de categoría' : 'Producto fijo'}
                </button>
              ))}
            </div>
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => setSlots((x) => x.filter((_, j) => j !== i))}
                className="text-sm text-slate-400 hover:text-red-600"
                aria-label="Quitar espacio"
              >
                ✕
              </button>
            )}
          </div>

          {s.tipo === 'categoria' ? (
            <>
              <select
                value={s.categoria_id ?? ''}
                onChange={(e) => setSlot(i, { categoria_id: e.target.value || null })}
                className="field py-2 text-sm"
                required
              >
                <option value="">Elegir categoría…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <input
                value={s.etiqueta ?? ''}
                onChange={(e) => setSlot(i, { etiqueta: e.target.value })}
                placeholder='Etiqueta (ej. "Elige tu bebida")'
                className="field py-2 text-sm"
              />
            </>
          ) : (
            <select
              value={s.producto_id ?? ''}
              onChange={(e) => setSlot(i, { producto_id: e.target.value || null })}
              className="field py-2 text-sm"
              required
            >
              <option value="">Elegir producto…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({money(p.precio_venta)})
                </option>
              ))}
            </select>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setSlots((s) => [
            ...s,
            { tipo: 'categoria', etiqueta: null, categoria_id: null, producto_id: null },
          ])
        }
        className="w-full rounded-2xl border border-dashed border-slate-300 py-2 text-sm text-slate-500 dark:border-slate-600"
      >
        + Agregar espacio
      </button>

      {error && <p className="text-sm text-red-600">No se pudo guardar el combo.</p>}

      <button type="submit" disabled={guardando || !valida} className="btn-accent w-full py-2.5">
        {guardando ? 'Guardando…' : 'Crear combo'}
      </button>
    </form>
  )
}

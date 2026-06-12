import { useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { money } from '@/lib/format'
import {
  useCategories,
  useDeleteCategory,
  useDeleteProduct,
  useProducts,
  useSaveCategory,
  useSaveProduct,
  type Product,
  type ProductInput,
} from './api'
import { ProductEditor } from './ProductEditor'

export function CatalogPage() {
  const { activeTenantId } = useAuth()
  const tenantId = activeTenantId!

  const categorias = useCategories(tenantId)
  const productos = useProducts(tenantId)

  const saveCategory = useSaveCategory(tenantId)
  const deleteCategory = useDeleteCategory(tenantId)
  const saveProduct = useSaveProduct(tenantId)
  const deleteProduct = useDeleteProduct(tenantId)

  const [nuevaCat, setNuevaCat] = useState('')
  const [editando, setEditando] = useState<Product | null | undefined>(undefined)
  // undefined = editor cerrado · null = nuevo · Product = editar

  // Categorías expandidas en el acordeón de productos.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  function alternar(id: string) {
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const lista = productos.data ?? []

  // Productos agrupados por categoría (los sin categoría van al final).
  const grupos = useMemo(() => {
    const porCat = new Map<string | null, Product[]>()
    for (const p of lista) {
      const k = p.categoria_id
      if (!porCat.has(k)) porCat.set(k, [])
      porCat.get(k)!.push(p)
    }
    const out = (categorias.data ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: porCat.get(c.id) ?? [],
    }))
    const sinCat = porCat.get(null) ?? []
    if (sinCat.length > 0) {
      out.push({ id: 'sin-categoria', nombre: 'Sin categoría', productos: sinCat })
    }
    return out.filter((g) => g.productos.length > 0)
  }, [categorias.data, lista])

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4 pb-24">
      {/* ---- Categorías ---- */}
      <section>
        <h1 className="mb-3 text-xl font-bold">Categorías</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const nombre = nuevaCat.trim()
            if (!nombre) return
            saveCategory.mutate({ nombre }, { onSuccess: () => setNuevaCat('') })
          }}
          className="mb-3 flex gap-2"
        >
          <input
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
            placeholder="Nueva categoría"
            className="flex-1 rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 outline-none focus:border-accent dark:border-slate-700"
          />
          <button className="btn-accent px-5 py-2.5 text-base">Añadir</button>
        </form>

        <div className="flex flex-wrap gap-2">
          {categorias.data?.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1.5 text-sm dark:bg-slate-800"
            >
              {c.nombre}
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar la categoría "${c.nombre}"?`))
                    deleteCategory.mutate(c.id)
                }}
                className="text-slate-500 hover:text-red-600"
                aria-label="Eliminar"
              >
                ✕
              </button>
            </span>
          ))}
          {categorias.data?.length === 0 && (
            <p className="text-sm text-slate-500">Aún no hay categorías.</p>
          )}
        </div>
      </section>

      {/* ---- Productos ---- */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Productos</h1>
          <button onClick={() => setEditando(null)} className="btn-accent px-4 py-2 text-base">
            + Nuevo
          </button>
        </div>

        {productos.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {productos.error && (
          <p className="text-sm text-red-600">Error al cargar productos.</p>
        )}

        {/* Acordeón por categoría: cada grupo se expande/colapsa. */}
        <div className="space-y-2">
          {grupos.map((g) => {
            const abierta = abiertas.has(g.id)
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900"
              >
                <button
                  onClick={() => alternar(g.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="font-semibold">{g.nombre}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">
                      {g.productos.length}
                    </span>
                    <span
                      className={`text-slate-400 transition-transform ${abierta ? 'rotate-180' : ''}`}
                    >
                      ▾
                    </span>
                  </span>
                </button>

                {abierta && (
                  <ul className="stagger space-y-1 border-t border-slate-100 p-2 dark:border-slate-800">
                    {g.productos.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50"
                      >
                        {/* Miniatura del producto. */}
                        {p.foto_url ? (
                          <img
                            src={p.foto_url}
                            alt=""
                            loading="lazy"
                            className="h-11 w-11 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200 text-lg dark:bg-slate-700">
                            🍽️
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-sm font-medium">
                            {p.nombre}
                            {!p.activo && (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-700">
                                agotado
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {money(p.precio_venta)}
                            {p.controla_stock && ` · stock: ${p.stock_actual}`}
                          </p>
                        </div>
                        <button
                          onClick={() => setEditando(p)}
                          className="rounded-lg px-3 py-2 text-sm text-accent"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar "${p.nombre}"?`)) deleteProduct.mutate(p.id)
                          }}
                          className="rounded-lg px-2 py-2 text-sm text-slate-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        {!productos.isLoading && lista.length === 0 && (
          <p className="text-sm text-slate-500">
            Aún no hay productos. Crea el primero con “+ Nuevo”.
          </p>
        )}
      </section>

      {editando !== undefined && (
        <ProductEditor
          producto={editando}
          categorias={categorias.data ?? []}
          guardando={saveProduct.isPending}
          onCancelar={() => setEditando(undefined)}
          onGuardar={(p: ProductInput) =>
            saveProduct.mutate(p, { onSuccess: () => setEditando(undefined) })
          }
        />
      )}
    </div>
  )
}

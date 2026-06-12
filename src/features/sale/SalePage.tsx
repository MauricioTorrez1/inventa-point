import { useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  useCategories,
  useModifiers,
  useProducts,
  type Modifier,
  type Product,
} from '@/features/catalog/api'
import { money } from '@/lib/format'
import { usePromos } from '@/features/promos/api'
import { useCombos, type Combo } from '@/features/combos/api'
import { calcularPromos, type PromoAplicada } from './promoEngine'
import { useCart, type CartLine, type CartMod } from './cartStore'
import { useCreateSale, type DescuentoManual, type MetodoPago } from './api'
import { CheckoutModal, type ClienteVenta } from './CheckoutModal'

export function SalePage() {
  const { activeTenantId, tenant } = useAuth()
  const tenantId = activeTenantId!

  const categorias = useCategories(tenantId)
  const productos = useProducts(tenantId)
  const modificadores = useModifiers(tenantId)
  const promos = usePromos(tenantId)
  const combos = useCombos(tenantId)
  const crearVenta = useCreateSale(tenantId)

  const { lineas, agregar, cambiarCantidad, quitar, limpiar, total } = useCart()

  // Promos automáticas: solo sobre líneas sin descuento propio (los combos
  // ya traen el suyo prorrateado; no se acumulan).
  const promosAplicadas = useMemo(
    () =>
      calcularPromos(
        lineas.filter((l) => l.descuento === 0 && !l.promo),
        promos.data ?? [],
        productos.data ?? [],
      ),
    [lineas, promos.data, productos.data],
  )
  const ahorroPromos = [...promosAplicadas.values()].reduce((s, p) => s + p.descuento, 0)
  const ahorroCombos = lineas.reduce((s, l) => s + l.descuento, 0)
  const ahorro = ahorroPromos + ahorroCombos
  const totalCarrito = total() - ahorro

  const [catActiva, setCatActiva] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  // Producto cuyo diálogo de extras está abierto (si tiene modificadores).
  const [conOpciones, setConOpciones] = useState<Product | null>(null)
  // Combo cuyo diálogo de armado está abierto.
  const [comboAbierto, setComboAbierto] = useState<Combo | null>(null)

  const COMBOS_TAB = '__combos__'
  const combosActivos = (combos.data ?? []).filter((c) => c.activo)
  const [ultima, setUltima] = useState<{
    cambio: number | null
    premio: string | null
    offline: boolean
  } | null>(null)

  const disponibles = useMemo(
    () => (productos.data ?? []).filter((p) => p.activo),
    [productos.data],
  )
  const filtrados = catActiva
    ? disponibles.filter((p) => p.categoria_id === catActiva)
    : disponibles

  // Modificadores por producto (para saber si abrir el diálogo de extras).
  const modsPorProducto = useMemo(() => {
    const m = new Map<string, Modifier[]>()
    for (const mod of modificadores.data ?? []) {
      if (!m.has(mod.product_id)) m.set(mod.product_id, [])
      m.get(mod.product_id)!.push(mod)
    }
    return m
  }, [modificadores.data])

  function tocarProducto(p: Product) {
    if ((modsPorProducto.get(p.id)?.length ?? 0) > 0) {
      setConOpciones(p)
    } else {
      agregar({ product_id: p.id, nombre: p.nombre, precio_unitario: p.precio_venta })
    }
  }

  async function cobrar(
    metodo: MetodoPago,
    montoRecibido: number | null,
    cliente: ClienteVenta | null,
    descuentoManual: DescuentoManual | null,
  ) {
    try {
      // Cada línea viaja con su descuento: el propio (combo, prorrateado al
      // agregar) o el de la promo automática (el servidor lo re-valida).
      const lineasConPromo = lineas.map((l) => {
        if (l.descuento > 0 || l.promo) return l
        const p = promosAplicadas.get(l.key)
        return { ...l, descuento: p?.descuento ?? 0, promo: p?.promo ?? null }
      })
      const venta = await crearVenta.mutateAsync({
        lineas: lineasConPromo,
        metodo_pago: metodo,
        monto_recibido: montoRecibido,
        cliente_id: cliente?.id ?? null,
        descuento_manual: descuentoManual?.monto ?? 0,
        descuento_motivo: descuentoManual?.motivo ?? null,
      })

      // ¿Esta compra cerró un ciclo de lealtad? -> premio (solo si fue online,
      // offline no se identifica cliente y el contador sube al sincronizar).
      let premio: string | null = null
      if (!venta.offline && cliente && tenant?.lealtad_activa) {
        const meta = tenant.lealtad_meta || 5
        if ((cliente.preCompras + 1) % meta === 0) {
          premio = tenant.lealtad_premio?.trim() || '¡Premio de lealtad!'
        }
      }

      limpiar()
      setCobrando(false)
      setCarritoAbierto(false)
      setUltima({ cambio: venta.cambio, premio, offline: venta.offline })
      setTimeout(() => setUltima(null), premio ? 7000 : 4000)
    } catch (e) {
      alert('No se pudo registrar la venta: ' + (e as Error).message)
    }
  }

  return (
    <div className="flex h-full">
      {/* ---- Productos ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Filtro de categorías */}
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3 dark:border-slate-800">
          <button
            onClick={() => setCatActiva(null)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
              catActiva === null ? 'bg-accent text-accent-fg' : 'bg-slate-200 dark:bg-slate-800'
            }`}
          >
            Todo
          </button>
          {combosActivos.length > 0 && (
            <button
              onClick={() => setCatActiva(COMBOS_TAB)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
                catActiva === COMBOS_TAB
                  ? 'bg-accent text-accent-fg'
                  : 'bg-slate-200 dark:bg-slate-800'
              }`}
            >
              🎁 Combos
            </button>
          )}
          {categorias.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => setCatActiva(c.id)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
                catActiva === c.id ? 'bg-accent text-accent-fg' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>

        {/* Grid de productos o combos (la cascada se reinicia al cambiar de pestaña) */}
        <div
          key={catActiva ?? 'todo'}
          className="stagger grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {catActiva === COMBOS_TAB &&
            combosActivos.map((c) => (
              <ComboCard
                key={c.id}
                combo={c}
                productos={disponibles}
                onTocar={() => setComboAbierto(c)}
              />
            ))}
          {catActiva !== COMBOS_TAB && filtrados.map((p) => (
            <button
              key={p.id}
              onClick={() => tocarProducto(p)}
              className="flex min-h-touch flex-col justify-between overflow-hidden rounded-2xl bg-white text-left shadow-sm active:scale-[0.97] dark:bg-slate-900"
            >
              {/* Foto del producto (si tiene). */}
              {p.foto_url && (
                <img
                  src={p.foto_url}
                  alt=""
                  loading="lazy"
                  className="h-24 w-full object-cover"
                />
              )}
              <span className="flex flex-1 flex-col justify-between p-3">
                <span className="font-medium leading-tight">{p.nombre}</span>
                <span className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-accent">{money(p.precio_venta)}</span>
                  {(modsPorProducto.get(p.id)?.length ?? 0) > 0 && (
                    <span className="text-xs text-slate-400">🧂 extras</span>
                  )}
                </span>
              </span>
            </button>
          ))}
          {catActiva !== COMBOS_TAB && filtrados.length === 0 && (
            <p className="col-span-full mt-8 text-center text-sm text-slate-500">
              {productos.isLoading ? 'Cargando…' : 'No hay productos disponibles.'}
            </p>
          )}
        </div>
      </div>

      {/* ---- Carrito: panel lateral en escritorio ---- */}
      <CartPanel
        className="hidden w-80 flex-col border-l border-slate-200 dark:border-slate-800 sm:flex"
        lineas={lineas}
        total={totalCarrito}
        ahorro={ahorro}
        promos={promosAplicadas}
        onMas={(k) => cambiarCantidad(k, 1)}
        onMenos={(k) => cambiarCantidad(k, -1)}
        onQuitar={quitar}
        onLimpiar={limpiar}
        onCobrar={() => setCobrando(true)}
      />

      {/* ---- Carrito: barra inferior en móvil ---- */}
      {lineas.length > 0 && (
        <button
          onClick={() => setCarritoAbierto(true)}
          className="btn-accent animate-pop-plain fixed inset-x-3 bottom-20 z-30 flex items-center justify-between px-5 py-3 sm:hidden"
        >
          <span>{lineas.reduce((s, l) => s + l.cantidad, 0)} artículos</span>
          <span>{money(totalCarrito)} · Ver →</span>
        </button>
      )}

      {carritoAbierto && (
        <div className="animate-backdrop fixed inset-0 z-40 flex flex-col bg-black/40 sm:hidden">
          <button className="flex-1" onClick={() => setCarritoAbierto(false)} aria-label="Cerrar" />
          <CartPanel
            className="animate-slide-up max-h-[75%] flex-col rounded-t-3xl bg-white dark:bg-slate-900"
            lineas={lineas}
            total={totalCarrito}
            ahorro={ahorro}
            promos={promosAplicadas}
            onMas={(k) => cambiarCantidad(k, 1)}
            onMenos={(k) => cambiarCantidad(k, -1)}
            onQuitar={quitar}
            onLimpiar={limpiar}
            onCobrar={() => setCobrando(true)}
          />
        </div>
      )}

      {/* Diálogo de armado de combo. */}
      {comboAbierto && (
        <ComboDialog
          combo={comboAbierto}
          productos={disponibles}
          categorias={categorias.data ?? []}
          onAgregar={(componentes) => {
            for (const c of componentes) agregar(c)
            setComboAbierto(null)
          }}
          onCancelar={() => setComboAbierto(null)}
        />
      )}

      {/* Diálogo de extras y especificaciones a cocina. */}
      {conOpciones && (
        <OptionsDialog
          producto={conOpciones}
          mods={modsPorProducto.get(conOpciones.id) ?? []}
          onAgregar={(linea) => {
            agregar(linea)
            setConOpciones(null)
          }}
          onCancelar={() => setConOpciones(null)}
        />
      )}

      {cobrando && (
        <CheckoutModal
          total={totalCarrito}
          procesando={crearVenta.isPending}
          tenantId={tenantId}
          lealtad={{
            activa: tenant?.lealtad_activa ?? false,
            meta: tenant?.lealtad_meta ?? 5,
            premio: tenant?.lealtad_premio ?? null,
          }}
          onCobrar={cobrar}
          onCancelar={() => setCobrando(false)}
        />
      )}

      {/* Toast de venta exitosa */}
      {ultima && (
        <div
          className={`animate-pop fixed left-1/2 top-4 z-50 w-[min(92vw,24rem)] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-white shadow-lg ${
            ultima.offline ? 'bg-amber-500' : 'bg-emerald-600'
          }`}
        >
          <p className="font-semibold">
            {ultima.offline ? '📴 Venta guardada sin conexión' : '✅ Venta registrada'}
          </p>
          {ultima.cambio != null && ultima.cambio > 0 && (
            <p className="text-sm">Cambio: {money(ultima.cambio)}</p>
          )}
          {ultima.offline && (
            <p className="text-sm opacity-90">Se sincronizará al recuperar internet.</p>
          )}
          {ultima.premio && (
            <p className="mt-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold">
              🎉 ¡Cliente premiado! {ultima.premio}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Combos: tarjeta y diálogo de armado ----

// Línea que el combo agrega al carrito (componente real con su prorrateo).
interface ComponenteCombo {
  product_id: string
  nombre: string
  precio_unitario: number
  descuento: number
  promo: string
}

function ComboCard({
  combo,
  productos,
  onTocar,
}: {
  combo: Combo
  productos: Product[]
  onTocar: () => void
}) {
  // Valor de referencia: suma de precios regulares (mínimos por categoría).
  const referencia = combo.combo_slots.reduce((s, slot) => {
    if (slot.producto_id) {
      return s + (productos.find((p) => p.id === slot.producto_id)?.precio_venta ?? 0)
    }
    const deCat = productos.filter((p) => p.categoria_id === slot.categoria_id)
    return s + (deCat.length ? Math.min(...deCat.map((p) => p.precio_venta)) : 0)
  }, 0)
  const ahorra = Math.max(referencia - combo.precio, 0)

  return (
    <button
      onClick={onTocar}
      className="flex min-h-touch flex-col justify-between rounded-2xl border-2 border-[rgb(var(--accent)/0.35)] bg-white p-3 text-left shadow-sm active:scale-[0.97] dark:bg-slate-900"
    >
      <span className="font-medium leading-tight">🎁 {combo.nombre}</span>
      <span className="mt-1 flex items-center justify-between text-sm">
        <span className="font-semibold text-accent">{money(combo.precio)}</span>
        {ahorra > 0 && (
          <span className="text-xs text-emerald-600">ahorra {money(ahorra)}</span>
        )}
      </span>
    </button>
  )
}

function ComboDialog({
  combo,
  productos,
  categorias,
  onAgregar,
  onCancelar,
}: {
  combo: Combo
  productos: Product[]
  categorias: { id: string; nombre: string }[]
  onAgregar: (componentes: ComponenteCombo[]) => void
  onCancelar: () => void
}) {
  // Elección por slot (los fijos quedan resueltos de antemano).
  const [eleccion, setEleccion] = useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {}
    for (const s of combo.combo_slots) {
      if (s.producto_id) ini[s.id] = s.producto_id
    }
    return ini
  })

  const productoDe = (id: string | undefined) => productos.find((p) => p.id === id)
  const completo = combo.combo_slots.every((s) => !!eleccion[s.id])

  // Suma regular de lo elegido (para mostrar el ahorro real).
  const elegidos = combo.combo_slots
    .map((s) => productoDe(eleccion[s.id]))
    .filter((p): p is Product => !!p)
  const suma = elegidos.reduce((s, p) => s + p.precio_venta, 0)
  const ahorroReal = Math.max(suma - combo.precio, 0)

  // Prorrateo: cada componente conserva su precio regular y recibe un
  // descuento proporcional; el último absorbe el ajuste de redondeo para que
  // el total quede EXACTO en el precio del combo. (Si el combo costara más
  // que la suma, no se recarga: los descuentos se quedan en 0.)
  function confirmar() {
    if (!completo || elegidos.length !== combo.combo_slots.length) return
    const factor = suma > 0 ? Math.min(combo.precio / suma, 1) : 1
    let acumulado = 0
    const componentes: ComponenteCombo[] = elegidos.map((p, i) => {
      const esUltimo = i === elegidos.length - 1
      const finalLinea = esUltimo
        ? Math.max(Math.min(combo.precio, suma) - acumulado, 0)
        : Math.round(p.precio_venta * factor * 100) / 100
      acumulado += finalLinea
      return {
        product_id: p.id,
        nombre: p.nombre,
        precio_unitario: p.precio_venta,
        descuento: Math.round((p.precio_venta - finalLinea) * 100) / 100,
        promo: combo.nombre,
      }
    })
    onAgregar(componentes)
  }

  return (
    <div className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div className="animate-slide-up max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-3xl">
        <h2 className="text-lg font-bold">🎁 {combo.nombre}</h2>
        <p className="mb-4 text-sm text-slate-500">Arma el combo</p>

        <div className="space-y-4">
          {combo.combo_slots.map((slot) => {
            // Producto fijo: solo se muestra como incluido.
            if (slot.producto_id) {
              const p = productoDe(slot.producto_id)
              return (
                <div
                  key={slot.id}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 text-sm dark:bg-slate-800/40"
                >
                  <span>✓ {p?.nombre ?? 'Producto'}</span>
                  <span className="text-xs text-slate-400">incluido</span>
                </div>
              )
            }
            // Elección de la categoría.
            const opciones = productos.filter((p) => p.categoria_id === slot.categoria_id)
            const titulo =
              slot.etiqueta?.trim() ||
              `Elige de ${categorias.find((c) => c.id === slot.categoria_id)?.nombre ?? 'la categoría'}`
            return (
              <div key={slot.id}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {titulo}
                </p>
                {opciones.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin productos disponibles.</p>
                ) : (
                  <div className="space-y-1.5">
                    {opciones.map((p) => {
                      const activo = eleccion[slot.id] === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setEleccion((e) => ({ ...e, [slot.id]: p.id }))}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm transition ${
                            activo
                              ? 'border-accent bg-[rgb(var(--accent)/0.1)] font-medium text-accent'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span>{p.nombre}</span>
                          <span className={activo ? '' : 'text-slate-400'}>
                            {money(p.precio_venta)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {completo && ahorroReal > 0 && (
          <p className="mt-4 text-center text-sm font-medium text-emerald-600">
            ✨ Ahorras {money(ahorroReal)} vs. comprar por separado
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button onClick={onCancelar} className="btn-neutral flex-1 py-3">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!completo}
            className="btn-accent flex-1 py-3 disabled:opacity-50"
          >
            Agregar · {money(Math.min(combo.precio, suma || combo.precio))}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Diálogo de extras (toppings/salsas) y nota a cocina ----
function OptionsDialog({
  producto,
  mods,
  onAgregar,
  onCancelar,
}: {
  producto: Product
  mods: Modifier[]
  onAgregar: (linea: {
    product_id: string
    nombre: string
    precio_unitario: number
    modificadores: CartMod[]
    notas: string | null
  }) => void
  onCancelar: () => void
}) {
  // Agrupar: si alguna opción del grupo es obligatoria, el grupo es de
  // elección única (radio); si no, de selección libre (checkbox).
  const grupos = useMemo(() => {
    const g = new Map<string, { items: Modifier[]; unico: boolean }>()
    for (const m of mods) {
      const nombre = m.grupo?.trim() || 'Extras'
      if (!g.has(nombre)) g.set(nombre, { items: [], unico: false })
      const grupo = g.get(nombre)!
      grupo.items.push(m)
      if (m.obligatorio) grupo.unico = true
    }
    return [...g.entries()]
  }, [mods])

  // Selección: para grupos únicos, id elegido; para libres, set de ids.
  const [radios, setRadios] = useState<Record<string, string>>(() => {
    const ini: Record<string, string> = {}
    for (const [nombre, grupo] of grupos) {
      if (grupo.unico && grupo.items.length > 0) ini[nombre] = grupo.items[0].id
    }
    return ini
  })
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [notas, setNotas] = useState('')

  const elegidos: Modifier[] = []
  for (const [nombre, grupo] of grupos) {
    if (grupo.unico) {
      const sel = grupo.items.find((i) => i.id === radios[nombre])
      if (sel) elegidos.push(sel)
    } else {
      elegidos.push(...grupo.items.filter((i) => checks.has(i.id)))
    }
  }
  const total = producto.precio_venta + elegidos.reduce((s, m) => s + Number(m.precio), 0)

  function confirmar() {
    onAgregar({
      product_id: producto.id,
      nombre: producto.nombre,
      precio_unitario: total,
      modificadores: elegidos.map((m) => ({ nombre: m.nombre, precio: Number(m.precio) })),
      notas: notas.trim() || null,
    })
  }

  return (
    <div className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div className="animate-slide-up max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl dark:bg-slate-900 sm:rounded-3xl">
        <h2 className="text-lg font-bold">{producto.nombre}</h2>
        <p className="mb-4 text-sm text-slate-500">Personaliza el pedido</p>

        <div className="space-y-4">
          {grupos.map(([nombre, grupo]) => (
            <div key={nombre}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {nombre} {grupo.unico && '· elige una'}
              </p>
              <div className="space-y-1.5">
                {grupo.items.map((m) => {
                  const activo = grupo.unico
                    ? radios[nombre] === m.id
                    : checks.has(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (grupo.unico) {
                          setRadios((r) => ({ ...r, [nombre]: m.id }))
                        } else {
                          setChecks((c) => {
                            const n = new Set(c)
                            if (n.has(m.id)) n.delete(m.id)
                            else n.add(m.id)
                            return n
                          })
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm transition ${
                        activo
                          ? 'border-accent bg-[rgb(var(--accent)/0.1)] font-medium text-accent'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span>{m.nombre}</span>
                      <span className={activo ? '' : 'text-slate-400'}>
                        {Number(m.precio) > 0 ? `+${money(m.precio)}` : 'Gratis'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Especificaciones para cocina. */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nota a cocina
            </p>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. sin cebolla, término medio…"
              className="field text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onCancelar} className="btn-neutral flex-1 py-3">
            Cancelar
          </button>
          <button onClick={confirmar} className="btn-accent flex-1 py-3">
            Agregar · {money(total)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Panel del carrito reutilizable (escritorio y móvil) ----
function CartPanel({
  className,
  lineas,
  total,
  ahorro,
  promos,
  onMas,
  onMenos,
  onQuitar,
  onLimpiar,
  onCobrar,
}: {
  className: string
  lineas: CartLine[]
  total: number
  ahorro: number
  promos: Map<string, PromoAplicada>
  onMas: (key: string) => void
  onMenos: (key: string) => void
  onQuitar: (key: string) => void
  onLimpiar: () => void
  onCobrar: () => void
}) {
  return (
    <aside className={`flex bg-white dark:bg-slate-900 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="font-bold">Orden</h2>
        {lineas.length > 0 && (
          <button onClick={onLimpiar} className="text-sm text-slate-500 hover:text-red-600">
            Vaciar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {lineas.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">
            Toca un producto para agregarlo.
          </p>
        ) : (
          <ul className="space-y-2">
            {lineas.map((l) => (
              <li key={l.key} className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{l.nombre}</span>
                  <button
                    onClick={() => onQuitar(l.key)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>

                {/* Extras y nota a cocina de la línea. */}
                {l.modificadores.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {l.modificadores.map((m) => m.nombre).join(' · ')}
                  </p>
                )}
                {l.notas && (
                  <p className="mt-0.5 text-xs italic text-amber-600">📝 {l.notas}</p>
                )}
                {promos.has(l.key) && (
                  <p className="mt-0.5 text-xs font-medium text-emerald-600">
                    ✨ {promos.get(l.key)!.promo} · −{money(promos.get(l.key)!.descuento)}
                  </p>
                )}
                {l.promo && (
                  <p className="mt-0.5 text-xs font-medium text-emerald-600">
                    🎁 {l.promo}
                    {l.descuento > 0 && <> · −{money(l.descuento)}</>}
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between">
                  {/* Las líneas de combo tienen cantidad fija (su descuento
                      está prorrateado); para otro combo, se toca de nuevo. */}
                  {l.promo ? (
                    <span className="text-xs text-slate-400">parte del combo</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onMenos(l.key)}
                        className="h-8 w-8 rounded-lg bg-white text-lg dark:bg-slate-700"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-semibold">{l.cantidad}</span>
                      <button
                        onClick={() => onMas(l.key)}
                        className="h-8 w-8 rounded-lg bg-white text-lg dark:bg-slate-700"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <span className="font-semibold tabular">{money(l.precio_unitario * l.cantidad)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        {ahorro > 0 && (
          <div className="mb-1 flex items-center justify-between text-sm text-emerald-600">
            <span>✨ Ahorro por promos</span>
            <span className="tabular">−{money(ahorro)}</span>
          </div>
        )}
        <div className="mb-3 flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular">{money(total)}</span>
        </div>
        <button
          onClick={onCobrar}
          disabled={lineas.length === 0}
          className="btn-accent w-full py-3 text-base disabled:opacity-40"
        >
          Cobrar
        </button>
      </div>
    </aside>
  )
}

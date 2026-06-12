import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { money, entero } from '@/lib/format'
import {
  PERIODOS,
  desplazar,
  esPeriodoActual,
  etiquetaRango,
  type Periodo,
} from '@/features/reports/api'
import {
  METODOS,
  useCancelarCuenta,
  useCrearCuenta,
  useCuentasPorPagar,
  useEliminarGasto,
  useEliminarProveedor,
  useFlujoCaja,
  useGastos,
  useGuardarGasto,
  useGuardarProveedor,
  useInventarioValorizado,
  useProveedores,
  useRegistrarAbono,
  type CuentaPorPagar,
  type EstadoCuenta,
  type Gasto,
  type GastoEditable,
  type MetodoPago,
  type Proveedor,
} from './api'

type Pestana = 'caja' | 'porpagar' | 'gastos' | 'inventario'

const PESTANAS: { id: Pestana; label: string; icono: string }[] = [
  { id: 'caja', label: 'Flujo de caja', icono: '💵' },
  { id: 'porpagar', label: 'Por pagar', icono: '📥' },
  { id: 'gastos', label: 'Gastos', icono: '🧾' },
  { id: 'inventario', label: 'Inventario', icono: '📦' },
]

export function AccountingPage() {
  const { activeTenantId, tenant } = useAuth()
  const [pestana, setPestana] = useState<Pestana>('caja')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [ancla, setAncla] = useState<Date>(() => new Date())
  const enActual = esPeriodoActual(periodo, ancla)
  const usaPeriodo = pestana === 'caja' || pestana === 'gastos'

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
        <p className="text-sm text-slate-500">Administración de {tenant?.nombre}</p>
      </header>

      {/* Pestañas. */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100/80 p-1 dark:bg-slate-800/60">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
              pestana === p.id
                ? 'bg-white text-accent shadow-soft dark:bg-slate-900'
                : 'text-slate-500'
            }`}
          >
            <span className="mr-1">{p.icono}</span>
            {p.label}
          </button>
        ))}
      </div>

      {/* Navegador de periodo (solo donde aplica). */}
      {usaPeriodo && (
        <>
          <div className="flex rounded-2xl bg-slate-100/80 p-1 dark:bg-slate-800/60">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  periodo === p.id
                    ? 'bg-white text-accent shadow-soft dark:bg-slate-900'
                    : 'text-slate-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setAncla(desplazar(periodo, ancla, -1))}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft transition active:scale-95 dark:bg-slate-900"
              aria-label="Periodo anterior"
            >
              ‹
            </button>
            <div className="text-center">
              <p className="font-semibold">{etiquetaRango(periodo, ancla)}</p>
              {!enActual && (
                <button onClick={() => setAncla(new Date())} className="text-xs text-accent">
                  Volver a hoy
                </button>
              )}
            </div>
            <button
              onClick={() => setAncla(desplazar(periodo, ancla, 1))}
              disabled={enActual}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft transition active:scale-95 disabled:opacity-30 dark:bg-slate-900"
              aria-label="Periodo siguiente"
            >
              ›
            </button>
          </div>
        </>
      )}

      {pestana === 'caja' && <FlujoTab tenantId={activeTenantId} periodo={periodo} ancla={ancla} />}
      {pestana === 'porpagar' && <PorPagarTab tenantId={activeTenantId} />}
      {pestana === 'gastos' && <GastosTab tenantId={activeTenantId} periodo={periodo} ancla={ancla} />}
      {pestana === 'inventario' && <InventarioTab tenantId={activeTenantId} />}
    </div>
  )
}

// ============================================================================
// Flujo de caja
// ============================================================================

function FlujoTab({
  tenantId,
  periodo,
  ancla,
}: {
  tenantId: string | null
  periodo: Periodo
  ancla: Date
}) {
  const { data: f, isLoading, isError } = useFlujoCaja(tenantId, periodo, ancla)

  if (isError) return <p className="card text-sm text-red-600">No se pudo cargar el flujo de caja.</p>
  if (isLoading || !f) return <Cargando />

  const salidasEfectivo = f.salidasGastos + f.salidasAbonos
  const otrasEntradas = f.entradasOtras
  const otrasSalidas = f.salidasGastosOtras + f.salidasAbonosOtras
  const sinMovimiento =
    f.entradasEfectivo === 0 && salidasEfectivo === 0 && otrasEntradas === 0 && otrasSalidas === 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi titulo="Entradas (efvo.)" valor={money(f.entradasEfectivo)} icono="⬆️" />
        <Kpi titulo="Salidas (efvo.)" valor={money(salidasEfectivo)} icono="⬇️" />
        <Kpi
          titulo="Saldo en caja"
          valor={money(f.saldoEfectivo)}
          icono="🧮"
          acento
          negativo={f.saldoEfectivo < 0}
        />
      </div>

      <section className="card space-y-2">
        <h2 className="mb-1 font-semibold">Movimiento de efectivo</h2>
        <Linea etiqueta="Ventas en efectivo" valor={money(f.entradasEfectivo)} />
        <Linea etiqueta="Gastos en efectivo" valor={`– ${money(f.salidasGastos)}`} tenue />
        <Linea etiqueta="Pagos a proveedores (efvo.)" valor={`– ${money(f.salidasAbonos)}`} tenue />
        <div className="my-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
        <Linea
          etiqueta="Saldo neto de efectivo"
          valor={money(f.saldoEfectivo)}
          fuerte
          negativo={f.saldoEfectivo < 0}
        />
      </section>

      {(otrasEntradas > 0 || otrasSalidas > 0) && (
        <section className="card space-y-2">
          <h2 className="mb-1 font-semibold">Otros métodos (no efectivo)</h2>
          <p className="mb-2 text-xs text-slate-400">
            Tarjeta y transferencia no entran a la caja física; se listan como referencia.
          </p>
          {otrasEntradas > 0 && <Linea etiqueta="Ventas tarjeta/transferencia" valor={money(otrasEntradas)} />}
          {otrasSalidas > 0 && (
            <Linea etiqueta="Gastos/pagos no efectivo" valor={`– ${money(otrasSalidas)}`} tenue />
          )}
        </section>
      )}

      {sinMovimiento && (
        <p className="py-6 text-center text-sm text-slate-500">Sin movimientos en este periodo.</p>
      )}
    </div>
  )
}

// ============================================================================
// Cuentas por pagar (+ proveedores)
// ============================================================================

const ESTADO_CHIP: Record<EstadoCuenta, string> = {
  pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  parcial: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  cancelada: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}
const ESTADO_LABEL: Record<EstadoCuenta, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
}

function PorPagarTab({ tenantId }: { tenantId: string | null }) {
  const { data, isLoading, isError } = useCuentasPorPagar(tenantId)
  const { data: proveedores } = useProveedores(tenantId)
  const [verProveedores, setVerProveedores] = useState(false)
  const [nuevaAbierta, setNuevaAbierta] = useState(false)

  if (isError) return <p className="card text-sm text-red-600">No se pudieron cargar las cuentas.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi titulo="Saldo por pagar" valor={money(data?.totalPendiente ?? 0)} icono="📥" />
        <Kpi
          titulo="Vencido"
          valor={money(data?.totalVencido ?? 0)}
          icono="⚠️"
          negativo={(data?.totalVencido ?? 0) > 0}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setNuevaAbierta((v) => !v)} className="btn-accent flex-1 py-2.5 text-sm">
          {nuevaAbierta ? 'Cancelar' : '+ Nueva cuenta'}
        </button>
        <button onClick={() => setVerProveedores((v) => !v)} className="btn-neutral px-4 py-2.5 text-sm">
          {verProveedores ? 'Ocultar proveedores' : '👤 Proveedores'}
        </button>
      </div>

      {nuevaAbierta && (
        <NuevaCuentaForm
          tenantId={tenantId}
          proveedores={proveedores ?? []}
          onListo={() => setNuevaAbierta(false)}
        />
      )}

      {verProveedores && <ProveedoresPanel tenantId={tenantId} proveedores={proveedores ?? []} />}

      {isLoading ? (
        <Cargando />
      ) : data && data.cuentas.length > 0 ? (
        <div className="stagger space-y-3">
          {data.cuentas.map((c) => (
            <CuentaCard key={c.id} tenantId={tenantId} cuenta={c} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">No hay cuentas por pagar registradas.</p>
      )}
    </div>
  )
}

function NuevaCuentaForm({
  tenantId,
  proveedores,
  onListo,
}: {
  tenantId: string | null
  proveedores: Proveedor[]
  onListo: () => void
}) {
  const crear = useCrearCuenta(tenantId)
  const [supplierId, setSupplierId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [monto, setMonto] = useState('')
  const [vencimiento, setVencimiento] = useState('')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const m = Number(monto)
    if (!concepto.trim() || !(m > 0)) return
    await crear.mutateAsync({
      supplier_id: supplierId || null,
      concepto: concepto.trim(),
      categoria: categoria.trim() || null,
      monto_total: m,
      vencimiento: vencimiento || null,
    })
    onListo()
  }

  return (
    <form onSubmit={guardar} className="card space-y-2">
      <input
        className="field"
        placeholder="Concepto (ej. Compra de insumos)"
        value={concepto}
        onChange={(e) => setConcepto(e.target.value)}
        required
      />
      <select className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
        <option value="">Sin proveedor</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          className="field flex-1"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Monto total"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
        />
        <input
          className="field flex-1"
          placeholder="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
      </div>
      <label className="block text-xs text-slate-500">
        Vence
        <input
          className="field mt-1"
          type="date"
          value={vencimiento}
          onChange={(e) => setVencimiento(e.target.value)}
        />
      </label>
      {crear.isError && <p className="text-sm text-red-600">No se pudo crear la cuenta.</p>}
      <button type="submit" disabled={crear.isPending} className="btn-accent w-full py-2.5 text-sm">
        {crear.isPending ? 'Guardando…' : 'Crear cuenta por pagar'}
      </button>
    </form>
  )
}

function CuentaCard({ tenantId, cuenta }: { tenantId: string | null; cuenta: CuentaPorPagar }) {
  const abonar = useRegistrarAbono(tenantId)
  const cancelar = useCancelarCuenta(tenantId)
  const [abriendo, setAbriendo] = useState(false)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const abierta = cuenta.estado === 'pendiente' || cuenta.estado === 'parcial'

  async function pagar(e: React.FormEvent) {
    e.preventDefault()
    const m = Number(monto)
    if (!(m > 0)) return
    await abonar.mutateAsync({ payableId: cuenta.id, monto: m, metodo })
    setMonto('')
    setAbriendo(false)
  }

  return (
    <div className={`card space-y-2 ${cuenta.vencida ? 'ring-1 ring-red-300 dark:ring-red-800' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{cuenta.concepto}</p>
          <p className="text-xs text-slate-500">
            {cuenta.proveedor ?? 'Sin proveedor'}
            {cuenta.categoria ? ` · ${cuenta.categoria}` : ''}
          </p>
        </div>
        <span className={`chip ${ESTADO_CHIP[cuenta.estado]}`}>{ESTADO_LABEL[cuenta.estado]}</span>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-xs text-slate-500">
          <p>
            Pagado {money(cuenta.monto_pagado)} de {money(cuenta.monto_total)}
          </p>
          {cuenta.vencimiento && (
            <p className={cuenta.vencida ? 'font-medium text-red-600' : ''}>
              Vence {new Date(cuenta.vencimiento + 'T00:00:00').toLocaleDateString('es-MX')}
              {cuenta.vencida ? ' · vencida' : ''}
            </p>
          )}
        </div>
        <p className="text-right">
          <span className="block text-[0.65rem] uppercase text-slate-400">Saldo</span>
          <span className="text-lg font-bold tabular">{money(cuenta.saldo)}</span>
        </p>
      </div>

      {abierta && (
        <div className="flex gap-2 pt-1">
          <button onClick={() => setAbriendo((v) => !v)} className="btn-accent flex-1 py-2 text-sm">
            {abriendo ? 'Cancelar' : '💸 Abonar'}
          </button>
          <button
            onClick={() => {
              if (confirm('¿Cancelar esta cuenta por pagar? Quedará marcada como cancelada.'))
                cancelar.mutate(cuenta.id)
            }}
            className="btn-neutral px-4 py-2 text-sm"
          >
            Cancelar cuenta
          </button>
        </div>
      )}

      {abierta && abriendo && (
        <form onSubmit={pagar} className="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
          <div className="flex gap-2">
            <input
              className="field flex-1"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max={cuenta.saldo}
              placeholder={`Monto (máx. ${money(cuenta.saldo)})`}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setMonto(String(cuenta.saldo))}
              className="btn-neutral whitespace-nowrap px-3 text-xs"
            >
              Saldar
            </button>
          </div>
          <select
            className="field"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MetodoPago)}
          >
            {METODOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {abonar.isError && (
            <p className="text-sm text-red-600">
              No se pudo registrar el abono (revisa que no exceda el saldo).
            </p>
          )}
          <button type="submit" disabled={abonar.isPending} className="btn-accent w-full py-2 text-sm">
            {abonar.isPending ? 'Registrando…' : 'Registrar abono'}
          </button>
        </form>
      )}
    </div>
  )
}

function ProveedoresPanel({
  tenantId,
  proveedores,
}: {
  tenantId: string | null
  proveedores: Proveedor[]
}) {
  const guardar = useGuardarProveedor(tenantId)
  const eliminar = useEliminarProveedor(tenantId)
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    await guardar.mutateAsync({ nombre: nombre.trim(), contacto: contacto.trim() || null, notas: null })
    setNombre('')
    setContacto('')
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Proveedores</h2>
      <form onSubmit={agregar} className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          className="field flex-1"
          placeholder="Contacto"
          value={contacto}
          onChange={(e) => setContacto(e.target.value)}
        />
        <button type="submit" disabled={guardar.isPending} className="btn-accent px-4 text-sm">
          +
        </button>
      </form>
      {proveedores.length > 0 ? (
        <ul className="space-y-1">
          {proveedores.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {p.nombre}
                {p.contacto && <span className="text-slate-400"> · {p.contacto}</span>}
              </span>
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar a ${p.nombre}?`)) eliminar.mutate(p.id)
                }}
                className="text-xs text-red-500"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">Aún no hay proveedores.</p>
      )}
    </section>
  )
}

// ============================================================================
// Gastos (gestión completa)
// ============================================================================

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

function GastosTab({
  tenantId,
  periodo,
  ancla,
}: {
  tenantId: string | null
  periodo: Periodo
  ancla: Date
}) {
  const { data: gastos, isLoading, isError } = useGastos(tenantId, periodo, ancla)
  const eliminar = useEliminarGasto(tenantId)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [creando, setCreando] = useState(false)

  const total = (gastos ?? []).reduce((s, g) => s + g.monto, 0)

  if (isError) return <p className="card text-sm text-red-600">No se pudieron cargar los gastos.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi titulo="Total gastos" valor={money(total)} icono="🧾" />
        <Kpi titulo="Registros" valor={entero(gastos?.length ?? 0)} icono="#️⃣" />
      </div>

      <button
        onClick={() => {
          setEditando(null)
          setCreando((v) => !v)
        }}
        className="btn-accent w-full py-2.5 text-sm"
      >
        {creando ? 'Cancelar' : '+ Registrar gasto'}
      </button>

      {(creando || editando) && (
        <GastoForm
          tenantId={tenantId}
          inicial={editando}
          onListo={() => {
            setCreando(false)
            setEditando(null)
          }}
        />
      )}

      {isLoading ? (
        <Cargando />
      ) : gastos && gastos.length > 0 ? (
        <div className="stagger space-y-2">
          {gastos.map((g) => (
            <div key={g.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{g.concepto}</p>
                <p className="text-xs text-slate-500">
                  {g.categoria_gasto || 'Sin categoría'} · {METODO_LABEL[g.metodo_pago]} ·{' '}
                  {new Date(g.creado_en).toLocaleDateString('es-MX')}
                </p>
              </div>
              <span className="font-semibold tabular">{money(g.monto)}</span>
              <div className="flex flex-col gap-1 text-xs">
                <button
                  onClick={() => {
                    setCreando(false)
                    setEditando(g)
                  }}
                  className="text-accent"
                >
                  Editar
                </button>
                <button
                  onClick={() => {
                    if (confirm('¿Eliminar este gasto?')) eliminar.mutate(g.id)
                  }}
                  className="text-red-500"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">Sin gastos en este periodo.</p>
      )}
    </div>
  )
}

function GastoForm({
  tenantId,
  inicial,
  onListo,
}: {
  tenantId: string | null
  inicial: Gasto | null
  onListo: () => void
}) {
  const guardar = useGuardarGasto(tenantId)
  const [concepto, setConcepto] = useState(inicial?.concepto ?? '')
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : '')
  const [categoria, setCategoria] = useState(inicial?.categoria_gasto ?? '')
  const [metodo, setMetodo] = useState<MetodoPago>(inicial?.metodo_pago ?? 'efectivo')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const m = Number(monto)
    if (!concepto.trim() || !(m > 0)) return
    const datos: GastoEditable = {
      id: inicial?.id,
      concepto: concepto.trim(),
      monto: m,
      categoria_gasto: categoria.trim() || null,
      metodo_pago: metodo,
    }
    await guardar.mutateAsync(datos)
    onListo()
  }

  return (
    <form onSubmit={enviar} className="card space-y-2">
      <input
        className="field"
        placeholder="Concepto (ej. Renta, Insumos)"
        value={concepto}
        onChange={(e) => setConcepto(e.target.value)}
        required
      />
      <div className="flex gap-2">
        <input
          className="field flex-1"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
        />
        <input
          className="field flex-1"
          placeholder="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
      </div>
      <select className="field" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
        {METODOS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {guardar.isError && <p className="text-sm text-red-600">No se pudo guardar el gasto.</p>}
      <button type="submit" disabled={guardar.isPending} className="btn-accent w-full py-2.5 text-sm">
        {guardar.isPending ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Guardar gasto'}
      </button>
    </form>
  )
}

// ============================================================================
// Inventario valorizado
// ============================================================================

function InventarioTab({ tenantId }: { tenantId: string | null }) {
  const { data, isLoading, isError } = useInventarioValorizado(tenantId)
  const [soloBajos, setSoloBajos] = useState(false)

  if (isError) return <p className="card text-sm text-red-600">No se pudo cargar el inventario.</p>
  if (isLoading || !data) return <Cargando />

  const items = soloBajos ? data.items.filter((i) => i.bajo) : data.items

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi titulo="Valor al costo" valor={money(data.valorTotal)} icono="📦" acento />
        <Kpi
          titulo="Bajo stock"
          valor={entero(data.numBajoStock)}
          icono="⚠️"
          negativo={data.numBajoStock > 0}
        />
      </div>

      {data.numBajoStock > 0 && (
        <button
          onClick={() => setSoloBajos((v) => !v)}
          className={`w-full rounded-2xl py-2 text-sm font-medium transition ${
            soloBajos ? 'bg-accent text-accent-fg' : 'btn-neutral'
          }`}
        >
          {soloBajos ? 'Mostrar todo' : `⚠️ Ver solo bajo stock (${data.numBajoStock})`}
        </button>
      )}

      {items.length > 0 ? (
        <section className="card">
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.nombre}</p>
                  <p className={`text-xs ${i.bajo ? 'text-red-600' : 'text-slate-500'}`}>
                    {entero(i.stock_actual)} u. {i.bajo && `(mín. ${entero(i.stock_minimo)})`} ·{' '}
                    {money(i.costo)} c/u
                  </p>
                </div>
                <span className="font-medium tabular">{money(i.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">
          {soloBajos ? 'Nada bajo el mínimo.' : 'Sin productos con control de inventario.'}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// UI compartida
// ============================================================================

function Cargando() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
      ))}
    </div>
  )
}

function Kpi({
  titulo,
  valor,
  icono,
  acento,
  negativo,
}: {
  titulo: string
  valor: string
  icono: string
  acento?: boolean
  negativo?: boolean
}) {
  return (
    <div
      className={`rounded-3xl p-4 shadow-soft ${acento ? 'text-accent-fg' : 'card'}`}
      style={
        acento
          ? { backgroundImage: 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent)/0.82))' }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <p className={`text-xs ${acento ? 'opacity-80' : 'text-slate-500'}`}>{titulo}</p>
        <span className="text-base">{icono}</span>
      </div>
      <p className={`mt-1 text-xl font-bold tabular ${negativo && !acento ? 'text-red-600' : ''}`}>
        {valor}
      </p>
    </div>
  )
}

function Linea({
  etiqueta,
  valor,
  tenue,
  fuerte,
  negativo,
}: {
  etiqueta: string
  valor: string
  tenue?: boolean
  fuerte?: boolean
  negativo?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${tenue ? 'text-slate-400' : 'text-slate-500'}`}>{etiqueta}</span>
      <span
        className={`tabular ${fuerte ? 'text-lg font-bold' : 'font-medium'} ${
          negativo ? 'text-red-600' : ''
        }`}
      >
        {valor}
      </span>
    </div>
  )
}

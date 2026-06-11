import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { money, entero, porcentaje } from '@/lib/format'
import {
  PERIODOS,
  desplazar,
  esPeriodoActual,
  etiquetaRango,
  useAgregarGasto,
  useReporte,
  type Periodo,
  type Reporte,
} from './api'

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

export function ReportsPage() {
  const { activeTenantId, tenant } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>('dia')
  const [ancla, setAncla] = useState<Date>(() => new Date())

  const { data: r, isLoading, isError } = useReporte(activeTenantId, periodo, ancla)
  const enActual = esPeriodoActual(periodo, ancla)

  function exportarCsv() {
    if (!r) return
    descargarCsv(r, periodo, etiquetaRango(periodo, ancla), tenant?.nombre ?? 'negocio')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-sm text-slate-500">Cuentas de {tenant?.nombre}</p>
        </div>
        <button
          onClick={exportarCsv}
          disabled={!r || r.numVentas === 0}
          className="btn-neutral px-4 py-2 text-sm disabled:opacity-50"
        >
          ⬇️ Exportar CSV
        </button>
      </header>

      {/* Selector de periodo (segmentado). */}
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

      {/* Navegador de fechas. */}
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
            <button
              onClick={() => setAncla(new Date())}
              className="text-xs text-accent"
            >
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

      {isError && (
        <p className="card text-sm text-red-600">No se pudo cargar el reporte.</p>
      )}

      {isLoading && !r ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
          ))}
        </div>
      ) : r ? (
        <>
          {/* KPIs principales. */}
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi titulo="Ingresos" valor={money(r.ingresos)} icono="💰" />
            <Kpi titulo="Gastos" valor={money(r.gastos)} icono="🧾" />
            <Kpi
              titulo="Utilidad neta"
              valor={money(r.utilidadNeta)}
              icono="📈"
              acento
            />
            <Kpi titulo="Ventas" valor={entero(r.numVentas)} icono="🛒" />
            <Kpi titulo="Ticket prom." valor={money(r.ticketPromedio)} icono="🎟️" />
            <Kpi titulo="Margen" valor={r.numVentas ? porcentaje(r.margen) : '—'} icono="✨" />
          </div>

          {/* Desglose contable. */}
          <section className="card space-y-2">
            <h2 className="mb-1 font-semibold">Resumen contable</h2>
            <Linea etiqueta="Ingresos por ventas" valor={money(r.ingresos)} />
            <Linea etiqueta="Costo de productos" valor={`– ${money(r.costos)}`} tenue />
            <Linea etiqueta="Utilidad bruta" valor={money(r.utilidadBruta)} />
            <Linea etiqueta="Gastos operativos" valor={`– ${money(r.gastos)}`} tenue />
            <div className="my-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
            <Linea
              etiqueta="Utilidad neta"
              valor={money(r.utilidadNeta)}
              fuerte
              negativo={r.utilidadNeta < 0}
            />
          </section>

          {/* Gráfico de la serie temporal. */}
          {r.numVentas > 0 && <Grafico serie={r.serie} />}

          {/* Cobros por método. */}
          {r.numVentas > 0 && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Cobros por método</h2>
              <ul className="space-y-2">
                {Object.entries(r.porMetodo)
                  .sort((a, b) => b[1] - a[1])
                  .map(([metodo, monto]) => (
                    <li key={metodo} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{METODO_LABEL[metodo] ?? metodo}</span>
                      <span className="font-medium tabular">{money(monto)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {/* Top productos. */}
          {r.topProductos.length > 0 && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Productos más vendidos</h2>
              <ul className="space-y-2">
                {r.topProductos.map((p) => (
                  <li key={p.nombre} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                    <span className="chip">{entero(p.cantidad)}</span>
                    <span className="w-24 text-right font-medium tabular">{money(p.importe)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Gastos: desglose + alta. */}
          <Gastos tenantId={activeTenantId} reporte={r} />

          {r.numVentas === 0 && r.gastos === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              Sin movimientos en este periodo.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------------

function Kpi({
  titulo,
  valor,
  icono,
  acento,
}: {
  titulo: string
  valor: string
  icono: string
  acento?: boolean
}) {
  return (
    <div
      className={`rounded-3xl p-4 shadow-soft ${
        acento ? 'text-accent-fg' : 'card'
      }`}
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
      <p className="mt-1 text-xl font-bold tabular">{valor}</p>
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

function Grafico({ serie }: { serie: Reporte['serie'] }) {
  const max = Math.max(1, ...serie.map((b) => b.ingresos))
  const step = serie.length > 16 ? Math.ceil(serie.length / 8) : serie.length > 7 ? 2 : 1
  return (
    <section className="card">
      <h2 className="mb-4 font-semibold">Ingresos por periodo</h2>
      <div className="flex h-40 items-end gap-[3px]">
        {serie.map((b, i) => (
          <div key={i} className="group flex h-full flex-1 flex-col justify-end" title={`${b.etiqueta}: ${money(b.ingresos)}`}>
            <div
              className="w-full rounded-t-md bg-[rgb(var(--accent)/0.85)] transition-all group-hover:bg-accent"
              style={{ height: `${(b.ingresos / max) * 100}%`, minHeight: b.ingresos > 0 ? '4px' : '0' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px]">
        {serie.map((b, i) => (
          <span key={i} className="flex-1 text-center text-[0.6rem] text-slate-400">
            {i % step === 0 ? b.etiqueta : ''}
          </span>
        ))}
      </div>
    </section>
  )
}

function Gastos({ tenantId, reporte }: { tenantId: string | null; reporte: Reporte }) {
  const [abierto, setAbierto] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState('')
  const agregar = useAgregarGasto(tenantId)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const m = Number(monto)
    if (!concepto.trim() || !(m > 0)) return
    await agregar.mutateAsync({
      concepto: concepto.trim(),
      monto: m,
      categoria_gasto: categoria.trim() || null,
    })
    setConcepto('')
    setMonto('')
    setCategoria('')
    setAbierto(false)
  }

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Gastos</h2>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="text-sm font-medium text-accent"
        >
          {abierto ? 'Cancelar' : '+ Registrar gasto'}
        </button>
      </div>

      {abierto && (
        <form onSubmit={guardar} className="mb-4 space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
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
          {agregar.isError && (
            <p className="text-sm text-red-600">No se pudo guardar el gasto.</p>
          )}
          <button type="submit" disabled={agregar.isPending} className="btn-accent w-full py-2.5 text-sm">
            {agregar.isPending ? 'Guardando…' : 'Guardar gasto'}
          </button>
        </form>
      )}

      {reporte.gastosPorCategoria.length > 0 ? (
        <ul className="space-y-2">
          {reporte.gastosPorCategoria.map((g) => (
            <li key={g.categoria} className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{g.categoria}</span>
              <span className="font-medium tabular">{money(g.monto)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">Sin gastos en este periodo.</p>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------

function descargarCsv(r: Reporte, periodo: Periodo, etiqueta: string, negocio: string) {
  const filas: string[][] = [
    ['Reporte', negocio],
    ['Periodo', `${periodo} · ${etiqueta}`],
    [],
    ['Concepto', 'Monto'],
    ['Ingresos', r.ingresos.toFixed(2)],
    ['Costo de productos', r.costos.toFixed(2)],
    ['Utilidad bruta', r.utilidadBruta.toFixed(2)],
    ['Gastos', r.gastos.toFixed(2)],
    ['Utilidad neta', r.utilidadNeta.toFixed(2)],
    ['N.º de ventas', String(r.numVentas)],
    ['Ticket promedio', r.ticketPromedio.toFixed(2)],
    ['Margen %', r.margen.toFixed(1)],
    [],
    ['Producto', 'Cantidad', 'Importe'],
    ...r.topProductos.map((p) => [p.nombre, String(p.cantidad), p.importe.toFixed(2)]),
  ]
  const csv = filas
    .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte-${periodo}-${etiqueta.replace(/\s+/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

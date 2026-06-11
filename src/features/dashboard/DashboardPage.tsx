import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { money, entero } from '@/lib/format'
import { useResumenDia, useStockBajo } from './api'

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

// Saludo según la hora, para un tono cercano.
function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function DashboardPage() {
  const { activeTenantId, rol, tenant } = useAuth()
  const resumen = useResumenDia(activeTenantId)
  const stockBajo = useStockBajo(activeTenantId)
  const esAdmin = rol === 'admin'

  const r = resumen.data

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-28">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{saludo()} 👋</h1>
        <p className="text-sm text-slate-500">Resumen de hoy en {tenant?.nombre}</p>
      </div>

      {/* Tarjetas de KPIs */}
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi titulo="Ventas" valor={entero(r?.ventas ?? 0)} icono="🛒" />
        <Kpi titulo="Ingresos" valor={money(r?.ingresos)} icono="💰" />
        {esAdmin && <Kpi titulo="Utilidad" valor={money(r?.utilidad)} icono="📈" acento />}
        <Kpi titulo="Ticket prom." valor={money(r?.ticketPromedio)} icono="🎟️" />
      </div>

      {/* Desglose por método de pago */}
      {r && r.ventas > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Cobros por método</h2>
          <ul className="space-y-2">
            {Object.entries(r.porMetodo).map(([metodo, monto]) => (
              <li key={metodo} className="flex justify-between text-sm">
                <span className="text-slate-500">{METODO_LABEL[metodo] ?? metodo}</span>
                <span className="font-medium tabular">{money(monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Alertas de stock bajo (solo admin) */}
      {esAdmin && (stockBajo.data?.length ?? 0) > 0 && (
        <section className="rounded-3xl border border-amber-300/70 bg-amber-50/80 p-5 shadow-soft dark:border-amber-700/60 dark:bg-amber-950/30">
          <h2 className="mb-2 font-semibold text-amber-700 dark:text-amber-400">
            ⚠️ Stock bajo
          </h2>
          <ul className="space-y-1">
            {stockBajo.data!.map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span>{p.nombre}</span>
                <span className="font-medium tabular">{p.stock_actual}</span>
              </li>
            ))}
          </ul>
          <Link to="/catalogo" className="mt-2 inline-block text-sm font-medium text-accent">
            Reabastecer en catálogo →
          </Link>
        </section>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/venta" className="btn-accent py-4">
          🛒 Nueva venta
        </Link>
        {esAdmin ? (
          <Link to="/reportes" className="btn-neutral py-4">
            📊 Ver reportes
          </Link>
        ) : (
          <Link to="/cocina" className="btn-neutral py-4">
            🍳 Cocina
          </Link>
        )}
      </div>
    </div>
  )
}

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
      <p className="mt-1 text-2xl font-bold tabular">{valor}</p>
    </div>
  )
}

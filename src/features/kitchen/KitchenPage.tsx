import { useAuth } from '@/features/auth/AuthProvider'
import { useAdvanceOrder, useKitchenOrders, type KitchenOrder } from './api'

// Minutos transcurridos desde la creación, para resaltar comandas que tardan.
function minutos(creado_en: string): number {
  return Math.floor((Date.now() - new Date(creado_en).getTime()) / 60000)
}

export function KitchenPage() {
  const { activeTenantId } = useAuth()
  const tenantId = activeTenantId!
  const ordenes = useKitchenOrders(tenantId)
  const avanzar = useAdvanceOrder(tenantId)

  const lista = ordenes.data ?? []

  return (
    <div className="p-3 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Cocina</h1>
        <span className="text-sm text-slate-500">{lista.length} comanda(s)</span>
      </div>

      {lista.length === 0 ? (
        <p className="mt-12 text-center text-slate-500">
          {ordenes.isLoading ? 'Cargando…' : 'No hay comandas pendientes 🎉'}
        </p>
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((o) => (
            <OrderCard
              key={o.id}
              orden={o}
              avanzando={avanzar.isPending}
              onAvanzar={(estado) => avanzar.mutate({ id: o.id, estado })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({
  orden,
  avanzando,
  onAvanzar,
}: {
  orden: KitchenOrder
  avanzando: boolean
  onAvanzar: (estado: 'en_preparacion' | 'completada') => void
}) {
  const mins = minutos(orden.creado_en)
  const urgente = mins >= 10
  const enPrep = orden.estado_cocina === 'en_preparacion'

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 bg-white p-3 shadow-sm dark:bg-slate-900 ${
        urgente ? 'border-red-500' : enPrep ? 'border-amber-400' : 'border-transparent'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-lg font-bold">#{orden.folio}</span>
        <span className={`text-sm ${urgente ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
          {mins} min
        </span>
      </div>

      <ul className="mb-3 flex-1 space-y-1.5">
        {orden.sale_items.map((it) => (
          <li key={it.id} className="text-sm">
            <span className="font-semibold">{it.cantidad}×</span> {it.nombre_snapshot}
            {(it.modificadores?.length ?? 0) > 0 && (
              <span className="mt-0.5 block pl-5 text-xs font-medium text-accent">
                {it.modificadores.map((m) => m.nombre).join(' · ')}
              </span>
            )}
            {it.notas && (
              <span className="mt-0.5 block pl-5 text-xs italic text-amber-600">
                ⤷ {it.notas}
              </span>
            )}
          </li>
        ))}
      </ul>

      {enPrep ? (
        <button
          onClick={() => onAvanzar('completada')}
          disabled={avanzando}
          className="btn-touch w-full bg-green-600 py-2.5 text-base text-white disabled:opacity-60"
        >
          ✓ Lista
        </button>
      ) : (
        <button
          onClick={() => onAvanzar('en_preparacion')}
          disabled={avanzando}
          className="btn-touch w-full bg-amber-500 py-2.5 text-base text-white disabled:opacity-60"
        >
          Empezar
        </button>
      )}
    </div>
  )
}

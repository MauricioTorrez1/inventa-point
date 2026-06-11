import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { conLimite, esErrorDeRed, TIMEOUT, useOnline } from '@/lib/online'
import {
  contar,
  eliminar,
  listar,
  marcarIntento,
  suscribir,
  type OpPendiente,
} from '@/lib/offlineQueue'

const MAX_INTENTOS = 5

interface SyncState {
  online: boolean
  pendientes: number
  sincronizando: boolean
  sincronizar: () => void
}

const SyncContext = createContext<SyncState | undefined>(undefined)

// Ejecuta una operación pendiente contra el servidor (idempotente por token).
// Lanza si no responde a tiempo (se reintentará luego).
async function procesar(op: OpPendiente): Promise<void> {
  const controller = new AbortController()
  let consulta
  if (op.tipo === 'venta') {
    consulta = supabase
      .rpc('crear_venta', {
        p_tenant: op.tenantId,
        p_items: op.payload.items,
        p_metodo_pago: op.payload.metodo_pago,
        p_monto_recibido: op.payload.monto_recibido ?? null,
        p_cliente_id: op.payload.cliente_id ?? null,
        p_idempotencia: op.id,
        p_origen: 'offline_sync',
      })
      .abortSignal(controller.signal)
  } else if (op.tipo === 'gasto') {
    consulta = supabase
      .from('expenses')
      .upsert(
        { tenant_id: op.tenantId, ...op.payload, idempotencia: op.id },
        { onConflict: 'idempotencia', ignoreDuplicates: true },
      )
      .abortSignal(controller.signal)
  } else {
    consulta = supabase
      .from('cash_cuts')
      .upsert(
        { tenant_id: op.tenantId, ...op.payload, idempotencia: op.id },
        { onConflict: 'idempotencia', ignoreDuplicates: true },
      )
      .abortSignal(controller.signal)
  }

  const res = await conLimite(consulta)
  if (res === TIMEOUT) {
    controller.abort()
    throw new Error('TIMEOUT')
  }
  if (res.error) throw res.error
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const online = useOnline()
  const qc = useQueryClient()
  const [pendientes, setPendientes] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const corriendo = useRef(false)

  const refrescar = useCallback(() => {
    contar().then(setPendientes)
  }, [])

  const sincronizar = useCallback(async () => {
    if (corriendo.current || !navigator.onLine) return
    corriendo.current = true
    setSincronizando(true)
    let huboExito = false
    try {
      const ops = await listar()
      for (const op of ops) {
        try {
          await procesar(op)
          await eliminar(op.id)
          huboExito = true
        } catch (e) {
          if (esErrorDeRed(e)) break // sin red: se reintenta más tarde
          await marcarIntento(op)
          if (op.intentos + 1 >= MAX_INTENTOS) {
            await eliminar(op.id)
            console.warn('Operación descartada tras varios intentos:', op, e)
          }
        }
      }
    } finally {
      corriendo.current = false
      setSincronizando(false)
      refrescar()
      if (huboExito) qc.invalidateQueries() // refresca catálogo, reportes, etc.
    }
  }, [qc, refrescar])

  // Contador inicial + suscripción a cambios de la cola.
  useEffect(() => {
    refrescar()
    return suscribir(() => {
      refrescar()
      if (navigator.onLine) sincronizar()
    })
  }, [refrescar, sincronizar])

  // Sincroniza al recuperar conexión y cada 20s si quedan pendientes.
  useEffect(() => {
    if (!online) return
    sincronizar()
    const t = setInterval(() => {
      if (pendientes > 0) sincronizar()
    }, 20_000)
    return () => clearInterval(t)
  }, [online, pendientes, sincronizar])

  return (
    <SyncContext.Provider value={{ online, pendientes, sincronizando, sincronizar }}>
      {children}
    </SyncContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync debe usarse dentro de <SyncProvider>')
  return ctx
}

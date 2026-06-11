// Cola de operaciones pendientes de sincronizar, persistida en localStorage.
// Se eligió localStorage (síncrono y fiable, también en la PWA de iOS) en vez
// de IndexedDB, que en WebKit/standalone puede colgarse al abrir la base. El
// volumen es pequeño (unas pocas ventas/gastos), muy por debajo del límite.

export type OpTipo = 'venta' | 'gasto' | 'corte'

export interface OpPendiente {
  id: string // uuid; también es el token de idempotencia en el servidor
  tipo: OpTipo
  tenantId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  creadoEn: number
  intentos: number
}

const CLAVE = 'pos.cola'

function leer(): OpPendiente[] {
  try {
    const v = localStorage.getItem(CLAVE)
    return v ? (JSON.parse(v) as OpPendiente[]) : []
  } catch {
    return []
  }
}

function escribir(ops: OpPendiente[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ops))
  } catch {
    /* almacenamiento lleno o no disponible: se ignora */
  }
}

// --- Suscripción a cambios (para refrescar el contador en la UI) ---
const oyentes = new Set<() => void>()
export function suscribir(cb: () => void): () => void {
  oyentes.add(cb)
  return () => oyentes.delete(cb)
}
function notificar() {
  oyentes.forEach((cb) => cb())
}

export async function encolar(op: Omit<OpPendiente, 'creadoEn' | 'intentos'>): Promise<void> {
  const ops = leer()
  ops.push({ ...op, creadoEn: Date.now(), intentos: 0 })
  escribir(ops)
  notificar()
}

export async function listar(): Promise<OpPendiente[]> {
  return leer().sort((a, b) => a.creadoEn - b.creadoEn)
}

export async function eliminar(id: string): Promise<void> {
  escribir(leer().filter((o) => o.id !== id))
  notificar()
}

export async function marcarIntento(op: OpPendiente): Promise<void> {
  escribir(leer().map((o) => (o.id === op.id ? { ...o, intentos: o.intentos + 1 } : o)))
  notificar()
}

export async function contar(): Promise<number> {
  return leer().length
}

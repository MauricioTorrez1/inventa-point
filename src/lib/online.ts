import { useEffect, useState } from 'react'

export function estaOnline(): boolean {
  return navigator.onLine
}

// ¿Parece un error de red (sin conexión / fetch fallido / cancelado por
// timeout)? Para decidir si una operación se encola en lugar de fallar.
export function esErrorDeRed(e: unknown): boolean {
  if (!navigator.onLine) return true
  const err = e as { name?: string; message?: string }
  const msg = err?.message?.toLowerCase() ?? ''
  return (
    e instanceof TypeError ||
    err?.name === 'AbortError' ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('fetch')
  )
}

// Tiempo máximo de espera antes de asumir "sin conexión" y encolar.
export const RED_TIMEOUT_MS = 6000

// Sentinela que devuelve `conLimite` cuando se agota el tiempo.
export const TIMEOUT = Symbol('timeout')

// Corre `promesa` con un límite de tiempo. Si no responde a tiempo devuelve
// TIMEOUT (sin esperar a que la promesa interna se resuelva). Más fiable que
// confiar solo en abortar el fetch, que en iOS puede no rechazar nunca.
export async function conLimite<T>(
  promesa: PromiseLike<T>,
  ms: number = RED_TIMEOUT_MS,
): Promise<T | typeof TIMEOUT> {
  let t: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<typeof TIMEOUT>((resolve) => {
    t = setTimeout(() => resolve(TIMEOUT), ms)
  })
  try {
    return await Promise.race([promesa, limite])
  } finally {
    if (t) clearTimeout(t)
  }
}

// Hook reactivo al estado de conexión del navegador.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const subir = () => setOnline(true)
    const bajar = () => setOnline(false)
    window.addEventListener('online', subir)
    window.addEventListener('offline', bajar)
    return () => {
      window.removeEventListener('online', subir)
      window.removeEventListener('offline', bajar)
    }
  }, [])
  return online
}

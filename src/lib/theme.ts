import type { Tenant } from './types'

// Convierte "#2563eb" -> "37 99 235" para las variables CSS de Tailwind.
function hexToRgbTriplet(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `${r} ${g} ${b}`
}

// Luminancia relativa para decidir si el texto sobre el acento va blanco o negro.
function readableForeground(hex: string): string {
  const triplet = hexToRgbTriplet(hex)
  if (!triplet) return '255 255 255'
  const [r, g, b] = triplet.split(' ').map(Number)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '15 23 42' : '255 255 255'
}

// Aplica el color de acento del negocio a las variables CSS globales.
export function applyAccent(hex: string) {
  const triplet = hexToRgbTriplet(hex)
  if (!triplet) return
  const root = document.documentElement
  root.style.setProperty('--accent', triplet)
  root.style.setProperty('--accent-fg', readableForeground(hex))
}

// Aplica modo claro/oscuro/auto.
export function applyTheme(modo: Tenant['modo_tema']) {
  const root = document.documentElement
  const prefersDark =
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const dark = modo === 'oscuro' || (modo === 'auto' && prefersDark)
  root.classList.toggle('dark', dark)
}

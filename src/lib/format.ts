// Formato de moneda configurable por negocio. El código (ISO 4217) lo fija el
// tenant activo vía `aplicarMoneda` (llamado desde AuthProvider), igual que el
// acento. `money()` lee el formateador vigente en cada render.

const LOCALE = 'es-MX'

let monedaCodigo = 'MXN'
let fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: monedaCodigo })

// Cambia la moneda en uso. Si el código es inválido, conserva el anterior.
export function aplicarMoneda(codigo: string | null | undefined): void {
  const c = (codigo || 'MXN').toUpperCase()
  if (c === monedaCodigo) return
  try {
    fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: c })
    monedaCodigo = c
  } catch {
    /* código no soportado: se ignora */
  }
}

export function monedaActual(): string {
  return monedaCodigo
}

export function money(n: number | null | undefined): string {
  return fmt.format(Number(n ?? 0))
}

const intFmt = new Intl.NumberFormat(LOCALE)

// Entero con separador de miles (conteos de ventas, unidades, etc.).
export function entero(n: number | null | undefined): string {
  return intFmt.format(Math.round(Number(n ?? 0)))
}

// Porcentaje con un decimal (márgenes y variaciones).
export function porcentaje(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

// Catálogo de monedas frecuentes en LatAm/EE. UU./Europa para los selectores.
export const MONEDAS: { codigo: string; etiqueta: string }[] = [
  { codigo: 'MXN', etiqueta: 'Peso mexicano (MXN)' },
  { codigo: 'USD', etiqueta: 'Dólar (USD)' },
  { codigo: 'EUR', etiqueta: 'Euro (EUR)' },
  { codigo: 'GTQ', etiqueta: 'Quetzal (GTQ)' },
  { codigo: 'NIO', etiqueta: 'Córdoba (NIO)' },
  { codigo: 'CRC', etiqueta: 'Colón (CRC)' },
  { codigo: 'HNL', etiqueta: 'Lempira (HNL)' },
  { codigo: 'COP', etiqueta: 'Peso colombiano (COP)' },
  { codigo: 'PEN', etiqueta: 'Sol (PEN)' },
  { codigo: 'CLP', etiqueta: 'Peso chileno (CLP)' },
  { codigo: 'ARS', etiqueta: 'Peso argentino (ARS)' },
  { codigo: 'BOB', etiqueta: 'Boliviano (BOB)' },
  { codigo: 'DOP', etiqueta: 'Peso dominicano (DOP)' },
  { codigo: 'BRL', etiqueta: 'Real (BRL)' },
]

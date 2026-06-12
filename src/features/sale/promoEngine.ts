import type { Promotion } from '@/features/promos/api'
import type { Product } from '@/features/catalog/api'
import type { CartLine } from './cartStore'

// ----------------------------------------------------------------------------
// Motor de promociones del carrito. Calcula, por línea, la MEJOR promo vigente
// (la de mayor descuento). El descuento se aplica sobre el precio de la línea
// (que ya incluye extras) y nunca excede su importe. El servidor re-valida.
// ----------------------------------------------------------------------------

export interface PromoAplicada {
  descuento: number
  promo: string
}

export function promoVigente(p: Promotion, ahora: Date): boolean {
  if (!p.activo) return false
  if (p.inicia && new Date(p.inicia) > ahora) return false
  if (p.termina && new Date(p.termina) < ahora) return false
  return true
}

function descuentoDe(p: Promotion, linea: CartLine): number {
  const bruto = linea.precio_unitario * linea.cantidad
  let d = 0
  if (p.tipo === 'porcentaje') {
    d = bruto * (Number(p.valor) / 100)
  } else if (p.tipo === 'precio_fijo') {
    // El producto baja a un precio fijo; los extras ya están en el unitario,
    // así que el descuento es la diferencia de precio por unidad.
    d = Math.max(linea.precio_unitario - Number(p.valor), 0) * linea.cantidad
  } else if (p.tipo === 'nxm' && p.n && p.m && p.n > p.m) {
    // Lleva N paga M: por cada grupo completo de N, se regalan N−M unidades.
    d = Math.floor(linea.cantidad / p.n) * (p.n - p.m) * linea.precio_unitario
  }
  return Math.min(Math.round(d * 100) / 100, bruto)
}

// Devuelve un mapa key-de-línea → promo aplicada.
export function calcularPromos(
  lineas: CartLine[],
  promos: Promotion[],
  productos: Product[],
): Map<string, PromoAplicada> {
  const ahora = new Date()
  const vigentes = promos.filter((p) => promoVigente(p, ahora))
  const res = new Map<string, PromoAplicada>()
  if (vigentes.length === 0) return res

  const categoriaDe = new Map(productos.map((p) => [p.id, p.categoria_id]))

  for (const l of lineas) {
    if (!l.product_id) continue
    let mejor: PromoAplicada | null = null
    for (const p of vigentes) {
      const aplica =
        (p.producto_id !== null && p.producto_id === l.product_id) ||
        (p.categoria_id !== null &&
          p.categoria_id === (categoriaDe.get(l.product_id) ?? null))
      if (!aplica) continue
      const d = descuentoDe(p, l)
      if (d > 0 && (!mejor || d > mejor.descuento)) {
        mejor = { descuento: d, promo: p.nombre }
      }
    }
    if (mejor) res.set(l.key, mejor)
  }
  return res
}

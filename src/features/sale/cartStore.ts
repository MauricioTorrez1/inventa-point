import { create } from 'zustand'

// Extra elegido para una línea (snapshot de nombre y precio al momento).
export interface CartMod {
  nombre: string
  precio: number
}

// Una línea del carrito. `key` es un id local (no persiste) para diferenciar
// el mismo producto añadido con extras o notas distintas.
// `precio_unitario` YA incluye los extras (base + suma de modificadores).
export interface CartLine {
  key: string
  product_id: string | null
  nombre: string
  precio_unitario: number
  cantidad: number
  modificadores: CartMod[]
  notas: string | null
}

interface CartState {
  lineas: CartLine[]
  total: () => number
  agregar: (p: {
    product_id: string | null
    nombre: string
    precio_unitario: number
    modificadores?: CartMod[]
    notas?: string | null
  }) => void
  cambiarCantidad: (key: string, delta: number) => void
  setNotas: (key: string, notas: string) => void
  quitar: (key: string) => void
  limpiar: () => void
}

let contador = 0

export const useCart = create<CartState>((set, get) => ({
  lineas: [],

  total: () =>
    get().lineas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0),

  agregar: (p) =>
    set((s) => {
      const mods = p.modificadores ?? []
      const notas = p.notas?.trim() || null
      // Solo se fusionan líneas "simples" (sin extras ni notas) del mismo
      // producto; con personalización, cada adición es una línea propia.
      if (mods.length === 0 && !notas) {
        const existente = s.lineas.find(
          (l) => l.product_id === p.product_id && l.modificadores.length === 0 && !l.notas,
        )
        if (existente) {
          return {
            lineas: s.lineas.map((l) =>
              l.key === existente.key ? { ...l, cantidad: l.cantidad + 1 } : l,
            ),
          }
        }
      }
      contador += 1
      return {
        lineas: [
          ...s.lineas,
          {
            key: `l${contador}`,
            product_id: p.product_id,
            nombre: p.nombre,
            precio_unitario: p.precio_unitario,
            cantidad: 1,
            modificadores: mods,
            notas,
          },
        ],
      }
    }),

  cambiarCantidad: (key, delta) =>
    set((s) => ({
      lineas: s.lineas
        .map((l) => (l.key === key ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    })),

  setNotas: (key, notas) =>
    set((s) => ({
      lineas: s.lineas.map((l) =>
        l.key === key ? { ...l, notas: notas.trim() || null } : l,
      ),
    })),

  quitar: (key) => set((s) => ({ lineas: s.lineas.filter((l) => l.key !== key) })),

  limpiar: () => set({ lineas: [] }),
}))

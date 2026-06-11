import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ----------------------------------------------------------------------------
// Tipos del catálogo (subconjunto de columnas que maneja el front).
// ----------------------------------------------------------------------------
export interface Category {
  id: string
  tenant_id: string
  nombre: string
  orden: number
  activo: boolean
}

export interface Product {
  id: string
  tenant_id: string
  categoria_id: string | null
  nombre: string
  precio_venta: number
  costo: number
  foto_url: string | null
  activo: boolean
  controla_stock: boolean
  stock_actual: number
  stock_minimo: number
  orden: number
}

// ----------------------------------------------------------------------------
// Lecturas. RLS filtra por tenant automáticamente vía memberships, pero
// pasamos el tenantId como clave de caché para no mezclar negocios.
//
// Catálogo cacheado en localStorage: si no hay conexión, se sirve la última
// copia conocida para que la pantalla de venta funcione offline.
// ----------------------------------------------------------------------------
function leerCache<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function guardarCache(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* almacenamiento lleno o no disponible: se ignora */
  }
}

export function useCategories(tenantId: string | null) {
  return useQuery({
    queryKey: ['categories', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Category[]> => {
      const cacheKey = `cache.categories.${tenantId}`
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('id, tenant_id, nombre, orden, activo')
          .order('orden', { ascending: true })
        if (error) throw error
        const filas = data ?? []
        guardarCache(cacheKey, filas)
        return filas
      } catch (e) {
        const cache = leerCache<Category[]>(cacheKey)
        if (cache) return cache
        throw e
      }
    },
  })
}

export function useProducts(tenantId: string | null) {
  return useQuery({
    queryKey: ['products', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Product[]> => {
      const cacheKey = `cache.products.${tenantId}`
      try {
        const { data, error } = await supabase
          .from('products')
          .select(
            'id, tenant_id, categoria_id, nombre, precio_venta, costo, foto_url, activo, controla_stock, stock_actual, stock_minimo, orden',
          )
          .order('orden', { ascending: true })
        if (error) throw error
        const filas = data ?? []
        guardarCache(cacheKey, filas)
        return filas
      } catch (e) {
        const cache = leerCache<Product[]>(cacheKey)
        if (cache) return cache
        throw e
      }
    },
  })
}

// ----------------------------------------------------------------------------
// Modificadores (extras/toppings/salsas por producto).
//   grupo: agrupa opciones (ej. "Salsa", "Extras"). Vacío = grupo "Extras".
//   obligatorio: si CUALQUIER opción del grupo lo es, el grupo se vuelve de
//   elección única y obligatoria (radio) en la pantalla de venta.
// ----------------------------------------------------------------------------
export interface Modifier {
  id: string
  tenant_id: string
  product_id: string
  grupo: string | null
  nombre: string
  precio: number
  obligatorio: boolean
  orden: number
}

export function useModifiers(tenantId: string | null) {
  return useQuery({
    queryKey: ['modifiers', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Modifier[]> => {
      const cacheKey = `cache.modifiers.${tenantId}`
      try {
        const { data, error } = await supabase
          .from('modifiers')
          .select('id, tenant_id, product_id, grupo, nombre, precio, obligatorio, orden')
          .order('orden', { ascending: true })
        if (error) throw error
        const filas = data ?? []
        guardarCache(cacheKey, filas)
        return filas
      } catch (e) {
        const cache = leerCache<Modifier[]>(cacheKey)
        if (cache) return cache
        throw e
      }
    },
  })
}

export interface ModifierInput {
  product_id: string
  grupo: string | null
  nombre: string
  precio: number
  obligatorio: boolean
}

export function useSaveModifier(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: ModifierInput) => {
      const { error } = await supabase.from('modifiers').insert({
        tenant_id: tenantId,
        product_id: m.product_id,
        grupo: m.grupo,
        nombre: m.nombre,
        precio: m.precio,
        obligatorio: m.obligatorio,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modifiers', tenantId] }),
  })
}

export function useDeleteModifier(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('modifiers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modifiers', tenantId] }),
  })
}

// ----------------------------------------------------------------------------
// Mutaciones de categorías.
// ----------------------------------------------------------------------------
export function useSaveCategory(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cat: Partial<Category> & { nombre: string }) => {
      if (cat.id) {
        const { error } = await supabase
          .from('categories')
          .update({ nombre: cat.nombre, orden: cat.orden ?? 0, activo: cat.activo ?? true })
          .eq('id', cat.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ tenant_id: tenantId, nombre: cat.nombre, orden: cat.orden ?? 0 })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories', tenantId] }),
  })
}

export function useDeleteCategory(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', tenantId] })
      qc.invalidateQueries({ queryKey: ['products', tenantId] })
    },
  })
}

// ----------------------------------------------------------------------------
// Mutaciones de productos.
// ----------------------------------------------------------------------------
export type ProductInput = Omit<Product, 'id' | 'tenant_id' | 'orden'> & {
  id?: string
  orden?: number
}

export function useSaveProduct(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: ProductInput) => {
      const payload = {
        categoria_id: p.categoria_id,
        nombre: p.nombre,
        precio_venta: p.precio_venta,
        costo: p.costo,
        foto_url: p.foto_url,
        activo: p.activo,
        controla_stock: p.controla_stock,
        stock_actual: p.stock_actual,
        stock_minimo: p.stock_minimo,
        orden: p.orden ?? 0,
      }
      if (p.id) {
        const { error } = await supabase.from('products').update(payload).eq('id', p.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('products')
          .insert({ tenant_id: tenantId, ...payload })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', tenantId] }),
  })
}

export function useDeleteProduct(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', tenantId] }),
  })
}

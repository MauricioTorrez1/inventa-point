import { QueryClient } from '@tanstack/react-query'

// Cliente compartido de React Query. Tiempos pensados para un POS: los datos
// de catálogo cambian poco, así que mantenemos un staleTime generoso y
// evitamos refetch agresivos que entorpecerían la pantalla de venta.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      // CRÍTICO para el modo offline: por defecto React Query "pausa" queries
      // y mutaciones cuando navigator.onLine es false (networkMode 'online'),
      // así que el cobro quedaba colgado en "Cobrando…" sin ejecutarse nunca.
      // 'always' las ejecuta siempre; la resiliencia la maneja nuestra cola.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

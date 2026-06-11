import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  // Sello de compilación visible en la app (Más → pie) para verificar que el
  // dispositivo corre la última versión y no una cacheada por el service worker.
  define: {
    __BUILD_ID__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace('T', ' '),
    ),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Inventa Point',
        short_name: 'Inventa',
        lang: 'es',
        description: 'Punto de venta e inventario multi-negocio',
        theme_color: '#f8fafc',
        background_color: '#f8fafc',
        display: 'standalone',
        // El iPad se usa en ambas orientaciones según el mostrador.
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Sirve el shell (index.html) desde caché para que la app abra offline
        // en cualquier ruta. Las llamadas a Supabase NO se cachean: la
        // resiliencia de datos se maneja con la cola explícita en IndexedDB.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

<div align="center">
  <img src="public/icon-512.png" width="96" alt="Inventa Point" />

  # Inventa Point

  **Punto de venta SaaS multi-negocio · PWA offline-first para iPad y móvil**

  React · TypeScript · Vite · Tailwind CSS · Supabase (Postgres + RLS) · PWA

  🔗 **[Demo en vivo](https://inventa-point.maurixio-torrez.workers.dev)**
</div>

---

## ¿Qué es?

Inventa Point es un **punto de venta en la nube** pensado para negocios de comida y comercios pequeños. Es **multi-tenant**: una sola instancia sirve a infinitos negocios; cada dueño se registra, crea su negocio y obtiene un POS **personalizado con su marca** (logo, color, tema, moneda) y sus datos **totalmente aislados** de los demás.

Se instala como **app nativa en iPad/móvil** (PWA) y **funciona sin internet**: las ventas se guardan en el dispositivo y se sincronizan solas al reconectar.

## ✨ Funcionalidades

- 🛒 **Venta táctil** — catálogo por categorías, carrito, cobro en efectivo/tarjeta/transferencia con cálculo de cambio.
- 🧂 **Extras y modificadores** — toppings, salsas y opciones por producto (grupos de elección única u opcional, con precio), más notas libres a cocina.
- 🍳 **Pantalla de cocina (KDS)** — comandas en vivo con estados (pendiente → en preparación → lista) y alerta por tiempo de espera.
- 📦 **Inventario** — control de stock por producto, descuento automático al vender, alertas de stock bajo.
- 📊 **Reportes contables** — día/semana/mes/año: ingresos, costos, utilidad bruta, gastos, **utilidad neta**, margen, ticket promedio, gráfico de ventas, top productos, cobros por método y **exportación a CSV**.
- 💵 **Cortes de caja** — arqueo de efectivo por turno (esperado vs. contado, diferencia, historial).
- 🎁 **Programa de lealtad** — clientes identificados por teléfono; a las *N* compras (configurable) el sistema avisa que ganaron el premio.
- 👥 **Equipo y roles** — invitaciones por código con roles `admin` / `cajero` / `cocina`; cada rol ve solo sus pantallas.
- 🖼️ **Marca por negocio** — logo y fotos de producto en Supabase Storage, color de acento, tema claro/oscuro y moneda configurables.
- 📴 **Offline-first** — catálogo cacheado localmente; ventas, gastos y cortes se encolan sin conexión y se sincronizan automáticamente al volver la red, **sin duplicados** (tokens de idempotencia).
- 📱 **PWA instalable** — pantalla completa en iPad (safe areas del notch/home indicator), iconos generados por script, service worker con precache.

## 🏗️ Decisiones de arquitectura

**Aislamiento multi-tenant en la base de datos, no en el frontend.**
Cada tabla lleva `tenant_id` y **Row Level Security** de Postgres garantiza que un usuario solo toca filas de sus negocios. Las políticas derivan la membresía desde `auth.uid()` mediante funciones `SECURITY DEFINER` (`current_tenant_ids()`, `has_role()`), así el cliente no puede falsificar el tenant aunque manipule las peticiones.

**Lógica monetaria en el servidor.**
La venta se registra con una RPC transaccional (`crear_venta`) que calcula totales, costos y utilidad con los precios de la base (no se confía en el cliente), asigna folios consecutivos por negocio con *advisory locks* y descuenta inventario, todo de forma atómica.

**Offline-first con cola e idempotencia.**
Cobrar nunca espera a la red: la operación entra a una cola local y un motor de sincronización la envía en segundo plano (al instante con conexión, o al reconectar). Cada operación lleva un **token de idempotencia** con índice único en Postgres: los reintentos jamás duplican una venta. *Gotcha real resuelto: React Query pausa las mutaciones offline por defecto (`networkMode`), y WebKit puede colgar IndexedDB en PWAs standalone — por eso la cola usa `localStorage` y `networkMode: 'always'`.*

**UI a 60 fps.**
Animaciones solo de `opacity`/`transform` (cascadas, hojas modales, transiciones de ruta) con soporte de `prefers-reduced-motion`.

## 🧰 Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Estado / datos | TanStack React Query, Zustand |
| Backend (BaaS) | Supabase: Postgres + RLS, Auth, Storage, RPCs en PL/pgSQL |
| Offline / PWA | vite-plugin-pwa (Workbox), cola en localStorage, caché de catálogo |
| Hosting | Cloudflare Workers (assets estáticos + SPA), CI/CD desde GitHub |

## 🚀 Ejecutar en local

**Requisitos:** Node 18+, una cuenta gratuita de [Supabase](https://supabase.com).

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
#    Copia .env.example a .env y rellena con tu proyecto de Supabase
#    (Settings → API: Project URL y anon key)

# 3. Base de datos — en Supabase → SQL Editor, ejecuta EN ORDEN:
#    supabase/apply_all.sql       (esquema + RLS + RPCs base)
#    supabase/apply_backlog.sql   (moneda, invitaciones, Storage)
#    supabase/apply_lealtad.sql   (programa de lealtad)
#    supabase/apply_offline.sql   (idempotencia para sincronización offline)

# 4. Arrancar
npm run dev
```

> 💡 Para probar sin confirmación de correo: Supabase → Authentication → Sign In/Providers → Email → desactivar "Confirm email".

**Flujo de prueba:** regístrate → crea tu negocio (nombre, moneda, color) → agrega categorías y productos (con extras) → vende → mira la comanda en Cocina → revisa Reportes.

## 📦 Despliegue

```bash
npm run build   # genera dist/ (tsc + vite + service worker)
```

Desplegado en **Cloudflare Workers** como assets estáticos (`wrangler.jsonc` con modo SPA); cada push a `main` construye y publica automáticamente. También incluye `netlify.toml` por si se prefiere Netlify. Después del primer deploy, en Supabase → Authentication → URL Configuration, apunta el *Site URL* a tu dominio.

## 📁 Estructura

```
src/
├── app/              # Router, layout, navegación, hub "Más"
├── features/
│   ├── auth/         # Login, onboarding (crear negocio / unirse con código)
│   ├── sale/         # POS: grid, carrito (Zustand), extras, cobro
│   ├── kitchen/      # KDS con estados y tiempos
│   ├── catalog/      # CRUD de categorías, productos y modificadores
│   ├── reports/      # Agregación día/semana/mes/año + CSV
│   ├── cashcut/      # Cortes de caja
│   ├── team/         # Miembros, roles e invitaciones
│   ├── offline/      # SyncProvider: cola + sincronización
│   └── settings/     # Marca, moneda, lealtad, KDS
├── lib/              # supabase, formato de moneda, tema, cola offline, storage
└── index.css         # Design tokens, animaciones
supabase/
└── migrations/       # 0001–0007: esquema, RLS, RPCs, lealtad, offline
```

## 👤 Autor

**Mauricio Torres** — construido como producto SaaS real, operando en producción en un iPad Air M2.

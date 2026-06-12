# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

**Inventa Point**: punto de venta SaaS **multi-tenant** (PWA offline-first) en producción real, operado desde un iPad. Stack: React 18 + Vite 5 + TypeScript, Tailwind, TanStack Query, Zustand (solo el carrito), Supabase (Auth + Postgres con RLS + Storage + Realtime). Hospedado en Cloudflare Workers con CI/CD desde GitHub.

**Todo el código, comentarios, UI y commits van en español.**

## Comandos

```bash
npm run dev              # Vite en :5173 (si está ocupado salta a :5174)
npm run dev -- --host    # expone en LAN (para probar desde el iPad)
npm run build            # tsc -b && vite build — ÚNICA verificación (no hay tests)
npm run lint
node scripts/gen-icons.mjs   # regenera los iconos PWA (sin dependencias)
```

- Requiere `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`); sin ellas `src/lib/supabase.ts` lanza al cargar → pantalla en blanco.
- **Deploy = `git push` a `main`**: Cloudflare Workers construye y publica (`wrangler.jsonc`, modo assets estáticos con `not_found_handling: single-page-application`). Las vars `VITE_` viven en Cloudflare → Settings → **Build** → Variables (no en las runtime del Worker). **No agregar `public/_redirects`**: el validador de Workers lo rechaza ("infinite loop"); el SPA ya lo cubre wrangler.jsonc. `netlify.toml` es legado.
- Producción: https://inventa-point.maurixio-torrez.workers.dev — verificar que el iPad corre el build nuevo con el sello "Versión" (`__BUILD_ID__`) en la pantalla Más; iOS cachea el service worker agresivamente (a veces hay que reinstalar la PWA).

## Migraciones SQL (no automatizadas)

`supabase/migrations/0001–0010` son secuenciales y se aplican **pegándolas a mano en el SQL Editor de Supabase** (no hay CLI configurado). Los `supabase/apply_*.sql` son copias "listas para pegar" de las migraciones nuevas; `apply_all.sql` combina 0001–0004. **Toda migración nueva debe ser idempotente** (`if not exists`, `create or replace`, `drop policy if exists`) y duplicarse: `migrations/00XX_nombre.sql` + `apply_nombre.sql`. Al cambiar una RPC con overload nuevo, hacer `drop function` de las firmas viejas (PostgREST falla con ambigüedad).

## Arquitectura

### Multi-tenant por RLS, no por frontend
Toda tabla lleva `tenant_id`. Las políticas RLS derivan la pertenencia de `auth.uid()` vía funciones `SECURITY DEFINER` (`current_tenant_ids()`, `has_role(tenant, roles...)` en 0002) — el cliente no puede falsificar el tenant. Roles: `admin` (todo), `cajero` (venta/caja), `cocina` (solo KDS); se aplican en rutas (`RequireRole`) **y** en políticas/RPCs (la validación real está en la base; ej. el descuento manual exige admin server-side).

### El dinero se calcula en el servidor
`crear_venta` (RPC transaccional, versión vigente en 0009 con 9 args) es el único camino de registro de ventas: calcula totales/costos/utilidad con precios de la base, asigna folio consecutivo por tenant con `pg_advisory_xact_lock`, descuenta inventario (puede quedar **negativo** a propósito — ventas offline se reconcilian), valida descuentos por línea (≤ importe) y el manual (solo admin), y suma el contador de lealtad del cliente. Cliente: `numeric(12,2)`, nunca float.

### Offline-first: nunca esperar a la red al cobrar
Las mutaciones de **ventas, gastos y cortes NO llaman a Supabase**: encolan en `lib/offlineQueue.ts` (cola en **localStorage** — IndexedDB se descartó porque se cuelga en la PWA de iOS) y `features/offline/SyncProvider.tsx` la drena (al cambiar la cola, al reconectar, y cada 20 s; descarta tras 5 intentos no-red). Cada operación lleva un **token de idempotencia** (`id` de la op = columna `idempotencia` con índice único parcial) → los reintentos jamás duplican.

Dos configuraciones **load-bearing** (su ausencia causó bugs históricos graves):
- `networkMode: 'always'` en `queryClient.ts` — el default de React Query **pausa** queries/mutations cuando `navigator.onLine` es false (el cobro se quedaba colgado en "Cobrando…").
- Las lecturas de catálogo/modificadores/promos/combos guardan copia en localStorage (`cache.<tabla>.<tenant>`) como fallback offline en el catch del queryFn.

### Cadena de precios en el carrito (`features/sale/`)
- `CartLine.precio_unitario` **ya incluye los extras** (modificadores elegidos en `OptionsDialog`).
- `CartLine.descuento`/`promo` solo los fijan los **combos** al agregarse: `ComboDialog` "explota" el combo en sus componentes reales con el precio especial **prorrateado** (el último componente absorbe el redondeo; nunca recarga si el combo cuesta más que la suma). Así inventario/cocina/reportes quedan correctos **sin tocar `crear_venta`**.
- `promoEngine.ts` aplica la **mejor** promo automática vigente por línea (%, precio fijo, NxM) **solo** a líneas sin descuento propio — promos y combos no se acumulan.
- Líneas con extras/notas/combo no se fusionan en `cartStore.agregar`; las de combo tienen cantidad fija.
- El descuento manual del checkout es solo admin (UI + servidor).

### Tema y moneda por tenant
`AuthProvider` aplica al cambiar de negocio: color de acento → variables CSS `--accent` (Tailwind `accent` las consume con alpha), tema claro/oscuro, y `aplicarMoneda()` que muta un formateador `Intl` a nivel de módulo en `lib/format.ts` (todo `money()` lo lee). Locale fijo `es-MX`; solo cambia el código de divisa.

### Tiempo real y PWA
- KDS (`features/kitchen/`): suscripción Realtime por tenant a cambios en `sales` (requiere 0008: tabla publicada en `supabase_realtime`); polling de 30 s solo como respaldo.
- El service worker cachea únicamente el shell (las llamadas a Supabase nunca); animaciones solo `opacity`/`transform` con `prefers-reduced-motion`; utilidades `.pt-safe/.pb-safe` para las safe areas del iPad.

### Convenciones
- Feature folders: `src/features/<feature>/{api.ts, XPage.tsx}` — `api.ts` contiene tipos + hooks de React Query; las páginas se registran en `app/App.tsx` (con `RequireRole`) y en la nav (`AppLayout` ≤5 ítems por rol; lo demás del admin va al hub `app/MorePage.tsx`).
- Tipos del dominio espejo del SQL a mano en `lib/types.ts` (no hay codegen).
- `npm run build` en verde es la puerta antes de cualquier commit; el deploy es automático al pushear.

-- ============================================================================
-- POS SaaS · Migración 0001 · Esquema base
-- ----------------------------------------------------------------------------
-- Crea todas las tablas del sistema (catálogo, ventas, inventario,
-- contabilidad, clientes). El aislamiento multi-tenant (RLS) se define en
-- la migración 0002. Las funciones/RPC en 0003.
--
-- Convenciones:
--   * Dinero: numeric(12,2). NUNCA float.
--   * IDs: uuid (gen_random_uuid()).
--   * Tiempos: timestamptz en UTC (default now()).
--   * Toda tabla de negocio lleva tenant_id para RLS.
-- ============================================================================

-- gen_random_uuid() vive en pgcrypto (disponible en Supabase).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- NÚCLEO Y ACCESO
-- ----------------------------------------------------------------------------

-- Un "tenant" = un negocio.
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  logo_url      text,
  color_acento  text not null default '#2563eb',   -- hex; el front lo convierte a RGB
  modo_tema     text not null default 'auto'
                  check (modo_tema in ('claro', 'oscuro', 'auto')),
  plan          text not null default 'gratis'
                  check (plan in ('gratis', 'pro')),
  kds_activo    boolean not null default true,      -- pantalla de cocina on/off
  creado_en     timestamptz not null default now()
);

-- Pertenencia usuario <-> negocio, con rol. Separa identidad (auth.users)
-- de la membresía: permite multi-sucursal y multi-negocio a futuro.
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rol        text not null check (rol in ('admin', 'cajero', 'cocina')),
  creado_en  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index on public.memberships (user_id);
create index on public.memberships (tenant_id);

-- ----------------------------------------------------------------------------
-- CATÁLOGO
-- ----------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nombre     text not null,
  orden      int not null default 0,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
create index on public.categories (tenant_id, orden);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  categoria_id  uuid references public.categories(id) on delete set null,
  nombre        text not null,
  precio_venta  numeric(12,2) not null default 0 check (precio_venta >= 0),
  costo         numeric(12,2) not null default 0 check (costo >= 0),
  foto_url      text,
  activo        boolean not null default true,      -- disponible / agotado
  controla_stock boolean not null default true,     -- algunos productos no llevan inventario
  stock_actual  numeric(12,3) not null default 0,
  stock_minimo  numeric(12,3) not null default 0,
  orden         int not null default 0,
  creado_en     timestamptz not null default now()
);
create index on public.products (tenant_id, categoria_id, orden);

-- Variantes: tamaño chico/mediano/grande. precio_extra = delta sobre el base.
create table public.variants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  nombre      text not null,
  precio_extra numeric(12,2) not null default 0,
  orden       int not null default 0
);
create index on public.variants (product_id, orden);

-- Modificadores: salsas, extra queso, sin cebolla. Agrupables y opcional/obligatorio.
create table public.modifiers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  grupo       text,                                  -- ej. "Salsa", "Extras"
  nombre      text not null,
  precio      numeric(12,2) not null default 0,
  obligatorio boolean not null default false,
  orden       int not null default 0
);
create index on public.modifiers (product_id, orden);

-- ----------------------------------------------------------------------------
-- CLIENTES
-- ----------------------------------------------------------------------------

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  telefono   text not null,                          -- identificador de búsqueda
  nombre     text,
  notas      text,
  creado_en  timestamptz not null default now(),
  unique (tenant_id, telefono)
);
create index on public.customers (tenant_id, telefono);

-- ----------------------------------------------------------------------------
-- VENTAS
-- ----------------------------------------------------------------------------

create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  folio          bigint not null,                    -- consecutivo por tenant
  total          numeric(12,2) not null default 0,
  costo_total    numeric(12,2) not null default 0,
  utilidad       numeric(12,2) not null default 0,
  metodo_pago    text not null
                   check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia')),
  monto_recibido numeric(12,2),                       -- efectivo entregado
  cambio         numeric(12,2),
  cajero_id      uuid references auth.users(id),
  cliente_id     uuid references public.customers(id) on delete set null,
  estado_cocina  text not null default 'pendiente'
                   check (estado_cocina in
                     ('pendiente', 'en_preparacion', 'completada', 'sin_cocina')),
  estado_venta   text not null default 'completada'
                   check (estado_venta in ('completada', 'cancelada', 'devuelta')),
  origen         text not null default 'online'
                   check (origen in ('online', 'offline_sync')),
  creado_en      timestamptz not null default now(),
  completada_en  timestamptz,
  unique (tenant_id, folio)
);
create index on public.sales (tenant_id, creado_en);
create index on public.sales (tenant_id, estado_cocina);

create table public.sale_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  sale_id        uuid not null references public.sales(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  nombre_snapshot text not null,                      -- nombre al momento de la venta
  cantidad       numeric(12,3) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  costo_unitario  numeric(12,2) not null default 0,
  variante       jsonb,                               -- { nombre, precio_extra }
  modificadores  jsonb not null default '[]'::jsonb,  -- [{ nombre, precio }]
  notas          text,                                -- indicaciones a cocina
  subtotal       numeric(12,2) not null
);
create index on public.sale_items (sale_id);
create index on public.sale_items (tenant_id, product_id);

-- ----------------------------------------------------------------------------
-- INVENTARIO
-- ----------------------------------------------------------------------------

create table public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  tipo          text not null
                  check (tipo in ('venta', 'entrada', 'ajuste', 'merma')),
  cantidad      numeric(12,3) not null,               -- con signo: + entra, - sale
  stock_resultante numeric(12,3) not null,
  motivo        text,
  referencia_id uuid,                                 -- ej. sale_id que lo originó
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now()
);
create index on public.inventory_movements (tenant_id, product_id, creado_en);

-- (Mejora futura) Recetas/insumos. Tablas dejadas preparadas, sin uso en v1.
create table public.ingredients (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nombre     text not null,
  unidad     text not null default 'pieza',           -- ml, g, pieza...
  stock_actual numeric(12,3) not null default 0,
  stock_minimo numeric(12,3) not null default 0,
  costo_unitario numeric(12,2) not null default 0,
  creado_en  timestamptz not null default now()
);

create table public.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  cantidad      numeric(12,3) not null                -- insumo consumido por unidad vendida
);

-- ----------------------------------------------------------------------------
-- CONTABILIDAD
-- ----------------------------------------------------------------------------

create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  concepto       text not null,
  monto          numeric(12,2) not null check (monto >= 0),
  categoria_gasto text,                                -- renta, insumos, servicios...
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now()
);
create index on public.expenses (tenant_id, creado_en);

create table public.cash_cuts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  cajero_id     uuid references auth.users(id),
  esperado      numeric(12,2) not null default 0,      -- efectivo teórico en caja
  contado       numeric(12,2) not null default 0,      -- efectivo real contado
  diferencia    numeric(12,2) not null default 0,
  turno_inicio  timestamptz not null,
  turno_fin     timestamptz not null default now(),
  notas         text
);
create index on public.cash_cuts (tenant_id, turno_fin);

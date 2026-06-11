-- ====================================================================
-- POS SaaS · SCRIPT COMBINADO (aplica las 4 migraciones en orden)
-- Pega TODO esto en el SQL Editor de Supabase y pulsa Run una sola vez.
-- Es idempotente en funciones (create or replace); las tablas fallarian
-- si ya existen, asi que ejecutalo en un proyecto limpio.
-- ====================================================================


-- >>>>>>>>>>>>>>>>>>>> 0001_schema.sql <<<<<<<<<<<<<<<<<<<<

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


-- >>>>>>>>>>>>>>>>>>>> 0002_rls.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- POS SaaS · Migración 0002 · Row Level Security (aislamiento multi-tenant)
-- ----------------------------------------------------------------------------
-- Decisión de diseño:
--   En vez de depender de un "custom access token hook" en el dashboard
--   (config manual, fácil de olvidar), derivamos el tenant del usuario desde
--   la tabla `memberships`. Funciones SECURITY DEFINER (que saltan RLS por
--   dentro) leen la membresía a partir de auth.uid(). Es robusto y no exige
--   configuración extra en el panel de Supabase.
--
-- Garantía: cada política exige tenant_id ∈ tenants del usuario. El cliente
--   no puede falsificar el tenant porque se valida contra auth.uid(), no
--   contra el payload enviado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Funciones auxiliares de autorización
-- ----------------------------------------------------------------------------

-- Tenants a los que pertenece el usuario actual.
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.memberships where user_id = auth.uid()
$$;

-- ¿El usuario actual tiene alguno de estos roles en el tenant dado?
create or replace function public.has_role(p_tenant uuid, variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and tenant_id = p_tenant
      and rol = any(p_roles)
  )
$$;

-- ----------------------------------------------------------------------------
-- Habilitar RLS en TODAS las tablas
-- ----------------------------------------------------------------------------
alter table public.tenants             enable row level security;
alter table public.memberships         enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.variants            enable row level security;
alter table public.modifiers           enable row level security;
alter table public.customers           enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.ingredients         enable row level security;
alter table public.recipe_items        enable row level security;
alter table public.expenses            enable row level security;
alter table public.cash_cuts           enable row level security;

-- ----------------------------------------------------------------------------
-- TENANTS · el usuario ve/edita solo sus negocios; la creación va por RPC.
-- ----------------------------------------------------------------------------
create policy "tenants_select" on public.tenants
  for select using (id in (select public.current_tenant_ids()));

create policy "tenants_update_admin" on public.tenants
  for update using (public.has_role(id, 'admin'))
  with check (public.has_role(id, 'admin'));

-- ----------------------------------------------------------------------------
-- MEMBERSHIPS · cada quien ve su propia membresía; el admin gestiona su equipo.
-- ----------------------------------------------------------------------------
create policy "memberships_select_self" on public.memberships
  for select using (user_id = auth.uid());

create policy "memberships_select_admin" on public.memberships
  for select using (public.has_role(tenant_id, 'admin'));

create policy "memberships_admin_write" on public.memberships
  for all using (public.has_role(tenant_id, 'admin'))
  with check (public.has_role(tenant_id, 'admin'));

-- ----------------------------------------------------------------------------
-- Helper de macro para políticas repetidas:
-- Patrón general por tabla de negocio:
--   SELECT  -> miembro del tenant
--   WRITE   -> admin del tenant (catálogo, gastos, etc.)
-- Se ajustan por tabla donde el cajero/cocina necesitan más.
-- ----------------------------------------------------------------------------

-- CATÁLOGO (categories, products, variants, modifiers):
-- todos los miembros leen; solo admin escribe.
do $$
declare t text;
begin
  foreach t in array array['categories','products','variants','modifiers']
  loop
    execute format($f$
      create policy "%1$s_select" on public.%1$s
        for select using (tenant_id in (select public.current_tenant_ids()));
      create policy "%1$s_admin_write" on public.%1$s
        for all using (public.has_role(tenant_id, 'admin'))
        with check (public.has_role(tenant_id, 'admin'));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- CUSTOMERS · admin y cajero leen/escriben (el cajero asocia clientes al vender).
-- ----------------------------------------------------------------------------
create policy "customers_select" on public.customers
  for select using (tenant_id in (select public.current_tenant_ids()));
create policy "customers_write" on public.customers
  for all using (public.has_role(tenant_id, 'admin', 'cajero'))
  with check (public.has_role(tenant_id, 'admin', 'cajero'));

-- ----------------------------------------------------------------------------
-- SALES · cajero/admin crean ventas. Cocina puede leer y avanzar estado_cocina.
--   La inserción real va por la RPC crear_venta (Etapa 4), pero dejamos las
--   políticas listas para lectura y para el flujo de cocina.
-- ----------------------------------------------------------------------------
create policy "sales_select" on public.sales
  for select using (tenant_id in (select public.current_tenant_ids()));

create policy "sales_insert" on public.sales
  for insert with check (public.has_role(tenant_id, 'admin', 'cajero'));

-- Cocina y admin pueden actualizar (p.ej. estado_cocina). El admin además
-- gestiona cancelaciones/devoluciones.
create policy "sales_update_kitchen" on public.sales
  for update using (public.has_role(tenant_id, 'admin', 'cocina'))
  with check (public.has_role(tenant_id, 'admin', 'cocina'));

-- SALE_ITEMS · se leen con la venta; cajero/admin insertan.
create policy "sale_items_select" on public.sale_items
  for select using (tenant_id in (select public.current_tenant_ids()));
create policy "sale_items_insert" on public.sale_items
  for insert with check (public.has_role(tenant_id, 'admin', 'cajero'));

-- ----------------------------------------------------------------------------
-- INVENTARIO · admin gestiona entradas/ajustes; todos los miembros leen.
--   Los movimientos por 'venta' los inserta la RPC (Etapa 4).
-- ----------------------------------------------------------------------------
create policy "inv_select" on public.inventory_movements
  for select using (tenant_id in (select public.current_tenant_ids()));
create policy "inv_admin_write" on public.inventory_movements
  for all using (public.has_role(tenant_id, 'admin'))
  with check (public.has_role(tenant_id, 'admin'));

-- INGREDIENTS / RECIPE_ITEMS (futuro): admin gestiona, miembros leen.
do $$
declare t text;
begin
  foreach t in array array['ingredients','recipe_items']
  loop
    execute format($f$
      create policy "%1$s_select" on public.%1$s
        for select using (tenant_id in (select public.current_tenant_ids()));
      create policy "%1$s_admin_write" on public.%1$s
        for all using (public.has_role(tenant_id, 'admin'))
        with check (public.has_role(tenant_id, 'admin'));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- CONTABILIDAD · solo admin (datos sensibles: costos, utilidad, cortes).
-- ----------------------------------------------------------------------------
create policy "expenses_admin" on public.expenses
  for all using (public.has_role(tenant_id, 'admin'))
  with check (public.has_role(tenant_id, 'admin'));

-- Corte de caja: el cajero puede cerrar su propio turno; el admin todo.
create policy "cuts_select" on public.cash_cuts
  for select using (public.has_role(tenant_id, 'admin')
                    or cajero_id = auth.uid());
create policy "cuts_insert" on public.cash_cuts
  for insert with check (public.has_role(tenant_id, 'admin', 'cajero'));


-- >>>>>>>>>>>>>>>>>>>> 0003_functions.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- POS SaaS · Migración 0003 · Funciones / RPC
-- ----------------------------------------------------------------------------
-- crear_negocio: registro autónomo. Crea el tenant y la membresía 'admin'
--   del usuario que llama, de forma atómica. Es SECURITY DEFINER porque RLS
--   impediría insertar el tenant antes de que exista la membresía
--   (problema del huevo y la gallina).
-- ============================================================================

create or replace function public.crear_negocio(
  p_nombre text,
  p_color  text default '#2563eb'
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant public.tenants;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del negocio es obligatorio';
  end if;

  insert into public.tenants (nombre, color_acento)
  values (trim(p_nombre), coalesce(p_color, '#2563eb'))
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, rol)
  values (v_tenant.id, v_uid, 'admin');

  return v_tenant;
end;
$$;

-- Devuelve el siguiente folio consecutivo para un tenant (1, 2, 3, ...).
-- Se usará al crear ventas (Etapa 4). Bloquea por tenant para evitar choques.
create or replace function public.proximo_folio(p_tenant uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folio bigint;
begin
  -- Advisory lock transaccional por tenant: serializa el folio sin usar
  -- FOR UPDATE (inválido junto a un agregado como max()).
  perform pg_advisory_xact_lock(hashtext('folio:' || p_tenant::text)::bigint);
  select coalesce(max(folio), 0) + 1 into v_folio
  from public.sales
  where tenant_id = p_tenant;

  return v_folio;
end;
$$;

-- Permisos: cualquier usuario autenticado puede llamar estas RPC.
grant execute on function public.crear_negocio(text, text) to authenticated;
grant execute on function public.proximo_folio(uuid) to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 0004_crear_venta.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- POS SaaS · Migración 0004 · RPC crear_venta (Etapa 4)
-- ----------------------------------------------------------------------------
-- Registra una venta completa de forma ATÓMICA:
--   1. Calcula el folio consecutivo del tenant.
--   2. Inserta la cabecera (sales) y sus partidas (sale_items).
--   3. Para productos con controla_stock, descuenta inventario y deja el
--      movimiento de tipo 'venta' con su stock_resultante.
--   4. Calcula total, costo_total y utilidad en el servidor (no se confía en
--      el cliente para los totales monetarios).
--
-- Es SECURITY DEFINER para poder escribir folio/inventario saltando RLS, pero
-- valida que el usuario sea admin o cajero del tenant antes de tocar nada.
--
-- Forma de p_items (jsonb array). Cada elemento:
--   {
--     "product_id": uuid | null,
--     "nombre": text,
--     "cantidad": number,
--     "precio_unitario": number,   -- ya incluye variante/modificadores
--     "variante": {...} | null,
--     "modificadores": [...],
--     "notas": text | null
--   }
-- ============================================================================

create or replace function public.crear_venta(
  p_tenant         uuid,
  p_items          jsonb,
  p_metodo_pago    text,
  p_monto_recibido numeric default null,
  p_cliente_id     uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_folio     bigint;
  v_sale      public.sales;
  v_kds       boolean;
  v_estado    text;
  v_item      jsonb;
  v_prod      public.products;
  v_cantidad  numeric(12,3);
  v_precio    numeric(12,2);
  v_costo_u   numeric(12,2);
  v_subtotal  numeric(12,2);
  v_total     numeric(12,2) := 0;
  v_costo_tot numeric(12,2) := 0;
  v_nuevo_stk numeric(12,3);
begin
  -- ---- Autorización ----
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not public.has_role(p_tenant, 'admin', 'cajero') then
    raise exception 'No autorizado para vender en este negocio';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Método de pago inválido';
  end if;

  -- ---- Folio + estado de cocina ----
  -- Serializamos el cálculo del folio por tenant con un advisory lock
  -- transaccional. No se puede usar FOR UPDATE junto a un agregado como max().
  perform pg_advisory_xact_lock(hashtext('folio:' || p_tenant::text)::bigint);
  select coalesce(max(folio), 0) + 1 into v_folio
  from public.sales where tenant_id = p_tenant;

  select kds_activo into v_kds from public.tenants where id = p_tenant;
  v_estado := case when coalesce(v_kds, false) then 'pendiente' else 'sin_cocina' end;

  -- ---- Cabecera (totales se actualizan al final) ----
  insert into public.sales (
    tenant_id, folio, metodo_pago, monto_recibido, cajero_id, cliente_id,
    estado_cocina, total, costo_total, utilidad
  )
  values (
    p_tenant, v_folio, p_metodo_pago, p_monto_recibido, v_uid, p_cliente_id,
    v_estado, 0, 0, 0
  )
  returning * into v_sale;

  -- ---- Partidas ----
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio   := (v_item->>'precio_unitario')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una partida';
    end if;

    -- Costo unitario tomado del producto (fuente de verdad), no del cliente.
    v_costo_u := 0;
    if (v_item->>'product_id') is not null then
      select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and tenant_id = p_tenant;
      if found then
        v_costo_u := v_prod.costo;
      end if;
    end if;

    v_subtotal  := round(v_precio * v_cantidad, 2);
    v_total     := v_total + v_subtotal;
    v_costo_tot := v_costo_tot + round(v_costo_u * v_cantidad, 2);

    insert into public.sale_items (
      tenant_id, sale_id, product_id, nombre_snapshot, cantidad,
      precio_unitario, costo_unitario, variante, modificadores, notas, subtotal
    )
    values (
      p_tenant, v_sale.id,
      (v_item->>'product_id')::uuid,
      coalesce(v_item->>'nombre', 'Producto'),
      v_cantidad, v_precio, v_costo_u,
      v_item->'variante',
      coalesce(v_item->'modificadores', '[]'::jsonb),
      v_item->>'notas',
      v_subtotal
    );

    -- ---- Inventario (solo si el producto controla stock) ----
    if (v_item->>'product_id') is not null
       and v_prod.id is not null
       and v_prod.controla_stock then
      v_nuevo_stk := v_prod.stock_actual - v_cantidad;
      update public.products
        set stock_actual = v_nuevo_stk
        where id = v_prod.id;
      insert into public.inventory_movements (
        tenant_id, product_id, tipo, cantidad, stock_resultante,
        motivo, referencia_id, creado_por
      )
      values (
        p_tenant, v_prod.id, 'venta', -v_cantidad, v_nuevo_stk,
        'Venta folio ' || v_folio, v_sale.id, v_uid
      );
    end if;
  end loop;

  -- ---- Totales y cambio ----
  update public.sales set
    total       = v_total,
    costo_total = v_costo_tot,
    utilidad    = v_total - v_costo_tot,
    cambio      = case
                    when p_metodo_pago = 'efectivo' and p_monto_recibido is not null
                    then greatest(p_monto_recibido - v_total, 0)
                    else null
                  end
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function
  public.crear_venta(uuid, jsonb, text, numeric, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- avanzar_cocina: mueve una venta por los estados del KDS (Etapa 6).
--   pendiente -> en_preparacion -> completada
-- ----------------------------------------------------------------------------
create or replace function public.avanzar_cocina(
  p_sale   uuid,
  p_estado text
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
begin
  select * into v_sale from public.sales where id = p_sale;
  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if not public.has_role(v_sale.tenant_id, 'admin', 'cocina') then
    raise exception 'No autorizado';
  end if;
  if p_estado not in ('pendiente', 'en_preparacion', 'completada') then
    raise exception 'Estado inválido';
  end if;

  update public.sales set
    estado_cocina = p_estado,
    completada_en = case when p_estado = 'completada' then now() else completada_en end
  where id = p_sale
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.avanzar_cocina(uuid, text) to authenticated;


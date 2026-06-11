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

-- ============================================================================
-- Inventa Point · Migración 0010 · Combos
-- ----------------------------------------------------------------------------
-- Pégalo en Supabase → SQL Editor → Run. Idempotente.
--
-- Un combo = precio especial por un paquete de espacios. Cada espacio es
-- "elige 1 producto de la categoría X" o un producto fijo incluido siempre.
-- NO toca crear_venta: el carrito "explota" el combo en sus componentes con
-- el descuento prorrateado por línea (campos descuento/promo_nombre de 0009),
-- así inventario, cocina y reportes quedan correctos automáticamente.
-- ============================================================================

create table if not exists public.combos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nombre     text not null,                      -- "Combo desayuno"
  precio     numeric(12,2) not null check (precio >= 0),
  activo     boolean not null default true,
  orden      int not null default 0,
  creado_en  timestamptz not null default now()
);
create index if not exists combos_tenant_idx on public.combos (tenant_id, activo);

create table if not exists public.combo_slots (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  combo_id     uuid not null references public.combos(id) on delete cascade,
  etiqueta     text,                              -- "Elige tu bebida" (opcional)
  categoria_id uuid references public.categories(id) on delete cascade,
  producto_id  uuid references public.products(id) on delete cascade,
  orden        int not null default 0,
  check (categoria_id is not null or producto_id is not null)
);
create index if not exists combo_slots_combo_idx on public.combo_slots (combo_id, orden);

alter table public.combos      enable row level security;
alter table public.combo_slots enable row level security;

-- Mismo patrón que el catálogo: miembros leen, admin escribe.
do $$
declare t text;
begin
  foreach t in array array['combos','combo_slots']
  loop
    execute format($f$
      drop policy if exists "%1$s_select" on public.%1$s;
      create policy "%1$s_select" on public.%1$s
        for select using (tenant_id in (select public.current_tenant_ids()));
      drop policy if exists "%1$s_admin_write" on public.%1$s;
      create policy "%1$s_admin_write" on public.%1$s
        for all using (public.has_role(tenant_id, 'admin'))
        with check (public.has_role(tenant_id, 'admin'));
    $f$, t);
  end loop;
end $$;

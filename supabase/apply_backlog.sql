-- ============================================================================
-- POS SaaS · Migración 0005 · Backlog (moneda, invitaciones, equipo, Storage)
-- ----------------------------------------------------------------------------
-- Pégalo COMPLETO en Supabase → SQL Editor → Run. Es idempotente: se puede
-- reejecutar sin error (usa IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF
-- EXISTS / ON CONFLICT).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Moneda por negocio (código ISO 4217: MXN, USD, EUR, GTQ, COP, ...).
-- ----------------------------------------------------------------------------
alter table public.tenants
  add column if not exists moneda text not null default 'MXN';

-- crear_negocio: ahora también fija la moneda. Reemplazamos la versión de 2
-- argumentos por una de 3 (con default) para evitar ambigüedad de overloads.
drop function if exists public.crear_negocio(text, text);
create or replace function public.crear_negocio(
  p_nombre text,
  p_color  text default '#2563eb',
  p_moneda text default 'MXN'
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

  insert into public.tenants (nombre, color_acento, moneda)
  values (trim(p_nombre), coalesce(p_color, '#2563eb'), coalesce(nullif(trim(p_moneda), ''), 'MXN'))
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, rol)
  values (v_tenant.id, v_uid, 'admin');

  return v_tenant;
end;
$$;
grant execute on function public.crear_negocio(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Invitaciones por código (alta de equipo sin servidor propio).
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  codigo     text not null unique,
  rol        text not null check (rol in ('admin', 'cajero', 'cocina')),
  creada_por uuid references auth.users(id),
  usada_por  uuid references auth.users(id),
  usada_en   timestamptz,
  expira_en  timestamptz not null default now() + interval '14 days',
  creada_en  timestamptz not null default now()
);
create index if not exists invitations_tenant_idx on public.invitations (tenant_id, creada_en);

alter table public.invitations enable row level security;

drop policy if exists "invitations_admin_all" on public.invitations;
create policy "invitations_admin_all" on public.invitations
  for all using (public.has_role(tenant_id, 'admin'))
  with check (public.has_role(tenant_id, 'admin'));

-- Crea un código de invitación (solo admin del tenant). Devuelve el código.
create or replace function public.crear_invitacion(p_tenant uuid, p_rol text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  if not public.has_role(p_tenant, 'admin') then
    raise exception 'Solo un admin puede invitar';
  end if;
  if p_rol not in ('admin', 'cajero', 'cocina') then
    raise exception 'Rol inválido';
  end if;
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invitations (tenant_id, codigo, rol, creada_por)
  values (p_tenant, v_codigo, p_rol, auth.uid());
  return v_codigo;
end;
$$;
grant execute on function public.crear_invitacion(uuid, text) to authenticated;

-- Une al usuario actual a un negocio usando un código. Cualquier autenticado.
create or replace function public.unirse_con_codigo(p_codigo text)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    public.invitations;
  v_tenant public.tenants;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_inv from public.invitations
   where codigo = upper(trim(p_codigo))
   for update;

  if v_inv.id is null then
    raise exception 'Código inválido';
  end if;
  if v_inv.usada_en is not null then
    raise exception 'Ese código ya fue utilizado';
  end if;
  if v_inv.expira_en < now() then
    raise exception 'El código expiró';
  end if;

  insert into public.memberships (tenant_id, user_id, rol)
  values (v_inv.tenant_id, v_uid, v_inv.rol)
  on conflict (tenant_id, user_id) do update set rol = excluded.rol;

  update public.invitations
     set usada_por = v_uid, usada_en = now()
   where id = v_inv.id;

  select * into v_tenant from public.tenants where id = v_inv.tenant_id;
  return v_tenant;
end;
$$;
grant execute on function public.unirse_con_codigo(text) to authenticated;

-- Lista los miembros de un negocio con su correo (solo admin). El front no
-- puede leer auth.users directamente; esta función SECURITY DEFINER lo permite.
create or replace function public.tenant_miembros(p_tenant uuid)
returns table (user_id uuid, email text, rol text, creado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(p_tenant, 'admin') then
    raise exception 'No autorizado';
  end if;
  return query
    select m.user_id, u.email::text, m.rol, m.creado_en
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant
    order by m.creado_en;
end;
$$;
grant execute on function public.tenant_miembros(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Storage: buckets para logo del negocio y fotos de productos.
--    Convención de ruta: "<tenant_id>/<archivo>" para poder validar por RLS.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true), ('productos', 'productos', true)
on conflict (id) do nothing;

-- Lectura pública (las imágenes se sirven por URL pública).
drop policy if exists "media_read" on storage.objects;
create policy "media_read" on storage.objects
  for select using (bucket_id in ('branding', 'productos'));

-- Escritura/edición/borrado: solo miembros del tenant dueño de la carpeta.
drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('branding', 'productos')
    and (split_part(name, '/', 1))::uuid in (select public.current_tenant_ids())
  );

drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('branding', 'productos')
    and (split_part(name, '/', 1))::uuid in (select public.current_tenant_ids())
  );

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('branding', 'productos')
    and (split_part(name, '/', 1))::uuid in (select public.current_tenant_ids())
  );

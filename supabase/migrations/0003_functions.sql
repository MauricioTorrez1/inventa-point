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

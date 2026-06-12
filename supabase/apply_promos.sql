-- ============================================================================
-- Inventa Point · Migración 0009 · Promociones y descuentos
-- ----------------------------------------------------------------------------
-- Pégalo COMPLETO en Supabase → SQL Editor → Run. Idempotente.
--
-- Dos niveles:
--   * Promos automáticas (tabla `promotions`): porcentaje, precio fijo o NxM
--     (2x1, 3x2...) sobre un producto o una categoría, con vigencia opcional.
--     El carrito las aplica y manda el descuento por línea; el servidor lo
--     valida (nunca mayor al importe de la línea).
--   * Descuento manual del ticket: SOLO admin (validado aquí, no solo en UI).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabla de promociones.
-- ----------------------------------------------------------------------------
create table if not exists public.promotions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  nombre       text not null,                       -- "2x1 en tacos"
  tipo         text not null check (tipo in ('porcentaje', 'precio_fijo', 'nxm')),
  valor        numeric(12,2) not null default 0,    -- %: 20 = -20% · precio_fijo: el precio
  n            int,                                 -- nxm: lleva N...
  m            int,                                 -- ...paga M  (2x1 → n=2, m=1)
  producto_id  uuid references public.products(id) on delete cascade,
  categoria_id uuid references public.categories(id) on delete cascade,
  inicia       timestamptz,                         -- null = desde ya
  termina      timestamptz,                         -- null = sin caducidad
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  check (producto_id is not null or categoria_id is not null),
  check (tipo <> 'nxm' or (n is not null and m is not null and n > m and m >= 1))
);
create index if not exists promotions_tenant_idx on public.promotions (tenant_id, activo);

alter table public.promotions enable row level security;

drop policy if exists "promotions_select" on public.promotions;
create policy "promotions_select" on public.promotions
  for select using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists "promotions_admin_write" on public.promotions;
create policy "promotions_admin_write" on public.promotions
  for all using (public.has_role(tenant_id, 'admin'))
  with check (public.has_role(tenant_id, 'admin'));

-- ----------------------------------------------------------------------------
-- 2) Columnas de descuento (auditoría en la venta).
-- ----------------------------------------------------------------------------
alter table public.sale_items add column if not exists descuento    numeric(12,2) not null default 0;
alter table public.sale_items add column if not exists promo_nombre text;

alter table public.sales add column if not exists descuento_total  numeric(12,2) not null default 0;
alter table public.sales add column if not exists descuento_manual numeric(12,2) not null default 0;
alter table public.sales add column if not exists descuento_motivo text;

-- ----------------------------------------------------------------------------
-- 3) crear_venta v4: descuento por línea (promos) + descuento manual (admin).
--    Cada item puede traer: "descuento" (importe) y "promo" (nombre).
-- ----------------------------------------------------------------------------
drop function if exists public.crear_venta(uuid, jsonb, text, numeric, uuid, uuid, text);
create or replace function public.crear_venta(
  p_tenant           uuid,
  p_items            jsonb,
  p_metodo_pago      text,
  p_monto_recibido   numeric default null,
  p_cliente_id       uuid default null,
  p_idempotencia     uuid default null,
  p_origen           text default 'online',
  p_descuento        numeric default 0,
  p_descuento_motivo text default null
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
  v_origen    text;
  v_item      jsonb;
  v_prod      public.products;
  v_cantidad  numeric(12,3);
  v_precio    numeric(12,2);
  v_desc      numeric(12,2);
  v_costo_u   numeric(12,2);
  v_subtotal  numeric(12,2);
  v_total     numeric(12,2) := 0;
  v_costo_tot numeric(12,2) := 0;
  v_desc_tot  numeric(12,2) := 0;
  v_desc_man  numeric(12,2) := coalesce(p_descuento, 0);
  v_nuevo_stk numeric(12,3);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not public.has_role(p_tenant, 'admin', 'cajero') then
    raise exception 'No autorizado para vender en este negocio';
  end if;

  -- Descuento manual: SOLO un admin puede aplicarlo.
  if v_desc_man < 0 then
    raise exception 'Descuento inválido';
  end if;
  if v_desc_man > 0 and not public.has_role(p_tenant, 'admin') then
    raise exception 'Solo un administrador puede aplicar descuentos manuales';
  end if;

  -- Idempotencia: si ya se registró esta venta, devuélvela tal cual.
  if p_idempotencia is not null then
    select * into v_sale from public.sales
     where tenant_id = p_tenant and idempotencia = p_idempotencia;
    if found then
      return v_sale;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Método de pago inválido';
  end if;

  perform pg_advisory_xact_lock(hashtext('folio:' || p_tenant::text)::bigint);
  select coalesce(max(folio), 0) + 1 into v_folio
  from public.sales where tenant_id = p_tenant;

  select kds_activo into v_kds from public.tenants where id = p_tenant;
  v_estado := case when coalesce(v_kds, false) then 'pendiente' else 'sin_cocina' end;
  v_origen := case when p_origen = 'offline_sync' then 'offline_sync' else 'online' end;

  insert into public.sales (
    tenant_id, folio, metodo_pago, monto_recibido, cajero_id, cliente_id,
    estado_cocina, total, costo_total, utilidad, origen, idempotencia
  )
  values (
    p_tenant, v_folio, p_metodo_pago, p_monto_recibido, v_uid, p_cliente_id,
    v_estado, 0, 0, 0, v_origen, p_idempotencia
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_precio   := (v_item->>'precio_unitario')::numeric;
    v_desc     := coalesce((v_item->>'descuento')::numeric, 0);
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una partida';
    end if;
    -- El descuento de la línea nunca excede su importe ni es negativo.
    if v_desc < 0 or v_desc > round(v_precio * v_cantidad, 2) then
      raise exception 'Descuento de línea inválido';
    end if;

    v_costo_u := 0;
    if (v_item->>'product_id') is not null then
      select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and tenant_id = p_tenant;
      if found then
        v_costo_u := v_prod.costo;
      end if;
    end if;

    v_subtotal  := round(v_precio * v_cantidad, 2) - v_desc;
    v_total     := v_total + v_subtotal;
    v_desc_tot  := v_desc_tot + v_desc;
    v_costo_tot := v_costo_tot + round(v_costo_u * v_cantidad, 2);

    insert into public.sale_items (
      tenant_id, sale_id, product_id, nombre_snapshot, cantidad,
      precio_unitario, costo_unitario, variante, modificadores, notas,
      subtotal, descuento, promo_nombre
    )
    values (
      p_tenant, v_sale.id,
      (v_item->>'product_id')::uuid,
      coalesce(v_item->>'nombre', 'Producto'),
      v_cantidad, v_precio, v_costo_u,
      v_item->'variante',
      coalesce(v_item->'modificadores', '[]'::jsonb),
      v_item->>'notas',
      v_subtotal, v_desc, v_item->>'promo'
    );

    -- Inventario (puede quedar negativo: ventas offline se reconcilian).
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

  -- Descuento manual del ticket (ya validado que solo admin).
  if v_desc_man > v_total then
    v_desc_man := v_total;
  end if;
  v_total := v_total - v_desc_man;
  v_desc_tot := v_desc_tot + v_desc_man;

  update public.sales set
    total            = v_total,
    costo_total      = v_costo_tot,
    utilidad         = v_total - v_costo_tot,
    descuento_total  = v_desc_tot,
    descuento_manual = v_desc_man,
    descuento_motivo = nullif(trim(coalesce(p_descuento_motivo, '')), ''),
    cambio           = case
                         when p_metodo_pago = 'efectivo' and p_monto_recibido is not null
                         then greatest(p_monto_recibido - v_total, 0)
                         else null
                       end
  where id = v_sale.id
  returning * into v_sale;

  -- Lealtad: suma 1 a las compras del cliente identificado.
  if p_cliente_id is not null then
    update public.customers set compras = compras + 1
     where id = p_cliente_id and tenant_id = p_tenant;
  end if;

  return v_sale;
end;
$$;
grant execute on function
  public.crear_venta(uuid, jsonb, text, numeric, uuid, uuid, text, numeric, text)
  to authenticated;

-- ============================================================================
-- POS SaaS · Migración 0007 · Soporte offline (idempotencia de sincronización)
-- ----------------------------------------------------------------------------
-- Pégalo COMPLETO en Supabase → SQL Editor → Run. Idempotente.
--
-- Las ventas/gastos/cortes creados offline se encolan en el dispositivo y se
-- envían al reconectar. Para que un reintento NO duplique el registro, cada
-- operación lleva un token único generado en el cliente (`idempotencia`).
-- ============================================================================

-- 1) Token de idempotencia (único; admite múltiples NULL para registros online).
alter table public.sales      add column if not exists idempotencia uuid;
alter table public.expenses   add column if not exists idempotencia uuid;
alter table public.cash_cuts  add column if not exists idempotencia uuid;

create unique index if not exists sales_idempotencia_uidx
  on public.sales (idempotencia) where idempotencia is not null;
create unique index if not exists expenses_idempotencia_uidx
  on public.expenses (idempotencia) where idempotencia is not null;
create unique index if not exists cash_cuts_idempotencia_uidx
  on public.cash_cuts (idempotencia) where idempotencia is not null;

-- 2) crear_venta con token de idempotencia + origen explícito. Si el token ya
--    existe, devuelve la venta previa sin re-registrarla. Se pasa SIEMPRE el
--    token (también online) para que un reintento tras una respuesta perdida no
--    duplique la venta. `p_origen` marca si entró por la cola offline.
--    Reemplaza versiones anteriores (5 y 6 args) para evitar ambigüedad.
drop function if exists public.crear_venta(uuid, jsonb, text, numeric, uuid);
drop function if exists public.crear_venta(uuid, jsonb, text, numeric, uuid, uuid);
create or replace function public.crear_venta(
  p_tenant         uuid,
  p_items          jsonb,
  p_metodo_pago    text,
  p_monto_recibido numeric default null,
  p_cliente_id     uuid default null,
  p_idempotencia   uuid default null,
  p_origen         text default 'online'
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
  v_costo_u   numeric(12,2);
  v_subtotal  numeric(12,2);
  v_total     numeric(12,2) := 0;
  v_costo_tot numeric(12,2) := 0;
  v_nuevo_stk numeric(12,3);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not public.has_role(p_tenant, 'admin', 'cajero') then
    raise exception 'No autorizado para vender en este negocio';
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
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una partida';
    end if;

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

    -- Inventario: se permite quedar negativo (ventas offline se reconcilian).
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

  if p_cliente_id is not null then
    update public.customers set compras = compras + 1
     where id = p_cliente_id and tenant_id = p_tenant;
  end if;

  return v_sale;
end;
$$;
grant execute on function
  public.crear_venta(uuid, jsonb, text, numeric, uuid, uuid, text) to authenticated;

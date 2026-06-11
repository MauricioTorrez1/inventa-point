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
  -- transaccional (se libera solo al cerrar la transacción). No se puede usar
  -- FOR UPDATE junto a un agregado como max().
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

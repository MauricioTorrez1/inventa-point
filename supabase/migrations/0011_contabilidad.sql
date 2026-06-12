-- ============================================================================
-- POS SaaS · Migración 0011 · Contabilidad para administración (admin)
-- ----------------------------------------------------------------------------
-- Pégalo COMPLETO en Supabase → SQL Editor → Run. Idempotente.
--
-- Amplía la contabilidad más allá de gastos/cortes:
--   * proveedores            → directorio de a quién se le compra/debe.
--   * payables (por pagar)    → deudas con saldo, vencimiento y estado.
--   * payable_payments        → abonos a esas deudas (salidas de caja).
--   * expenses.metodo_pago    → para distinguir salidas de efectivo en el flujo.
--   * registrar_abono (RPC)   → único camino para abonar: valida admin, que el
--                               abono no exceda el saldo y actualiza el estado
--                               de la deuda de forma transaccional (idempotente).
--
-- Convenciones (heredadas): dinero numeric(12,2); tenant_id en toda tabla;
-- RLS deriva la pertenencia de auth.uid(); los datos sensibles son SOLO admin.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Método de pago en gastos (para el flujo de caja). Default 'efectivo' para
--    que los gastos ya existentes cuenten como salida de efectivo.
-- ----------------------------------------------------------------------------
alter table public.expenses
  add column if not exists metodo_pago text not null default 'efectivo'
    check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia'));

-- ----------------------------------------------------------------------------
-- 2) Proveedores
-- ----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nombre     text not null,
  contacto   text,                                   -- teléfono / correo / responsable
  notas      text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
create index if not exists suppliers_tenant_idx on public.suppliers (tenant_id, nombre);

-- ----------------------------------------------------------------------------
-- 3) Cuentas por pagar
--    monto_pagado lo mantiene la RPC registrar_abono (nunca el cliente).
-- ----------------------------------------------------------------------------
create table if not exists public.payables (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  concepto     text not null,
  categoria    text,                                  -- insumos, renta, servicios...
  monto_total  numeric(12,2) not null check (monto_total >= 0),
  monto_pagado numeric(12,2) not null default 0 check (monto_pagado >= 0),
  estado       text not null default 'pendiente'
                 check (estado in ('pendiente', 'parcial', 'pagada', 'cancelada')),
  vencimiento  date,
  creado_por   uuid references auth.users(id),
  creado_en    timestamptz not null default now()
);
create index if not exists payables_tenant_estado_idx
  on public.payables (tenant_id, estado, vencimiento);

-- ----------------------------------------------------------------------------
-- 4) Abonos a cuentas por pagar (salidas de caja). idempotencia para reintentos.
-- ----------------------------------------------------------------------------
create table if not exists public.payable_payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  payable_id   uuid not null references public.payables(id) on delete cascade,
  monto        numeric(12,2) not null check (monto > 0),
  metodo_pago  text not null default 'efectivo'
                 check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia')),
  idempotencia uuid,
  creado_por   uuid references auth.users(id),
  creado_en    timestamptz not null default now()
);
create index if not exists payable_payments_tenant_idx
  on public.payable_payments (tenant_id, creado_en);
create unique index if not exists payable_payments_idempotencia_uidx
  on public.payable_payments (idempotencia) where idempotencia is not null;

-- ----------------------------------------------------------------------------
-- 5) RLS · contabilidad = SOLO admin (datos sensibles del negocio)
-- ----------------------------------------------------------------------------
alter table public.suppliers         enable row level security;
alter table public.payables          enable row level security;
alter table public.payable_payments  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['suppliers', 'payables', 'payable_payments']
  loop
    execute format('drop policy if exists "%1$s_admin" on public.%1$s;', t);
    execute format($f$
      create policy "%1$s_admin" on public.%1$s
        for all using (public.has_role(tenant_id, 'admin'))
        with check (public.has_role(tenant_id, 'admin'));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6) RPC registrar_abono · único camino para abonar a una cuenta por pagar.
--    Valida admin, que el abono no exceda el saldo, registra el pago y recalcula
--    el estado. Idempotente por token (un reintento no duplica el abono).
-- ----------------------------------------------------------------------------
create or replace function public.registrar_abono(
  p_tenant       uuid,
  p_payable      uuid,
  p_monto        numeric,
  p_metodo       text default 'efectivo',
  p_idempotencia uuid default null
)
returns public.payables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_pay   public.payables;
  v_saldo numeric(12,2);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if not public.has_role(p_tenant, 'admin') then
    raise exception 'Solo el administrador puede registrar pagos';
  end if;

  -- Idempotencia: si el abono ya se registró, devuelve la cuenta tal cual.
  if p_idempotencia is not null
     and exists (select 1 from public.payable_payments
                  where tenant_id = p_tenant and idempotencia = p_idempotencia) then
    select * into v_pay from public.payables
     where id = p_payable and tenant_id = p_tenant;
    return v_pay;
  end if;

  -- Bloquea la fila para que dos abonos simultáneos no pasen el saldo.
  select * into v_pay from public.payables
   where id = p_payable and tenant_id = p_tenant
   for update;
  if not found then
    raise exception 'Cuenta por pagar no encontrada';
  end if;
  if v_pay.estado = 'cancelada' then
    raise exception 'La cuenta está cancelada';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'Monto de abono inválido';
  end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Método de pago inválido';
  end if;

  v_saldo := v_pay.monto_total - v_pay.monto_pagado;
  if p_monto > v_saldo + 0.005 then
    raise exception 'El abono (%) excede el saldo pendiente (%)', p_monto, v_saldo;
  end if;

  insert into public.payable_payments (
    tenant_id, payable_id, monto, metodo_pago, idempotencia, creado_por
  )
  values (p_tenant, p_payable, p_monto, p_metodo, p_idempotencia, v_uid);

  update public.payables set
    monto_pagado = monto_pagado + p_monto,
    estado = case
               when monto_pagado + p_monto >= monto_total - 0.005 then 'pagada'
               else 'parcial'
             end
  where id = p_payable
  returning * into v_pay;

  return v_pay;
end;
$$;

grant execute on function
  public.registrar_abono(uuid, uuid, numeric, text, uuid) to authenticated;

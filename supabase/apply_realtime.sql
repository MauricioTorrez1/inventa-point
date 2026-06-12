-- ============================================================================
-- Inventa Point · Migración 0008 · Realtime para la pantalla de cocina
-- ----------------------------------------------------------------------------
-- Pégalo en Supabase → SQL Editor → Run. Idempotente.
--
-- Publica los cambios de `sales` por Supabase Realtime: cuando entra una venta
-- o cambia su estado, la cocina se entera al instante (sin esperar al polling).
-- Los eventos respetan RLS: cada cliente solo recibe filas de sus negocios.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;
end $$;

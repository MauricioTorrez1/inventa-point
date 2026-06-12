-- ============================================================================
-- POS SaaS · Migración 0007 · Soporte offline (idempotencia de sincronización)
-- ----------------------------------------------------------------------------
-- Pégalo COMPLETO en Supabase → SQL Editor → Run. Idempotente.
--
-- Las ventas/gastos/cortes creados offline se encolan en el dispositivo y se
-- envían al reconectar. Para que un reintento NO duplique el registro, cada
-- operación lleva un token único generado en el cliente (`idempotencia`).
-- ============================================================================


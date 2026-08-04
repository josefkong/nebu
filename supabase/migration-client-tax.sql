-- ============================================================================
-- Nebu — Client tax ID + invoice email (for issuing invoices)
-- The billing entity is the client record (one company = one CNPJ). A person
-- with several companies is several client records, each with its own tax_id.
-- Additive columns; nothing else changes.
-- ============================================================================

alter table public.clients add column if not exists tax_id text default '';
alter table public.clients add column if not exists invoice_email text default '';

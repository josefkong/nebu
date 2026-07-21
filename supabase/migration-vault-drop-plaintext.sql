-- ============================================================================
-- Nebu — Encrypted access credentials (Stage 2: destructive, run LAST)
-- Run ONLY after the app deploy is live and you have verified that revealing
-- a password in the Accesses tab works. This permanently removes the plaintext
-- password column — after this, credentials exist only encrypted in Vault.
-- ============================================================================

alter table public.accesses drop column if exists password;

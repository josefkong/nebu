-- ============================================================================
-- Nebu — Encrypted access credentials (Stage 1: additive, zero breakage)
-- Moves access passwords into Supabase Vault (encrypted at rest, keys held
-- outside the database). The plaintext column is NOT dropped here — that is
-- Stage 2 (migration-vault-drop-plaintext.sql), run only after the app deploy
-- is verified. Until then the old app keeps working.
--
-- What this creates:
--   accesses.secret_id            -> pointer to the Vault secret
--   set_access_secret(id, pw)     -> admin-only: store/update a credential
--   get_access_secret(id)         -> admin-only: decrypt on demand
--   delete trigger                -> removes the Vault secret when an access is deleted
--   data migration                -> copies all existing plaintext passwords into Vault
-- ============================================================================

alter table public.accesses add column if not exists secret_id uuid;

-- Store or update the encrypted credential for an access row. Admin only.
create or replace function public.set_access_secret(p_access_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  select secret_id into v_secret_id from public.accesses where id = p_access_id;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_password, p_access_id::text, 'nebu access credential');
    update public.accesses set secret_id = v_secret_id where id = p_access_id;
  else
    perform vault.update_secret(v_secret_id, p_password);
  end if;
end;
$$;

-- Decrypt a credential on demand. Admin only.
create or replace function public.get_access_secret(p_access_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  select secret_id into v_secret_id from public.accesses where id = p_access_id;
  if v_secret_id is null then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_secret_id;
  return v_secret;
end;
$$;

-- Lock the functions down: only logged-in users may call, and the functions
-- themselves refuse non-admins.
revoke all on function public.set_access_secret(uuid, text) from public, anon;
revoke all on function public.get_access_secret(uuid) from public, anon;
grant execute on function public.set_access_secret(uuid, text) to authenticated;
grant execute on function public.get_access_secret(uuid) to authenticated;

-- When an access row is deleted, delete its Vault secret too (no orphans).
create or replace function public.accesses_delete_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_accesses_delete_secret on public.accesses;
create trigger trg_accesses_delete_secret
  before delete on public.accesses
  for each row execute function public.accesses_delete_secret();

-- Migrate every existing plaintext password into Vault (idempotent: skips rows
-- that already have a secret).
do $$
declare
  r record;
  sid uuid;
begin
  for r in select id, password from public.accesses
           where coalesce(password, '') <> '' and secret_id is null
  loop
    sid := vault.create_secret(r.password, r.id::text, 'nebu access credential');
    update public.accesses set secret_id = sid where id = r.id;
  end loop;
end;
$$;

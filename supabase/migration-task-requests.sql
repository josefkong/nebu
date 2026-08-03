-- ============================================================================
-- Nebu — Client task requests (FIRST client write-path)
-- Clients submit requests into a queue; admin triages (accept -> becomes a
-- client-visible task, or decline with a note). Requests are NOT tasks.
--
-- Security boundary (the whole point):
--   client  -> INSERT a request ONLY for a project they are linked to
--           -> SELECT ONLY their own projects' requests
--           -> NO update, NO delete (can't edit, retract, or self-approve)
--   admin   -> full access (triage)
-- Mirrors the proven my_project_ids() pattern used by finance_client_report.
-- ============================================================================

create table if not exists public.task_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text default '',
  status text not null default 'pending',   -- pending | accepted | declined
  admin_note text default '',                -- your optional response
  task_id uuid,                              -- the task it became, once accepted
  created_at timestamptz default now(),
  decided_at timestamptz
);

-- Table-level grants (Postgres checks these BEFORE RLS). Clients may insert and
-- select; only admin paths update/delete, gated by policy below.
grant select, insert, update, delete on public.task_requests to authenticated;

alter table public.task_requests enable row level security;

-- Admin: full control (triage).
drop policy if exists task_requests_admin_all on public.task_requests;
create policy task_requests_admin_all on public.task_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- Client: read ONLY their own projects' requests.
drop policy if exists task_requests_client_read on public.task_requests;
create policy task_requests_client_read on public.task_requests
  for select using (project_id in (select public.my_project_ids()));

-- Client: insert ONLY into their own projects, and ONLY as a pending request.
-- The status check stops a client from self-submitting an already-"accepted"
-- row. There is deliberately NO client update/delete policy, so those actions
-- fall through to admin-only.
drop policy if exists task_requests_client_insert on public.task_requests;
create policy task_requests_client_insert on public.task_requests
  for insert with check (
    project_id in (select public.my_project_ids())
    and status = 'pending'
  );

create index if not exists task_requests_project_idx
  on public.task_requests (project_id, created_at desc);

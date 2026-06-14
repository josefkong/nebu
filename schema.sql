-- ===========================================================================
-- Nebu — database schema
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It creates every table, the client-access join, and Row Level Security
-- (RLS) so a logged-in client can ONLY read projects they were granted, and
-- only the admin can write anything.
-- ===========================================================================

-- ---- Extensions ----
create extension if not exists pgcrypto;

-- ---- Helper: is the current user the admin? ----
-- Admins are tagged with app_metadata.role = 'admin' on their auth user.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text default '',
  contact text default '',
  created_at timestamptz default now()
);

create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  position int default 0
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  title text not null,
  status text default 'todo',
  urgency text default 'none',
  client_visible boolean default true,
  note text default '',
  guide text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  due_date date,
  recurrence text default 'none',
  target int,
  count int,
  last_done date,
  position int default 0
);

create table if not exists public.finance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  category text default 'other',
  payee text default '',
  amount numeric default 0,
  due_date date,
  recurrence text default 'none',
  status text default 'pending',
  last_paid date,
  method text,
  delivered_at date,
  note text default '',
  client_reported_at date,
  client_method text,
  position int default 0
);

-- NOTE on credentials: Supabase encrypts data at rest at the disk level.
-- For application-level encryption of the password column, see the README
-- section "Securing the Accesses tab". Treat this table as sensitive.
create table if not exists public.accesses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  category text default 'tool',
  username text default '',
  password text default '',
  url text default '',
  note text default '',
  position int default 0
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  when_label text default 'Today',
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text default '',
  email text not null,
  status text default 'invited',
  last_reset date,
  -- links this client row to a Supabase auth user (by matching email), so RLS
  -- can resolve "which projects can the logged-in client see".
  auth_email text generated always as (lower(email)) stored,
  created_at timestamptz default now()
);

-- Which projects each client may access (your "Manage access" UI).
create table if not exists public.client_projects (
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (client_id, project_id)
);

-- ---------------------------------------------------------------------------
-- Helper: set of project ids the CURRENT logged-in client may read.
-- The logged-in user's email can appear as a top-level 'email' claim OR under
-- user_metadata depending on the auth flow, and may be absent from the token
-- entirely. We coalesce all sources and fall back to looking the user up by
-- auth.uid(), so a missing email claim can never silently return zero projects
-- (which would wrongly show a client "no projects shared"). security definer
-- lets the function read auth.users for that final fallback lookup.
-- ---------------------------------------------------------------------------
create or replace function public.my_project_ids() returns setof uuid
language sql stable security definer as $$
  select cp.project_id
  from public.client_projects cp
  join public.clients c on c.id = cp.client_id
  where c.auth_email = lower(coalesce(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    (select u.email from auth.users u where u.id = auth.uid())
  ));
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Pattern for every table: admin can do everything; a client can SELECT only
-- rows belonging to a project in my_project_ids(); clients never write.
-- ---------------------------------------------------------------------------
alter table public.projects        enable row level security;
alter table public.stages          enable row level security;
alter table public.tasks           enable row level security;
alter table public.finance         enable row level security;
alter table public.accesses        enable row level security;
alter table public.activity        enable row level security;
alter table public.clients         enable row level security;
alter table public.client_projects enable row level security;

-- projects
create policy projects_admin_all on public.projects
  for all using (public.is_admin()) with check (public.is_admin());
create policy projects_client_read on public.projects
  for select using (id in (select public.my_project_ids()));

-- stages
create policy stages_admin_all on public.stages
  for all using (public.is_admin()) with check (public.is_admin());
create policy stages_client_read on public.stages
  for select using (project_id in (select public.my_project_ids()));

-- tasks (clients only see client_visible tasks of their projects)
create policy tasks_admin_all on public.tasks
  for all using (public.is_admin()) with check (public.is_admin());
create policy tasks_client_read on public.tasks
  for select using (
    client_visible = true
    and stage_id in (select s.id from public.stages s where s.project_id in (select public.my_project_ids()))
  );

-- finance (clients may also UPDATE only the client-report fields)
create policy finance_admin_all on public.finance
  for all using (public.is_admin()) with check (public.is_admin());
create policy finance_client_read on public.finance
  for select using (project_id in (select public.my_project_ids()));
create policy finance_client_report on public.finance
  for update using (project_id in (select public.my_project_ids()))
  with check (project_id in (select public.my_project_ids()));

-- accesses: ADMIN ONLY. Clients never read credentials.
create policy accesses_admin_all on public.accesses
  for all using (public.is_admin()) with check (public.is_admin());

-- activity
create policy activity_admin_all on public.activity
  for all using (public.is_admin()) with check (public.is_admin());
create policy activity_client_read on public.activity
  for select using (project_id in (select public.my_project_ids()));

-- clients / client_projects: ADMIN ONLY.
create policy clients_admin_all on public.clients
  for all using (public.is_admin()) with check (public.is_admin());
create policy client_projects_admin_all on public.client_projects
  for all using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- IMPORTANT: the client_report update policy above intentionally allows a
-- client to update finance rows of their projects. To stop a client editing
-- anything other than the two report fields, add a column-privilege grant:
-- ===========================================================================
revoke update on public.finance from authenticated;
grant update (client_reported_at, client_method) on public.finance to authenticated;
-- (admin uses the service role / its own policy and is unaffected.)

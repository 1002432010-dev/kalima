-- Kalima database (Supabase project tserowcnvtjpmbtnhbwr). Applied from the SQL editor.
-- Teachers' own activities/units/links, students' results, shared library.
create table if not exists public.docs (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (char_length(id) <= 60),
  kind text not null check (kind in ('activity','unit','link')),
  data jsonb not null check (pg_column_size(data) < 6000000),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);
alter table public.docs enable row level security;
create policy "own docs" on public.docs for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.results (
  id bigint generated always as identity primary key,
  code text not null check (char_length(code) between 3 and 20),
  act text not null check (char_length(act) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  score int not null check (score between 0 and 100),
  correct int not null default 0 check (correct between 0 and 1000),
  total int not null default 0 check (total between 0 and 1000),
  ms int not null default 0 check (ms >= 0),
  wrong jsonb not null default '[]'::jsonb check (jsonb_typeof(wrong) = 'array' and pg_column_size(wrong) < 8000),
  at timestamptz not null default now()
);
create index if not exists results_code_act on public.results (code, act);
alter table public.results enable row level security;
create policy "anyone adds a result" on public.results for insert to anon, authenticated with check (true);
-- no select policy: results are read only through results_for(code), so knowing a link's code is needed
create or replace function public.results_for(p_code text)
returns setof public.results language sql stable security definer set search_path = public as $$
  select * from public.results where code = p_code order by at limit 5000
$$;
revoke all on function public.results_for(text) from public;
grant execute on function public.results_for(text) to anon, authenticated;

create table if not exists public.library (
  id text primary key check (char_length(id) <= 60),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('act','unit')),
  title text not null default '' check (char_length(title) <= 200),
  data jsonb not null check (pg_column_size(data) < 3000000),
  created_at timestamptz not null default now()
);
alter table public.library enable row level security;
create policy "library readable" on public.library for select to anon, authenticated using (true);
create policy "library own insert" on public.library for insert to authenticated with check (owner = auth.uid());
create policy "library own delete" on public.library for delete to authenticated using (owner = auth.uid());

-- table privileges (row-level security still decides which rows)
grant usage on schema public to anon, authenticated;
grant insert on public.results to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.library to anon, authenticated;
grant insert, delete on public.library to authenticated;

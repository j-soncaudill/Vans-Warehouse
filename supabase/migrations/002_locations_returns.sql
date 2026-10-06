-- Floorcast — add locations (with move history) and returns.
--
-- SAFE ON A LIVE DATABASE: this only adds columns, tables and a setting.
-- It never drops or rewrites existing packages. Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

begin;

-- ---------------------------------------------------------------- locations

alter table public.packages add column if not exists last_location text;
alter table public.packages add column if not exists location_at   timestamptz;

create table if not exists public.package_moves (
  id            bigint generated always as identity primary key,
  package_code  text not null references public.packages (code) on update cascade on delete cascade,
  from_location text,
  to_location   text not null check (length(btrim(to_location)) > 0),
  moved_by      text,
  moved_at      timestamptz not null default now()
);
create index if not exists package_moves_code_idx on public.package_moves (package_code, moved_at desc);

-- ---------------------------------------------------------------- returns

create table if not exists public.returns (
  id          bigint generated always as identity primary key,
  code        text not null unique check (code ~ '^V(VR|RS|WR|RR)-[0-9]{4}$'),
  type        text not null check (type in ('vendor','stock','warranty','general')),
  status      text not null default 'open' check (status in ('open','closed')),
  returned_by text,
  vendor      text,
  job_name    text,
  notes       text,
  photo_path  text,               -- package-photos/returns/<code>/<stamp>.jpg
  thumb_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   text,
  close_note  text
);
create index if not exists returns_status_created_idx on public.returns (status, created_at desc);

drop trigger if exists returns_set_updated_at on public.returns;
create trigger returns_set_updated_at
before update on public.returns
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- access

alter table public.package_moves enable row level security;
alter table public.returns enable row level security;
grant select, insert, update, delete on public.package_moves to anon, authenticated;
grant select, insert, update, delete on public.returns to anon, authenticated;

drop policy if exists package_moves_anon_all on public.package_moves;
create policy package_moves_anon_all on public.package_moves
  for all to anon, authenticated using (true) with check (true);

drop policy if exists returns_anon_all on public.returns;
create policy returns_anon_all on public.returns
  for all to anon, authenticated using (true) with check (true);

-- The returns station QR posted in the warehouse carries this token.
-- To retire a printed poster, change it and print a new one:
--   update public.settings set value = encode(extensions.gen_random_bytes(9), 'hex') where key = 'return_station_token';
insert into public.settings (key, value)
values ('return_station_token', encode(extensions.gen_random_bytes(9), 'hex'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------- realtime

alter table public.package_moves replica identity full;
alter table public.returns replica identity full;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['package_moves', 'returns'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

commit;

-- Check: expect 2, 2, 1.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'packages'
       and column_name in ('last_location', 'location_at'))                         as location_columns,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name in ('package_moves', 'returns'))  as new_tables,
  (select count(*) from public.settings where key = 'return_station_token')        as station_token;

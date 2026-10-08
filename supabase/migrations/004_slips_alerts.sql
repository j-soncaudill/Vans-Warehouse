-- Floorcast — packing slip photos and admin alerts.
--
-- SAFE ON A LIVE DATABASE: this only adds columns, tables, settings and small
-- functions. Every existing box and return is kept. Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

begin;

-- ---------------------------------------------------------------- slip photos

alter table public.packages add column if not exists slip_photo_path text;  -- package-photos/slips/<code>/<stamp>.jpg
alter table public.packages add column if not exists slip_thumb_path text;  -- package-photos/slips/<code>/<stamp>-t.jpg

-- ---------------------------------------------------------------- alerts
-- Admin phones that asked for the daily alert. Phones never read this table;
-- they go through the three functions below. Only the daily-alerts job
-- (which runs inside Supabase with its own key) reads it.

create table if not exists public.push_subscriptions (
  endpoint   text primary key check (endpoint like 'https://%'),
  p256dh     text not null,
  auth       text not null,
  pin_hash   text not null,                 -- the shop PIN it was made under
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Server-only: the job's signing keys and the last day it sent.
create table if not exists public.alert_state (
  key   text primary key,
  value text not null
);
alter table public.alert_state enable row level security;
revoke all on public.alert_state from anon, authenticated;

create or replace function public.alerts_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_pin_hash text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, p256dh, auth, pin_hash)
  values (p_endpoint, p_p256dh, p_auth, p_pin_hash)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, pin_hash = excluded.pin_hash;
$$;

create or replace function public.alerts_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- Called when an admin unlocks: phones registered under an older PIN stop
-- getting alerts.
create or replace function public.alerts_prune(p_pin_hash text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where pin_hash <> p_pin_hash;
$$;

revoke all on function public.alerts_subscribe(text, text, text, text) from public;
revoke all on function public.alerts_unsubscribe(text) from public;
revoke all on function public.alerts_prune(text) from public;
grant execute on function public.alerts_subscribe(text, text, text, text) to anon, authenticated;
grant execute on function public.alerts_unsubscribe(text) to anon, authenticated;
grant execute on function public.alerts_prune(text) to anon, authenticated;

-- What counts as "waiting". Change the numbers here any time.
insert into public.settings (key, value) values ('alert_box_days', '30') on conflict (key) do nothing;
insert into public.settings (key, value) values ('alert_return_days', '14') on conflict (key) do nothing;

commit;

-- Check: expect 2, 2, 3.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'packages'
       and column_name in ('slip_photo_path', 'slip_thumb_path'))                         as slip_columns,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name in ('push_subscriptions', 'alert_state')) as alert_tables,
  (select count(*) from pg_proc where proname in ('alerts_subscribe', 'alerts_unsubscribe', 'alerts_prune')) as alert_functions;

-- Floorcast — legacy boxes (on the floor before Floorcast started).
--
-- SAFE ON A LIVE DATABASE: this only adds one yes/no column. Every existing
-- box keeps its data and starts as "not legacy". Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

alter table public.packages add column if not exists legacy boolean not null default false;

comment on column public.packages.legacy is
  'Here before Floorcast. received_at is the approximate arrival month, or the day it was logged.';

-- Check: expect 1.
select count(*) as legacy_column
from information_schema.columns
where table_schema = 'public' and table_name = 'packages' and column_name = 'legacy';

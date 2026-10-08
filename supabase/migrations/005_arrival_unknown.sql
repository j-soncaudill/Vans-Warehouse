-- Floorcast — legacy boxes with an unknown arrival date.
--
-- SAFE ON A LIVE DATABASE: this only adds one yes/no column. Every box keeps
-- its data. Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

alter table public.packages add column if not exists arrival_unknown boolean not null default false;

comment on column public.packages.arrival_unknown is
  'Legacy box whose arrival date nobody knows. received_at is then just when it was logged.';

-- Legacy boxes already saved with the month left blank: their received date is
-- the moment they were logged (a picked month is always the 15th at noon).
update public.packages
set arrival_unknown = true
where legacy
  and not arrival_unknown
  and abs(extract(epoch from (received_at - created_at))) < 60;

-- Check: expect 1, then how many legacy boxes are now "date unknown".
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'packages' and column_name = 'arrival_unknown') as arrival_unknown_column,
  (select count(*) from public.packages where arrival_unknown)                                       as date_unknown_boxes;

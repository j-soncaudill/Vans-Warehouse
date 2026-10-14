-- Floorcast — admin badges.
--
-- SAFE ON A LIVE DATABASE: this only adds one column to the badges table.
-- Everyone already there stays Crew. Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

alter table public.employees add column if not exists role text not null default 'crew';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_role_check') then
    alter table public.employees add constraint employees_role_check check (role in ('crew', 'admin'));
  end if;
end
$$;

comment on column public.employees.role is 'crew or admin. Admin badges print with the admin design.';

-- Check: expect 1.
select count(*) as role_column
from information_schema.columns
where table_schema = 'public' and table_name = 'employees' and column_name = 'role';

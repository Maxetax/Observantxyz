-- 20261124000001_auth_rls.sql
-- Moves the Apollo app to Supabase Auth + row-level security.
--
-- SAFE FOR REAL DATA: adds columns, an index, functions, a trigger and
-- policies. It does not change or delete any existing player or match row.
-- Everything runs in one transaction; if any check at the end fails, nothing
-- is applied.
--
-- BEFORE RUNNING: back up the database, and turn off
-- "Allow new users to sign up" (Authentication > Sign In / Providers).
-- AFTER RUNNING: old app builds stop working (they used the open policies).
-- To undo: run 20261124000001_auth_rls_rollback.sql.

begin;

-- 1. Guard: player names must be unique (case and spaces ignored).
do $$
declare dupes text;
begin
  select string_agg(n, ', ') into dupes from (
    select lower(trim(name)) as n from public.players group by 1 having count(*) > 1
  ) d;
  if dupes is not null then
    raise exception 'Duplicate player names, rename these first: %', dupes;
  end if;
end $$;

-- 2. New columns.
alter table public.players
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists failed_login_attempts int not null default 0,
  add column if not exists locked_until timestamptz;

create unique index if not exists players_name_unique on public.players (lower(trim(name)));

-- 3. Helper functions.
create or replace function public.current_player_id()
returns text
language sql stable security definer set search_path = ''
as $$
  select p.id from public.players p
  where p.auth_user_id = auth.uid() and p.active is true
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.is_admin from public.players p
    where p.auth_user_id = auth.uid() and p.active is true
  ), false)
$$;

-- Name -> hidden login email. Reveals nothing else. Callable before login.
create or replace function public.login_email(p_name text)
returns table (email text, migrated boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id || '@apollo.invalid', p.auth_user_id is not null
  from public.players p
  where lower(trim(p.name)) = lower(trim(p_name))
    and p.type = 'VAST'
    and p.active is true
$$;

-- Server functions only: find a login by its hidden email, to recover from an
-- earlier move-over that created the login but died before linking it.
create or replace function public.auth_user_id_for_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email)
$$;
revoke all on function public.auth_user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_for_email(text) to service_role;

revoke all on function public.current_player_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.login_email(text) from public;
grant execute on function public.current_player_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.login_email(text) to anon, authenticated;

-- 4. Only admins may change protected columns. Applies to app users
--    (anon/authenticated); server functions use service_role.
--    Must be SECURITY INVOKER: under security definer, current_user would be
--    the owner and the check would never fire.
create or replace function public.players_protect_columns()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() and (
       new.id is distinct from old.id
    or new.is_admin is distinct from old.is_admin
    or new.type is distinct from old.type
    or new.active is distinct from old.active
    or new.auth_user_id is distinct from old.auth_user_id
  ) then
    raise exception 'Alleen admins mogen dit veld wijzigen';
  end if;
  return new;
end;
$$;

drop trigger if exists players_protect_columns on public.players;
create trigger players_protect_columns
  before update on public.players
  for each row execute function public.players_protect_columns();

-- 5. Policies: replace the open ones.
drop policy if exists "Public access to players" on public.players;
drop policy if exists "Public access to matches" on public.matches;

alter table public.players enable row level security;
alter table public.matches enable row level security;

create policy players_select on public.players for select to authenticated
  using ((select public.current_player_id()) is not null);
create policy players_insert on public.players for insert to authenticated
  with check ((select public.is_admin()));
create policy players_update on public.players for update to authenticated
  using ((select public.is_admin()) or id = (select public.current_player_id()))
  with check ((select public.is_admin()) or id = (select public.current_player_id()));
create policy players_delete on public.players for delete to authenticated
  using ((select public.is_admin()));

create policy matches_select on public.matches for select to authenticated
  using ((select public.current_player_id()) is not null);
create policy matches_insert on public.matches for insert to authenticated
  with check ((select public.is_admin()));
create policy matches_update on public.matches for update to authenticated
  using ((select public.current_player_id()) is not null)
  with check ((select public.current_player_id()) is not null);
create policy matches_delete on public.matches for delete to authenticated
  using ((select public.is_admin()));

-- 6. Privileges. A column-level revoke does not override a table-level grant,
--    so revoke everything and grant only the columns the app needs.
revoke all on public.players from anon, authenticated;
revoke all on public.matches from anon, authenticated;

grant select (id, name, type, active, is_admin, phone, address, notes, created_at, auth_user_id)
  on public.players to authenticated;
grant insert (id, name, type, active, is_admin, phone, address, notes, created_at)
  on public.players to authenticated;
grant update (name, type, active, is_admin, phone, address, notes)
  on public.players to authenticated;
grant delete on public.players to authenticated;

grant select, insert, update, delete on public.matches to authenticated;

-- 7. Checks. Any failure undoes the whole migration.
do $$
declare admins int; vast int;
begin
  select count(*) into admins from public.players where is_admin is true and active is true;
  if admins = 0 then
    raise exception 'No active admin player. Make one player admin first, then rerun.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and policyname like 'Public access%') then
    raise exception 'Open "Public access" policies are still present.';
  end if;
  if has_column_privilege('authenticated', 'public.players', 'password_hash', 'SELECT')
     or has_column_privilege('anon', 'public.players', 'password_hash', 'SELECT')
     or has_table_privilege('anon', 'public.players', 'SELECT')
     or has_table_privilege('anon', 'public.matches', 'SELECT') then
    raise exception 'Privileges still too open.';
  end if;
  select count(*) into vast from public.players where type = 'VAST' and active is true;
  raise notice 'Auth migration OK: % active admin(s), % active VAST player(s) will move over on first login.', admins, vast;
end $$;

commit;

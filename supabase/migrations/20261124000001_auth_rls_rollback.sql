-- 20261124000001_auth_rls_rollback.sql
-- Emergency undo for 20261124000001_auth_rls.sql: restores the OLD open access
-- so old app builds work again. This re-opens the security hole, so use it
-- only as a stopgap. The added columns are kept (harmless) and no data
-- changes.

begin;

drop policy if exists players_select on public.players;
drop policy if exists players_insert on public.players;
drop policy if exists players_update on public.players;
drop policy if exists players_delete on public.players;
drop policy if exists matches_select on public.matches;
drop policy if exists matches_insert on public.matches;
drop policy if exists matches_update on public.matches;
drop policy if exists matches_delete on public.matches;

drop trigger if exists players_protect_columns on public.players;
drop function if exists public.players_protect_columns();
drop function if exists public.login_email(text);
drop function if exists public.auth_user_id_for_email(text);
drop function if exists public.is_admin();
drop function if exists public.current_player_id();
drop index if exists public.players_name_unique;

drop policy if exists "Public access to players" on public.players;
drop policy if exists "Public access to matches" on public.matches;
create policy "Public access to players" on public.players
  for all to anon, authenticated using (true) with check (true);
create policy "Public access to matches" on public.matches
  for all to anon, authenticated using (true) with check (true);

grant all on public.players to anon, authenticated;
grant all on public.matches to anon, authenticated;

commit;

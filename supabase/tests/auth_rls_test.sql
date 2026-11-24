-- Access-rule tests for 20261124000001_auth_rls.sql.
-- Run in the Supabase SQL Editor AFTER the migration. Everything happens
-- inside one transaction that is rolled back: nothing is kept.
-- Success: the final result row says 'ALL AUTH RLS TESTS PASSED'.
-- Failure: an error starting with 'FAIL:'.

begin;

-- Test fixtures (rolled back at the end).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't-admin@apollo.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 't-player@apollo.invalid'),
  ('00000000-0000-0000-0000-0000000000c3', 't-inactive@apollo.invalid'),
  ('00000000-0000-0000-0000-0000000000d4', 'nobody@apollo.invalid');
insert into public.players (id, name, type, active, is_admin, auth_user_id) values
  ('t-admin', 'T Admin', 'VAST', true, true, '00000000-0000-0000-0000-0000000000a1'),
  ('t-player', 'T Player', 'VAST', true, false, '00000000-0000-0000-0000-0000000000b2'),
  ('t-inactive', 'T Inactive', 'VAST', false, false, '00000000-0000-0000-0000-0000000000c3'),
  ('t-wissel', 'T Wissel', 'WISSEL', true, false, null);
insert into public.matches (id, date, opponent, location, is_home, status) values
  ('t-match', '01-01-2027', 'T Opponent', 'T Hal', true, 'GEPLAND');

-- ---------- anon (not logged in) ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare denied boolean := false;
begin
  begin perform 1 from public.players; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: anon can read players'; end if;
  denied := false;
  begin perform 1 from public.matches; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: anon can read matches'; end if;
end $$;

do $$
declare r record;
begin
  select * into r from public.login_email('T Player');
  if r.email is distinct from 't-player@apollo.invalid' or r.migrated is distinct from true then
    raise exception 'FAIL: login_email(T Player) returned %', r;
  end if;
  select * into r from public.login_email('  t player ');
  if r.email is distinct from 't-player@apollo.invalid' then
    raise exception 'FAIL: login_email ignores case/spaces wrongly: %', r;
  end if;
  if exists (select 1 from public.login_email('T Wissel')) then
    raise exception 'FAIL: login_email returns a WISSEL player';
  end if;
  if exists (select 1 from public.login_email('T Inactive')) then
    raise exception 'FAIL: login_email returns an inactive player';
  end if;
  if exists (select 1 from public.login_email('Niemand')) then
    raise exception 'FAIL: login_email returns a row for an unknown name';
  end if;
end $$;

reset role;

-- ---------- regular player ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$
declare denied boolean := false; n int;
begin
  select count(*) into n from public.players where id like 't-%';
  if n <> 4 then raise exception 'FAIL: player sees % test players, expected 4', n; end if;

  -- Only while the column still exists (20261124000002 drops it).
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'players' and column_name = 'password_hash') then
    begin execute 'select password_hash from public.players'; exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'FAIL: player can read password_hash'; end if;
  end if;

  update public.players set phone = '0600000000' where id = 't-player';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: player cannot update own phone'; end if;

  denied := false;
  begin update public.players set is_admin = true where id = 't-player';
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'FAIL: player can make themselves admin'; end if;

  denied := false;
  begin update public.players set active = false where id = 't-player';
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'FAIL: player can change own active flag'; end if;

  update public.players set phone = '0611111111' where id = 't-admin';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: player can update another player'; end if;

  denied := false;
  begin insert into public.matches (id, opponent) values ('t-new', 'X');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: player can create a match'; end if;

  denied := false;
  begin insert into public.matches (id, opponent) values ('t-match', 'X')
    on conflict (id) do update set opponent = excluded.opponent;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: player upsert on a match should be refused (app must use update)'; end if;

  update public.matches set rounds = '[{"x":1}]'::jsonb where id = 't-match';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: player cannot update match scores'; end if;

  delete from public.matches where id = 't-match';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: player can delete a match'; end if;

  denied := false;
  begin delete from public.players where id = 't-wissel'; get diagnostics n = row_count;
    if n = 0 then denied := true; end if;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL: player can delete a player'; end if;
end $$;

reset role;

-- ---------- inactive player ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.players;
  if n <> 0 then raise exception 'FAIL: inactive player sees % players', n; end if;
  select count(*) into n from public.matches;
  if n <> 0 then raise exception 'FAIL: inactive player sees % matches', n; end if;
end $$;
reset role;

-- ---------- logged in, but no player row ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.matches;
  if n <> 0 then raise exception 'FAIL: account without player row sees % matches', n; end if;
end $$;
reset role;

-- ---------- admin ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; r record;
begin
  insert into public.matches (id, opponent) values ('t-new2', 'Y');
  delete from public.matches where id = 't-new2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot delete a match'; end if;

  update public.players set is_admin = true where id = 't-player';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot change is_admin'; end if;

  update public.players set name = 'T Renamed' where id = 't-player';
  select * into r from public.login_email('T Renamed');
  if r.email is distinct from 't-player@apollo.invalid' then
    raise exception 'FAIL: renamed player login_email returned %', r;
  end if;

  insert into public.players (id, name, type) values ('t-added', 'T Added', 'WISSEL');
  delete from public.players where id = 't-added';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot add/delete players'; end if;
end $$;
reset role;

rollback;

select 'ALL AUTH RLS TESTS PASSED' as result;

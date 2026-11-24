-- 20261124000002_drop_password_hash.sql
-- Final step of the auth rollout: removes the old SHA-256 password hashes.
--
-- Run only after every active vaste speler has logged in once with the new app
-- (or an admin has set a password for them via Spelers > Aanpassen).
-- If anyone has not moved over yet, this stops with their names and changes nothing.
-- NOT reversible: the old hashes are gone afterwards (that is the point).

begin;

do $$
declare waiting text;
begin
  select string_agg(name, ', ' order by name) into waiting
  from public.players
  where type = 'VAST' and active is true and auth_user_id is null;
  if waiting is not null then
    raise exception 'These players have not moved over yet (log in once, or admin sets a password): %', waiting;
  end if;
end $$;

alter table public.players drop column if exists password_hash;

commit;

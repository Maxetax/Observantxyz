# Supabase Auth + row-level security for the Apollo team app

Date: 2026-11-24 · Status: draft, awaiting approval

## Why

Login is checked on the phone. Before login, the app downloads every player's
SHA-256 password hash (unsalted; the default for everyone is `123`), phone
number and address with the public Supabase key, and it writes to the database
with that same key. Anyone with the app or the key can read personal data,
crack passwords, or make themselves admin. The admin limits added on
2026-11-24 only hide buttons. This has to be fixed before launch.

## Goals

- Players keep logging in with **full name + password**, as today.
- Supabase enforces access: nothing is readable or writable without a valid
  login, and admin-only actions are rejected by the database itself.
- Password hashes and contact details are never sent to a device that isn't
  logged in. Hashes are never sent to any device.
- Existing players move over without anyone being handed a new password.
- Forgotten passwords: an admin sets a new one.
- App store review gets a working test login (a normal name + password).

## Non-goals

- Email addresses, "forgot password" emails, email codes, social login.
- Logins for substitute (WISSEL) players. Only active VAST players log in,
  same as today.
- Offline login. A player already logged in keeps the local cache as today;
  logging in needs a connection.
- Redesigning screens beyond what login, logout and password changes need.

## Anti-goals (failure even if it "works")

- Any path where the public key alone can read `password_hash`, phone or
  address, or write any row.
- A player locked out by the move-over (for example someone still on `123`
  or on a 4-5 character password).
- Renaming a player breaks their login.
- The service-role key ending up in the app bundle.

## Constraints

- Expo SDK 54 / React Native 0.81, `@supabase/supabase-js` v2, AsyncStorage.
- Supabase project `zhatqwobnsgmuocxsjmb`; existing tables `players` and
  `matches`. Known from the user's setup script (2026-11-24):
  - `players`: `id text` (e.g. `p-1`), `name`, `type`, `active bool`,
    `is_admin bool`, `password_hash text`, `phone`, `address`, `notes`,
    `created_at`.
  - `matches`: `id`, `date` (text, `DD-MM-YYYY`), `opponent`, `location`,
    `is_home`, `status`, `selected_player_ids jsonb`,
    `declined_player_ids jsonb`, `rounds jsonb`, `final_result jsonb`,
    `created_at`.
  - RLS is enabled with policies **"Public access to players"** and
    **"Public access to matches"**: `FOR ALL TO anon, authenticated USING
    (true) WITH CHECK (true)`. The migration must drop both.
  - Both tables are in the `supabase_realtime` publication.
  - The setup script's seed upserts six demo players (`p-1`..`p-6`, Lars van
    Dijk as admin) with the hash of `123` (its comment wrongly says
    `welkom123`), and overwrites contact details and `is_admin` on re-run. It
    must be retired, not re-run.
- No Supabase CLI on the machine. SQL lives in `supabase/migrations/` and the
  functions in `supabase/functions/`. The user applies them through the
  dashboard (SQL Editor, Edge Functions). *(My call.)*
- Supabase Auth's minimum password length is 6 by default; the old app
  allowed 4, and the default is `123`.
- Player IDs are strings like `p-1`, `p-1732...`.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Supabase Auth, hidden email built from the player **ID** (`p-1@apollo.invalid`); a database function resolves name → hidden email at login; server functions for move-over and admin password resets | Uses Supabase's own sessions, refresh and password storage; renames are safe. Needs one lookup function and two small server functions. |
| B | Own server function that checks name + password and mints its own JWTs | Hand-built token signing and refresh: the security-critical part done by hand. Rejected. |
| C | Hidden email built from the **name** | No lookup function, but renames break logins and similar names collide. Rejected. |

The user chose name + password login (not email) and approach A.

## Design

### Database (one SQL migration in `supabase/migrations/`)

- `players.auth_user_id uuid unique references auth.users(id)`: null until
  the player has moved over.
- Unique index on `lower(trim(name))`. If existing data has duplicates, the
  migration must stop and report them rather than auto-renaming.
- Helper functions (`security definer`, `set search_path = ''`):
  - `current_player_id()`: the `players.id` whose `auth_user_id = auth.uid()`.
  - `is_admin()`: that player is `active` and `is_admin`.
- `login_email(p_name text) returns text`, callable by `anon`: for an active
  VAST player with that name (case-insensitive, trimmed), returns
  `<id>@apollo.invalid` and whether they have moved over yet; otherwise null.
  It reveals nothing else.
- **RLS on, no `anon` access** to `players` or `matches`. "Logged in" in
  every policy below means `current_player_id()` is not null **and** that
  player is active, not just the `authenticated` role. So an auth account with
  no player row, or a deactivated player with a still-valid session, sees
  nothing. *(Builder-check call.)*
  - `players`: `select` for logged-in players. `insert`/`delete` admin
    only. `update`: admin, or the player's own row.
  - A `before update` trigger rejects changes to `is_admin`, `type`,
    `active`, `auth_user_id`, `id` unless `is_admin()`, so a player editing
    their own profile can only change name, phone, address and notes.
  - `matches`: `select` and `update` for authenticated users (everyone
    enters scores and attendance); `insert`/`delete` admin only.
- Column privileges: revoke `select`, `insert` and `update` on
  `password_hash` from `anon` and `authenticated`.
  Only the service role can read it, and the move-over is its only use.
  A later migration drops the column once every VAST player has moved over.
- Realtime keeps working because `postgres_changes` respects RLS for the
  logged-in user.

### Server functions (`supabase/functions/`, service-role key stays server-side)

**`migrate-login`** (no login required). Input: `name`, `password`,
optional `newPassword`.
1. Find the active VAST player by name. Error if not found or already moved
   over.
2. Compare `sha256(trim(password))` with `password_hash`. If it doesn't
   match, return a generic "invalid login" error.
3. If the old password is the default (`123`) or shorter than 6 characters,
   require `newPassword` (at least 6 characters). Without it, return
   `needs_new_password`.
4. Create the auth user (`<id>@apollo.invalid`, email confirmed) with
   `newPassword` if given, otherwise the old password. Set
   `players.auth_user_id` and clear `password_hash`.
5. The app then signs in normally.

Basic brute-force guard: count failed attempts per player and refuse for
15 minutes after 10 failures (columns on `players` or a small table; the
builder decides).

**`admin-account`** (caller must be logged in and `is_admin()`). Actions:
- `set-password {playerId, password}`: creates the auth user if the player
  has none (new VAST player, or someone who never moved over), otherwise
  updates their password. Used both to reset a forgotten password and to
  give a new player their first one.
- `remove {playerId}`: deletes the auth user when a player is deleted (the
  app deletes the row through RLS; this cleans up the login).

### App

- `controller/supabase.js`: create the client with AsyncStorage session
  storage, `autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`.
- Login (`Page0_Login.js`): `rpc('login_email', name)`, then:
  - moved over → `auth.signInWithPassword`;
  - not moved over → call `migrate-login`; on `needs_new_password`, show
    "choose a new password" (twice), resend, then sign in.
  - every failure shows the same "Ongeldige inloggegevens."
- The login screen no longer loads any player data. Data loads only after a
  session exists.
- Session = source of truth. `Landingpage.js` uses `auth.getSession()` and
  `onAuthStateChange`. The current user is the player whose `auth_user_id`
  matches. `saveAuthUser`/`getSavedUser` and the stored user go away.
- Logout: `auth.signOut()` and clear the AsyncStorage player/match cache.
- Own password change (players page, own profile):
  `auth.updateUser({ password })`, minimum 6.
- Admin, players page: "Set password" on a VAST player calls
  `admin-account set-password`. Shown after adding a VAST player, and as a
  reset button.
- `storage.js`: select explicit columns (never `*`, never `password_hash`);
  stop writing `password_hash`; remove `INITIAL_PLAYERS` seeding and the
  default hash; surface write errors (RLS rejections) to the user instead of
  only logging them.
- Remove `controller/security.js` hashing and `DEFAULT_PASSWORD_HASH` from
  the app once login no longer needs them.

### Rollout order

1. Back up the database (Supabase dashboard).
2. In Supabase Auth settings, **turn off public sign-ups** (accounts are
   only created by the server functions). Apply the migration and deploy
   both functions. The migration prints how many active admins exist; if
   zero, stop and set one by hand first. *(Builder-check calls.)*
3. Ship the new app build. Old builds stop working against the locked-down
   tables. That's acceptable before launch, but tell the team to update.
4. After everyone has logged in once: the drop-`password_hash` migration.
   An admin sets a password for anyone who never moved over.

### Testing

- SQL tests for the policies and trigger: anon can't read/write; a player
  can't edit others, can't change their own `is_admin`/`type`/`active`, can't
  insert/delete matches; an admin can.
- Function tests: wrong password, `123` → `needs_new_password`, short
  `newPassword` rejected, already moved over, lockout after 10 failures.
- Manual check in the app: move-over login, normal login, rename then
  login, logout, password change, admin reset.
- With no local Supabase available, policy tests run in the dashboard SQL
  Editor inside `begin; ... rollback;`. They switch role with
  `set local role anon` / `authenticated` and set
  `request.jwt.claims` to act as a given player. Nothing they do is kept.
  *(My call.)*
- The `migrate-login` function is first tried against one player who
  agrees to it (ideally the admin) before telling the team.

## Left to the builder

- Exact SQL, policy names, file layout of functions.
- Where failed-attempt counts live.
- Whether `.invalid` passes Supabase's email validation; if not, use
  another unreachable domain (e.g. `players.apollo-team.local`).
- UI copy and layout of the "new password" and "set password" screens
  (Dutch, matching existing style).

## Live data

The live database holds the **real team** (confirmed by the user). So:

- No step may delete or rewrite existing player or match rows. Schema
  changes only add columns, indexes, functions and policies. The only data
  writes are setting `auth_user_id` and clearing `password_hash`, both done
  per player during the move-over.
- Each migration file runs in a single transaction and ends with
  verification queries (admin count, duplicate names, policy list). If a check
  fails, it raises an error, so nothing is applied.
- A matching rollback script (`..._rollback.sql`) restores the old open
  policies and drops the new objects, in case the app has to go back to the
  old version quickly.
- A backup from the dashboard before every step.

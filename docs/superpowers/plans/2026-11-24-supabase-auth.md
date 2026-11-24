# Supabase Auth + RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players keep logging in with name + password, but authentication runs on Supabase Auth and the database enforces who can read and write what.

**Architecture:** Each VAST player gets a Supabase Auth user with a hidden email `<playerId>@apollo.invalid`. A `login_email(name)` SQL function maps name → hidden email. A `migrate-login` Edge Function moves players over on first login by checking their legacy SHA-256 hash. An `admin-account` Edge Function lets admins set passwords and remove logins. RLS and column grants lock both tables to active, logged-in players.

**Tech Stack:** Expo SDK 54 / React Native 0.81, `@supabase/supabase-js` v2, Supabase Postgres + Edge Functions (Deno), Node 26 `node --test` for pure-logic tests (runs `.ts` natively).

**Spec:** `docs/superpowers/specs/2026-11-24-supabase-auth-design.md`

## Global Constraints

- Hidden email domain: exactly `apollo.invalid` → `<playerId>@apollo.invalid`, identical in SQL and TS.
- Minimum new password length: **6**.
- Legacy default password: `123` (hash `a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3`).
- Lockout: **10** failed move-over attempts → locked for **15 minutes**.
- Only active `VAST` players can log in.
- Every login failure shows exactly `Ongeldige inloggegevens.` (no hint whether the name exists).
- Live DB holds **real team data**: no migration may delete or rewrite existing player/match rows. Each migration file is one transaction ending in checks that `raise exception` on failure.
- The service-role key never appears in the app; only in Edge Functions via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- App never selects `*` from `players` and never reads or writes `password_hash`.
- UI copy is Dutch and follows existing styles in the touched page.
- The user applies SQL via the dashboard SQL Editor and deploys functions via the dashboard; executors cannot run them. Steps that need the live project say "Ask the user to run…" with the exact expected output.

## Review Focus

1. **Passwords with characters the old app stripped.** The old app removed `<>"'\`;\/` as you typed and trimmed before hashing. A player whose password was set that way must still match. → `normalizePassword` is applied identically in the app and server; pinned by tests in Task 1 and Task 4.
2. **Postgres column revokes don't override table grants.** Revoking `password_hash` alone leaves it readable. → Task 2 revokes table-level privileges and grants explicit columns; pinned by a SQL test asserting `select password_hash` errors for `authenticated`.
3. **Half-finished move-over.** The auth user gets created, then the `players` update fails, and the player is stuck "already registered". → Task 3 deletes the auth user when the row update fails; pinned by a `planMigration` unit test for the rollback decision.
4. **Deactivated player with a live session.** → All policies go through `current_player_id()`, which only matches active players; SQL test with an inactive player expects 0 rows.
5. **Renamed player.** → The login lookup is by name and the email by ID; SQL test renames a test player and asserts `login_email(newName)` returns the same email.

---

### Task 1: Test runner + shared password rules

**Files:**
- Modify: `package.json` (add `"test": "node --test \"tests/**/*.test.*\""` to `scripts`; remove `expo-crypto` from dependencies)
- Create: `controller/passwordRules.js`
- Create: `supabase/functions/migrate-login/rules.ts`
- Test: `tests/passwordRules.test.js`, `tests/migrateRules.test.ts`

**Interfaces:**
- Produces (both files, same behavior):
  - `normalizePassword(raw: string): string`: strip `/[<>"'`;\\/]/g`, then trim.
  - `MIN_PASSWORD_LENGTH = 6`
  - `HIDDEN_EMAIL_DOMAIN = 'apollo.invalid'`; `hiddenEmail(playerId: string): string`
- Produces (`rules.ts` only):
  - `sha256Hex(text: string): Promise<string>` (via `crypto.subtle`)
  - `LEGACY_DEFAULT_HASH`, `MAX_FAILED_ATTEMPTS = 10`, `LOCK_MINUTES = 15`
  - `planMigration(input: { storedHash: string | null; password: string; newPassword?: string; failedAttempts: number; lockedUntil: string | null; now: Date }): Promise<{ action: 'create'; authPassword: string } | { action: 'reject'; status: 'invalid' | 'locked' | 'needs_new_password' | 'weak_new_password'; failedAttempts: number; lockedUntil: string | null }>`
  - `onCreateFailure(rowUpdateOk: boolean): 'keep' | 'delete_auth_user'`

- [ ] **Step 1: Write failing tests.** In `tests/passwordRules.test.js`:
  - `normalizePassword('  ab"c;d  ') === 'abcd'`
  - `hiddenEmail('p-1') === 'p-1@apollo.invalid'`

  In `tests/migrateRules.test.ts` (import from `../supabase/functions/migrate-login/rules.ts`):
  - `sha256Hex('123')` equals `LEGACY_DEFAULT_HASH`
  - Correct non-default password `'geheim1'` (stored = its hash) → `{ action: 'create', authPassword: 'geheim1' }`
  - Stored hash of `'abc'`, typed `' a"bc '` → `create` (legacy normalization)
  - Default `'123'` with no `newPassword` → `reject` / `needs_new_password`
  - Stored hash of 4-char `'abcd'`, no `newPassword` → `needs_new_password`
  - Correct old password + `newPassword: 'kort'` → `weak_new_password`
  - Correct old + `newPassword: 'nieuw123'` → `create` with `authPassword: 'nieuw123'`
  - Wrong password, `failedAttempts: 3` → `invalid`, `failedAttempts: 4`, `lockedUntil: null`
  - Wrong password, `failedAttempts: 9` → `invalid`, `failedAttempts: 0`, `lockedUntil` = now + 15 min (ISO)
  - `lockedUntil` in the future → `locked` even with the correct password, counters unchanged
  - `storedHash: null` → `invalid`
  - `onCreateFailure(false) === 'delete_auth_user'`, `onCreateFailure(true) === 'keep'`
  - Correct old + `newPassword: ' nieuw123 '` → `authPassword: 'nieuw123'` (`newPassword` is normalized too)
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement both files. `rules.ts` uses only Web APIs (no Deno imports) so Node can load it. Imports use explicit `.ts` extensions.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: shared password rules for Supabase auth move-over`.

---

### Task 2: Auth + RLS migration, rollback, and SQL tests

**Files:**
- Create: `supabase/migrations/20261124000001_auth_rls.sql`
- Create: `supabase/migrations/20261124000001_auth_rls_rollback.sql`
- Create: `supabase/tests/auth_rls_test.sql`

**Interfaces:**
- Produces (DB):
  - `players.auth_user_id uuid unique references auth.users(id) on delete set null`
  - `players.failed_login_attempts int not null default 0`, `players.locked_until timestamptz`
  - `public.current_player_id() returns text`: id of the **active** player with `auth_user_id = auth.uid()`, else null
  - `public.is_admin() returns boolean`
  - `public.login_email(p_name text) returns table(email text, migrated boolean)`: for active VAST player matching `lower(trim(name))`; executable by `anon`, `authenticated`
  - Unique index `players_name_unique on players (lower(trim(name)))`
  - Policies: `players`: select (logged in), insert/delete (admin), update (admin or own row). `matches`: select/update (logged in), insert/delete (admin). "Logged in" = `current_player_id() is not null`.
  - Trigger `players_protect_columns` (before update): raises `'Alleen admins mogen dit veld wijzigen'` if `is_admin`, `type`, `active`, `auth_user_id` or `id` changes and `not is_admin()`.
  - Grants: `revoke all on players, matches from anon, authenticated`. Then `grant select (id, name, type, active, is_admin, phone, address, notes, created_at, auth_user_id)`, `insert (id, name, type, active, is_admin, phone, address, notes, created_at)`, `update (name, type, active, is_admin, phone, address, notes)`, `delete` on players to `authenticated`, and `select, insert, update, delete` on matches to `authenticated`. Nothing on `password_hash`, `failed_login_attempts` or `locked_until` for anon/authenticated.

- [ ] **Step 1: Write `supabase/tests/auth_rls_test.sql`.** It is one `begin; … rollback;` block. It creates its own auth users and players (`t-admin`, `t-player`, `t-inactive`, plus a WISSEL `t-wissel`), so real rows aren't relied on. It acts as each one via `set local role authenticated` + `select set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role', 'authenticated')::text, true)`. Each assertion is `assert`/`raise exception` with a message, and it ends with `raise notice 'ALL AUTH RLS TESTS PASSED'`. Assertions:
  - anon: `select from players` → permission error
  - anon: `login_email('T Player')` → `t-player@apollo.invalid`, `migrated = true`; `login_email('T Wissel')` → no row; `login_email('t player ')` → same as the first (case and trim)
  - t-player: sees the players rows; `select password_hash from players` → permission error
  - t-player: update own `phone` → 1 row; update own `is_admin = true` → trigger error; update t-admin's `phone` → 0 rows
  - t-player: insert match → RLS error; update a test match's `rounds` → 1 row; delete it → 0 rows
  - t-inactive: `select count(*) from players` = 0
  - auth user with no player row: `select count(*) from matches` = 0
  - t-admin: insert + delete match succeed; update t-player `is_admin` succeeds
  - rename t-player (as admin) to `T Renamed` → `login_email('T Renamed')` returns `t-player@apollo.invalid`
- [ ] **Step 2: Write the migration** in one transaction, in this order:
  1. Guard: if `select lower(trim(name)) … group by 1 having count(*) > 1` returns rows → `raise exception` listing them.
  2. Columns, functions (`security definer`, `set search_path = ''`, fully qualified names), trigger.
  3. `drop policy if exists "Public access to players"` / `"Public access to matches"`, then the new policies.
  4. Grants as listed above. `grant execute on function public.login_email(text) to anon, authenticated`; revoke execute on the helpers from `anon`.
  5. Checks: `raise exception` if there are zero active admins, if any policy named `Public access%` remains, or if `has_column_privilege('authenticated','public.players','password_hash','SELECT')` is true. End with `raise notice` reporting how many VAST players there are.
- [ ] **Step 3: Write the rollback.** It drops the new policies, trigger, functions and index (keeping the added columns, which is harmless). It re-creates the two `Public access` policies exactly as the user's original setup script had them, and restores `grant all on players, matches to anon, authenticated`.
- [ ] **Step 4: Ask the user** to back up the database (Dashboard → Database → Backups), turn off **Allow new users to sign up** (Authentication → Sign In / Providers), run the migration in the SQL Editor (expected: notice with the VAST count, no error), then run `auth_rls_test.sql` (expected: `ALL AUTH RLS TESTS PASSED`; nothing persists).
  ⚠️ After this step, **old app builds stop working** (anon has no access). Do Tasks 3–6 before this step reaches the live project, or be ready to run the rollback.
- [ ] **Step 5:** Commit `feat(db): Supabase auth columns, RLS policies and tests`.

---

### Task 3: `migrate-login` Edge Function

**Files:**
- Create: `supabase/functions/migrate-login/index.ts`

**Interfaces:**
- Consumes: `planMigration`, `onCreateFailure`, `hiddenEmail`, `normalizePassword` from `./rules.ts`. DB columns from Task 2.
- Produces: `POST /functions/v1/migrate-login`, body `{ name: string, password: string, newPassword?: string }`. **Always HTTP 200** with `{ status: 'ok' | 'invalid' | 'locked' | 'needs_new_password' | 'weak_new_password' }`, or HTTP 500 `{ status: 'error' }`. CORS headers for web.

- [ ] **Step 1: Implement.** Use `Deno.serve` and a service-role client (`createClient` from `npm:@supabase/supabase-js@2`).
  1. Find the active VAST player by `lower(trim(name))` with `auth_user_id is null`. No match → `invalid`.
  2. Call `planMigration` with the row's hash, counters and `new Date()`.
  3. On `reject`: persist `failedAttempts`/`lockedUntil` and return the status.
  4. On `create`: `auth.admin.createUser({ email: hiddenEmail(id), password: authPassword, email_confirm: true })`.
  5. Then update the row: `auth_user_id`, `password_hash = null`, `failed_login_attempts = 0`, `locked_until = null`. If that fails, act on `onCreateFailure(false)` (`auth.admin.deleteUser`) and return 500.
  6. If `createUser` fails because the email is rejected as invalid, return 500 and log the message. (That means `.invalid` isn't accepted; switch `HIDDEN_EMAIL_DOMAIN` in both rule files and in the SQL `login_email` to `players.apollo-team.local`.)
- [ ] **Step 2:** Run `npm test`. Expected: still passes (the function's imports resolve).
- [ ] **Step 3: Ask the user** to create the function `migrate-login` in Dashboard → Edge Functions, paste `index.ts` and `rules.ts`, and **turn off "Verify JWT"** (callers aren't logged in yet). Then check from PowerShell with a made-up name:
  `Invoke-RestMethod -Method Post -Uri https://zhatqwobnsgmuocxsjmb.supabase.co/functions/v1/migrate-login -Headers @{apikey='<publishable key>'} -ContentType 'application/json' -Body '{"name":"Niemand Bestaat","password":"x"}'`
  Expected: `status: invalid`.
- [ ] **Step 4:** Commit `feat(functions): migrate-login moves players to Supabase Auth`.

---

### Task 4: `admin-account` Edge Function

**Files:**
- Create: `supabase/functions/admin-account/rules.ts`, `supabase/functions/admin-account/index.ts`
- Test: `tests/adminAccountRules.test.ts`

**Interfaces:**
- Consumes: the same `normalizePassword`, `MIN_PASSWORD_LENGTH`, `hiddenEmail`, defined again in this folder's `rules.ts` (dashboard functions can't import across folders). The test asserts both copies agree.
- Produces: `parseAdminRequest(body: unknown): { action: 'set-password'; playerId: string; password: string } | { action: 'remove'; authUserId: string } | { error: 'invalid_request' | 'weak_password' }`.
  Endpoint `POST /functions/v1/admin-account` (Verify JWT **on**), always HTTP 200 with `{ status: 'ok' | 'forbidden' | 'not_found' | 'invalid_request' | 'weak_password' }`, or 500 `{ status: 'error' }`.

- [ ] **Step 1: Write failing tests:**
  - `parseAdminRequest({ action: 'set-password', playerId: 'p-1', password: ' nieuw1 ' })` → password `'nieuw1'`
  - `'kort'` → `{ error: 'weak_password' }`
  - unknown action, a missing `playerId`, or a non-object body → `invalid_request`
  - `{ action: 'remove', authUserId: '<valid uuid>' }` → that object; `authUserId: 'abc'` → `invalid_request`
  - For `['  ab"c;d  ', 'x/y\\z']`, both folders' `normalizePassword` give equal results, and `hiddenEmail('p-9')` is the same in both
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement `rules.ts`, then `index.ts`.**
  1. Read the caller with `auth.getUser(jwt)`. Their `players` row must be active with `is_admin`, otherwise `forbidden`.
  2. `set-password`: the target must be an active VAST player, otherwise `not_found`. If they have an `auth_user_id`, call `auth.admin.updateUserById`. If not, `createUser` with `hiddenEmail`, then set `auth_user_id` and `password_hash = null` (same rollback rule as Task 3).
  3. `remove {authUserId}`: the app calls this after deleting the player row. Refuse with `forbidden` if any `players` row still has that `auth_user_id`, so only orphaned logins can be removed and an admin can't delete a current player's login this way. Otherwise call `auth.admin.deleteUser`. If that user is already gone, still return `ok`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Ask the user** to create the `admin-account` function in the dashboard (Verify JWT on) and paste both files.
- [ ] **Step 6:** Commit `feat(functions): admin-account for password resets and login removal`.

---

### Task 5: App sign-in flow and session

**Files:**
- Modify: `controller/supabase.js` (auth options: `storage: AsyncStorage`, `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`)
- Create: `controller/authFlow.js`, `controller/columns.js`
- Modify: `view/pages/Page0_Login.js`, `view/Landingpage.js`, `controller/Controller.js`, `controller/storage.js`
- Test: `tests/authFlow.test.js`

**Interfaces:**
- Consumes: `normalizePassword`, `MIN_PASSWORD_LENGTH` from `controller/passwordRules.js`. The `login_email` RPC and the `migrate-login` function.
- Produces:
  - `signInWithName(client, { name: string, password: string, newPassword?: string }): Promise<{ status: 'ok' | 'invalid' | 'locked' | 'needs_new_password' | 'weak_new_password' | 'error' }>`. `client` is injected (a real supabase client, or a fake in tests).
  - `storage.js`: `PLAYER_COLUMNS` (exported string, no `password_hash`), `clearLocalCache(): Promise<void>`, and `formatPlayerFromDb` adds `authUserId`.
  - `useAppController(initialRoute, session)`: loads data and subscribes to realtime only while `session` is set; clears state when it becomes null.

- [ ] **Step 1: Write failing tests** with a fake client recording calls:
  - The name doesn't resolve (rpc returns null) → `invalid`, no function call
  - Migrated → calls `auth.signInWithPassword({ email, password: normalizePassword(pw) })`; on success → `ok`; on auth error → `invalid`
  - Not migrated → invokes `migrate-login` with the normalized password; `{status:'ok'}` → then signs in with `newPassword ?? password` → `ok`
  - `migrate-login` returns `needs_new_password` / `locked` / `weak_new_password` → passed through unchanged
  - `newPassword` shorter than 6 → `weak_new_password` locally, no network calls
  - The rpc or function throws → `error`
  - `PLAYER_COLUMNS` (from `controller/columns.js`; `storage.js` re-exports it, but can't be loaded in Node because of AsyncStorage) doesn't contain `password_hash` and does contain `auth_user_id`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement `authFlow.js` and `columns.js`.**
- [ ] **Step 4: Wire the app.**
  - `Landingpage`: hold `session` from `supabase.auth.getSession()` + `onAuthStateChange`. The current player is `players.find(p => p.authUserId === session.user.id)`. Logout = `supabase.auth.signOut()` + `clearLocalCache()`. Keep the existing auto-logout when the player is missing or inactive (now via `signOut`). Remove `getSavedUser`/`saveAuthUser` from `storage.js`.
  - `Page0_Login`: takes no `players` prop. Calls `signInWithName(supabase, …)`. On `needs_new_password`, show two extra fields ("Kies een nieuw wachtwoord", "Herhaal nieuw wachtwoord", which must match) with the text `Kies een nieuw wachtwoord van minimaal 6 tekens.`, then resubmit with `newPassword`. `locked` → `Te veel pogingen. Probeer het over 15 minuten opnieuw.` `weak_new_password` → `Kies een wachtwoord van minimaal 6 tekens.` `error` → `Er is een fout opgetreden bij het inloggen.` `invalid` → `Ongeldige inloggegevens.`
  - `storage.js`: select `PLAYER_COLUMNS`. Remove `INITIAL_PLAYERS`, `DEFAULT_HASH` and the seeding. `formatPlayerForDb` no longer has `password_hash`.
  - **Stop using `upsert`.** Postgres checks the INSERT policy on `insert … on conflict do update` even when it updates, and inserts are admin-only. So ordinary players' score and profile saves would be rejected. Instead:
    - `savePlayers(all, changed)` / `saveMatches(all, changed)` call `.update(row).eq('id', row.id)` per changed record, without `id`/`created_at` in `row`.
    - New records go through the new `insertPlayer(player): Promise<{ error }>` and `insertMatch(match): Promise<{ error }>`, which `addPlayer`/`createMatch` use.
    - All save/delete functions return `{ error }` instead of swallowing it.
  - `Controller`: shows `Opslaan mislukt. Controleer je verbinding of rechten.` via `Alert.alert` (`window.alert` on web) when a save returns an error, and reloads from the server so the screen matches the database.
- [ ] **Step 5:** `npm test` → PASS. Then run `npx expo export --platform android --output-dir <scratch>`. Expected: the bundle exports with no errors.
- [ ] **Step 6:** Commit `feat(app): sign in through Supabase Auth with first-login move-over`.

---

### Task 6: Player passwords in the app

**Files:**
- Modify: `controller/Controller.js`, `view/pages/Page3_Spelers.js`, `controller/security.js`

**Interfaces:**
- Consumes: the `admin-account` endpoint, `MIN_PASSWORD_LENGTH`, `normalizePassword`.
- Produces (controller):
  - `changeOwnPassword(password: string): Promise<{ error?: string }>` (via `supabase.auth.updateUser`)
  - `setPlayerPassword(playerId: string, password: string): Promise<{ status: string }>`
  - `addPlayer(name, type): Promise<string>` resolves to the new player id after the upsert succeeds, and throws on error
  - `deletePlayer` captures `authUserId` before deleting and then invokes `admin-account` `remove`

- [ ] **Step 1: Own profile.** The password field calls `changeOwnPassword(normalizePassword(v))`. Minimum 6, message `Het nieuwe wachtwoord moet minimaal 6 tekens bevatten.` Remove the `passwordHash` payload.
- [ ] **Step 2: Admin, edit modal.** For a VAST player who isn't the admin themselves, add a "Wachtwoord instellen" section (field + button) calling `setPlayerPassword`. On `ok` show `Wachtwoord ingesteld.`; otherwise show a message for that status.
- [ ] **Step 3: Admin, adding a player.** When the type is VAST, the add modal requires a `Startwachtwoord` (minimum 6). After `addPlayer` resolves, call `setPlayerPassword`. If that fails, keep the player and show `Speler toegevoegd, maar wachtwoord instellen mislukt. Stel het opnieuw in via Aanpassen.`
- [ ] **Step 4: Clean up.** Remove `hashPassword` and `DEFAULT_PASSWORD_HASH` from `security.js` and every import of them. Grep for `password_hash|passwordHash|hashPassword|expo-crypto` → no matches in `controller/` or `view/`.
- [ ] **Step 5:** `npm test` and the Android export, both passing.
- [ ] **Step 6:** Commit `feat(app): own password change and admin password management`.

---

### Task 7: Rollout runbook and the drop-hash migration

**Files:**
- Create: `supabase/migrations/20261124000002_drop_password_hash.sql`
- Create: `docs/rollout-auth.md`

- [ ] **Step 1: Drop-hash migration.** One transaction. First `raise exception` listing every active VAST player with `auth_user_id is null`. Only then `alter table players drop column password_hash`.
- [ ] **Step 2: Runbook (Dutch or English, short, numbered).**
  1. Back up the database.
  2. Turn off public sign-ups.
  3. Run migration 1, then the test SQL.
  4. Deploy both functions (Verify JWT off for `migrate-login`, on for `admin-account`).
  5. Admin logs in on the new build first (this is the move-over test).
  6. Release the build and tell the team to update.
  7. After everyone has logged in once (or the admin has set passwords for the rest), run migration 2.
  8. Rollback: run `…_rollback.sql` and redeploy the old build.

  Also say that the original setup script must never be run again.
- [ ] **Step 3: Final check.** `npm test`, the Android export, and a grep showing `service_role` appears nowhere outside `supabase/functions/`.
- [ ] **Step 4:** Commit `docs: auth rollout runbook and password_hash removal`.

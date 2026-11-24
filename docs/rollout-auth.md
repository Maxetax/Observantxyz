# Rolling out the new login (Supabase Auth)

This switches the app from "check the password on the phone" to Supabase's own
login system, and locks the database so only logged-in team members can read
or change anything. Do the steps in order. Each one says what you should see.

> **Never run the old setup script again** (the one that inserts Lars van Dijk,
> Daan Meijer and the rest with `ON CONFLICT ... DO UPDATE`). It resets those
> players' phone, address, notes and admin status, and it re-creates the
> open "Public access" rules.

Files used below (all in this repo):

| File | What it is |
|---|---|
| `supabase/migrations/20261124000001_auth_rls.sql` | Step 3: the database change |
| `supabase/tests/auth_rls_test.sql` | Step 4: checks the access rules (changes nothing) |
| `supabase/functions/migrate-login/` (`index.ts`, `handler.ts`, `rules.ts`) | Step 5: first-login function |
| `supabase/functions/admin-account/` (`index.ts`, `handler.ts`, `rules.ts`) | Step 5: admin password function |
| `supabase/migrations/20261124000001_auth_rls_rollback.sql` | Emergency undo |
| `supabase/migrations/20261124000002_drop_password_hash.sql` | Step 9: final clean-up |

## Before you start

- Have the **new app build** ready to hand out (step 7). Once step 3 runs,
  old builds can no longer load or save anything.
- Pick a quiet moment, with no match being scored.

## 1. Back up the database

Dashboard → **Database → Backups**. Make sure there is a recent backup (or
download one). On the free plan, also export both tables: **Table Editor →
players → Export → CSV**, and the same for **matches**.

## 2. Turn off public sign-ups

Dashboard → **Authentication → Sign In / Providers** → turn **off** "Allow new
users to sign up". Accounts are only created by the app's server functions.

## 3. Run the database change

Dashboard → **SQL Editor** → New query → paste all of
`20261124000001_auth_rls.sql` → **Run**.

- **Expected:** success, with a notice like
  `Auth migration OK: 1 active admin(s), 8 active VAST player(s) will move over on first login.`
- **"Duplicate player names, rename these first: …"**: two players share a name.
  Rename one in the Table Editor, then run again. Nothing was changed.
- **"No active admin player…"**: set `is_admin = true` on yourself in the
  Table Editor, then run again. Nothing was changed.

## 4. Check the access rules

SQL Editor → new query → paste all of `supabase/tests/auth_rls_test.sql` → **Run**.

- **Expected:** one result row: `ALL AUTH RLS TESTS PASSED`.
- It uses temporary test players inside a transaction that is always undone,
  so nothing is kept.
- Any `FAIL: …` error means a rule isn't working: stop here and run the
  rollback (below).

## 5. Deploy the two server functions

Dashboard → **Edge Functions → Deploy a new function → Via Editor**.

**migrate-login**
1. Name it exactly `migrate-login`.
2. Create three files with the same names and paste in the contents:
   `index.ts`, `handler.ts`, `rules.ts` from `supabase/functions/migrate-login/`.
3. Deploy. Then open the function's **Details/Settings** and turn **off
   "Enforce JWT verification"** (people calling it aren't logged in yet).

**admin-account**
1. Name it exactly `admin-account`.
2. Paste `index.ts`, `handler.ts`, `rules.ts` from `supabase/functions/admin-account/`.
3. Deploy, leaving **"Enforce JWT verification" on**.

Quick check of migrate-login from PowerShell (a made-up name changes nothing):

```powershell
Invoke-RestMethod -Method Post -Uri https://zhatqwobnsgmuocxsjmb.supabase.co/functions/v1/migrate-login -Headers @{apikey='sb_publishable_P7YOPKK4Ri2I4yoiXOuf3w_pzz9IaZH'} -ContentType 'application/json' -Body '{"name":"Niemand Bestaat","password":"x"}'
```

**Expected:** `status` = `invalid`.

## 6. Log in yourself first (admin)

Install the new build on your own phone and log in with your name and current
password.

- If your password is still `123` or shorter than 6 characters, the app asks
  you to choose a new one. Do that.
- **Expected:** you get into the dashboard, and in Supabase **Authentication →
  Users** a user `p-…@apollo.invalid` appears.
- Also check: open a match and change a score, edit your own phone number, and
  in **Spelers** use **Aanpassen → Wachtwoord instellen** on a test or
  teammate account.
- If login fails with "Er is een fout opgetreden", look at **Edge Functions →
  migrate-login → Logs**. If it says the email address is invalid, tell
  Claude: the hidden email domain needs to change.

## 7. Release the build to the team

Tell everyone:
- update the app, then log in with their **name and current password**;
- anyone still on the default password (`123`) has to choose a new one of at
  least 6 characters;
- forgot it? Ask an admin to set a new one (Spelers → Aanpassen →
  Wachtwoord instellen).

## 8. Follow up

In the SQL Editor, this shows who hasn't logged in yet:

```sql
select name from public.players where type = 'VAST' and active and auth_user_id is null order by name;
```

For anyone who can't or won't log in, an admin sets a password for them.

## 9. Remove the old password hashes

When step 8's query returns no rows: SQL Editor → paste
`20261124000002_drop_password_hash.sql` → Run.

- **Expected:** success. If it lists names, those players haven't moved over
  yet. Nothing is changed in that case.
- **This can't be undone**, which is intended.
- Players who are *inactive* at this point can't use their old password later.
  If you reactivate one, set a password for them.

## Emergency undo

If something is badly wrong after step 3: SQL Editor → run
`20261124000001_auth_rls_rollback.sql`. That restores the old open access, so
old app builds work again. **It also re-opens the security hole**, so treat it
as a stopgap only. No data is lost either way.

// Runs the Supabase migrations and SQL tests in PGlite (real Postgres in WASM)
// against tests/sql/supabase_stub.sql, a stand-in for the live project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const STUB = read('tests/sql/supabase_stub.sql');
const MIGRATION = read('supabase/migrations/20261124000001_auth_rls.sql');
const ROLLBACK = read('supabase/migrations/20261124000001_auth_rls_rollback.sql');
const RLS_TESTS = read('supabase/tests/auth_rls_test.sql');

async function freshDb(extraSetup = '') {
  const db = new PGlite();
  await db.exec(STUB);
  if (extraSetup) await db.exec(extraSetup);
  return db;
}

const lastResult = (results) => results[results.length - 1]?.rows?.[0]?.result;

test('migration applies and all access-rule tests pass', async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  const results = await db.exec(RLS_TESTS);
  assert.equal(lastResult(results), 'ALL AUTH RLS TESTS PASSED');
});

test('migration keeps existing player and match rows unchanged', async () => {
  const db = await freshDb();
  const before = await db.query('select id, name, type, active, is_admin, password_hash from players order by id');
  const matchesBefore = await db.query('select * from matches order by id');
  await db.exec(MIGRATION);
  const after = await db.query('select id, name, type, active, is_admin, password_hash from players order by id');
  const matchesAfter = await db.query('select * from matches order by id');
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(matchesAfter.rows, matchesBefore.rows);
});

test('migration refuses duplicate names and lists them', async () => {
  const db = await freshDb("insert into players (id, name, type) values ('p-9', ' lars VAN dijk ', 'WISSEL');");
  await assert.rejects(db.exec(MIGRATION), /lars van dijk/i);
  await db.exec('rollback'); // the SQL Editor does this automatically on error
  // Nothing was applied: the open policy is still there.
  const r = await db.query("select count(*)::int as n from pg_policies where policyname = 'Public access to players'");
  assert.equal(r.rows[0].n, 1);
});

test('migration refuses when there is no active admin', async () => {
  const db = await freshDb("update players set is_admin = false;");
  await assert.rejects(db.exec(MIGRATION), /admin/i);
});

test('rollback restores open access', async () => {
  const db = await freshDb();
  await db.exec(MIGRATION);
  await db.exec(ROLLBACK);
  await db.exec("set role anon");
  const r = await db.query('select count(*)::int as n from players');
  assert.equal(r.rows[0].n, 3);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signInWithName } from '../controller/authFlow.js';
import { PLAYER_COLUMNS } from '../controller/columns.js';

// Fake Supabase client recording calls.
function fakeClient({ lookup = null, rpcError = null, migrate = { status: 'ok' }, migrateError = null, signInError = null, throws = false } = {}) {
  const calls = { rpc: [], invoke: [], signIn: [] };
  const client = {
    rpc: async (fn, args) => {
      calls.rpc.push([fn, args]);
      if (throws) throw new Error('network');
      return { data: lookup ? [lookup] : [], error: rpcError };
    },
    functions: {
      invoke: async (fn, opts) => {
        calls.invoke.push([fn, opts.body]);
        return migrateError ? { data: null, error: migrateError } : { data: migrate, error: null };
      },
    },
    auth: {
      signInWithPassword: async (creds) => {
        calls.signIn.push(creds);
        return signInError ? { data: {}, error: signInError } : { data: { session: {} }, error: null };
      },
    },
  };
  return { client, calls };
}

const MIGRATED = { email: 'p-1@apollo.invalid', migrated: true };
const NOT_MIGRATED = { email: 'p-2@apollo.invalid', migrated: false };

test('unknown name is invalid and makes no further calls', async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await signInWithName(client, { name: 'Niemand', password: 'x' }), { status: 'invalid' });
  assert.deepEqual(calls.rpc, [['login_email', { p_name: 'Niemand' }]]);
  assert.equal(calls.invoke.length + calls.signIn.length, 0);
});

test('migrated player signs in with the normalized password', async () => {
  const { client, calls } = fakeClient({ lookup: MIGRATED });
  assert.deepEqual(await signInWithName(client, { name: 'Lars', password: ' gehe"im1 ' }), { status: 'ok' });
  assert.deepEqual(calls.signIn, [{ email: 'p-1@apollo.invalid', password: 'geheim1' }]);
  assert.equal(calls.invoke.length, 0);
});

test('migrated player with wrong password is invalid', async () => {
  const { client } = fakeClient({ lookup: MIGRATED, signInError: { message: 'Invalid login credentials' } });
  assert.deepEqual(await signInWithName(client, { name: 'Lars', password: 'fout' }), { status: 'invalid' });
});

test('first login moves the player over, then signs in', async () => {
  const { client, calls } = fakeClient({ lookup: NOT_MIGRATED });
  assert.deepEqual(await signInWithName(client, { name: 'Daan', password: 'geheim1' }), { status: 'ok' });
  assert.deepEqual(calls.invoke, [['migrate-login', { name: 'Daan', password: 'geheim1' }]]);
  assert.deepEqual(calls.signIn, [{ email: 'p-2@apollo.invalid', password: 'geheim1' }]);
});

test('first login with a new password signs in with the new password', async () => {
  const { client, calls } = fakeClient({ lookup: NOT_MIGRATED });
  const r = await signInWithName(client, { name: 'Daan', password: '123', newPassword: ' nieuw123 ' });
  assert.deepEqual(r, { status: 'ok' });
  assert.deepEqual(calls.invoke, [['migrate-login', { name: 'Daan', password: '123', newPassword: 'nieuw123' }]]);
  assert.deepEqual(calls.signIn, [{ email: 'p-2@apollo.invalid', password: 'nieuw123' }]);
});

for (const status of ['needs_new_password', 'locked', 'weak_new_password', 'invalid']) {
  test(`migrate-login "${status}" is passed through without signing in`, async () => {
    const { client, calls } = fakeClient({ lookup: NOT_MIGRATED, migrate: { status } });
    assert.deepEqual(await signInWithName(client, { name: 'Daan', password: '123' }), { status });
    assert.equal(calls.signIn.length, 0);
  });
}

test('too-short new password is refused locally with no network calls', async () => {
  const { client, calls } = fakeClient({ lookup: NOT_MIGRATED });
  assert.deepEqual(await signInWithName(client, { name: 'Daan', password: '123', newPassword: 'kort' }), { status: 'weak_new_password' });
  assert.equal(calls.rpc.length + calls.invoke.length + calls.signIn.length, 0);
});

test('network failures are reported as error', async () => {
  assert.deepEqual(await signInWithName(fakeClient({ throws: true }).client, { name: 'X', password: 'y' }), { status: 'error' });
  assert.deepEqual(await signInWithName(fakeClient({ rpcError: { message: 'x' } }).client, { name: 'X', password: 'y' }), { status: 'error' });
  assert.deepEqual(
    await signInWithName(fakeClient({ lookup: NOT_MIGRATED, migrateError: { message: '500' } }).client, { name: 'X', password: 'y' }),
    { status: 'error' },
  );
});

test('player columns never include the password hash', () => {
  const cols = PLAYER_COLUMNS.split(',').map((c) => c.trim());
  assert.ok(!cols.includes('password_hash'));
  assert.ok(cols.includes('auth_user_id'));
  assert.deepEqual(
    [...cols].sort(),
    ['active', 'address', 'auth_user_id', 'created_at', 'id', 'is_admin', 'name', 'notes', 'phone', 'type'],
  );
});

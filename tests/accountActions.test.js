import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeOwnPassword, setPlayerPassword, removeLogin } from '../controller/accountActions.js';

function fakeClient({ fnResult = { status: 'ok' }, fnError = null, updateError = null } = {}) {
  const calls = { invoke: [], updateUser: [] };
  return {
    calls,
    functions: {
      invoke: async (name, opts) => {
        calls.invoke.push([name, opts.body]);
        return fnError ? { data: null, error: fnError } : { data: fnResult, error: null };
      },
    },
    auth: {
      updateUser: async (attrs) => {
        calls.updateUser.push(attrs);
        return { data: {}, error: updateError };
      },
    },
  };
}

test('changeOwnPassword normalizes and updates the Supabase login', async () => {
  const c = fakeClient();
  assert.deepEqual(await changeOwnPassword(c, ' nieuw"123 '), { status: 'ok' });
  assert.deepEqual(c.calls.updateUser, [{ password: 'nieuw123' }]);
});

test('changeOwnPassword refuses short passwords without a network call', async () => {
  const c = fakeClient();
  assert.deepEqual(await changeOwnPassword(c, 'kort'), { status: 'weak_password' });
  assert.equal(c.calls.updateUser.length, 0);
});

test('changeOwnPassword reports a failed update', async () => {
  assert.deepEqual(await changeOwnPassword(fakeClient({ updateError: { message: 'x' } }), 'nieuw123'), { status: 'error' });
});

test('setPlayerPassword calls admin-account with the normalized password', async () => {
  const c = fakeClient();
  assert.deepEqual(await setPlayerPassword(c, 'p-3', ' start1 '), { status: 'ok' });
  assert.deepEqual(c.calls.invoke, [['admin-account', { action: 'set-password', playerId: 'p-3', password: 'start1' }]]);
});

test('setPlayerPassword refuses short passwords locally', async () => {
  const c = fakeClient();
  assert.deepEqual(await setPlayerPassword(c, 'p-3', 'kort'), { status: 'weak_password' });
  assert.equal(c.calls.invoke.length, 0);
});

test('setPlayerPassword passes the server status through', async () => {
  assert.deepEqual(await setPlayerPassword(fakeClient({ fnResult: { status: 'forbidden' } }), 'p-3', 'start12'), { status: 'forbidden' });
  assert.deepEqual(await setPlayerPassword(fakeClient({ fnError: { message: '500' } }), 'p-3', 'start12'), { status: 'error' });
});

test('removeLogin only calls the server when the player had a login', async () => {
  const c = fakeClient();
  assert.deepEqual(await removeLogin(c, null), { status: 'ok' });
  assert.equal(c.calls.invoke.length, 0);
  await removeLogin(c, 'auth-uuid');
  assert.deepEqual(c.calls.invoke, [['admin-account', { action: 'remove', authUserId: 'auth-uuid' }]]);
});

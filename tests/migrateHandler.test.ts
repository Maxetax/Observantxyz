import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMigrateLogin, type MigrateDeps, type PlayerRow } from '../supabase/functions/migrate-login/handler.ts';
import { LEGACY_DEFAULT_HASH, sha256Hex } from '../supabase/functions/migrate-login/rules.ts';

const now = new Date('2026-11-24T12:00:00.000Z');

function fakeDeps(
  player: PlayerRow | null,
  opts: { createError?: boolean; linkOk?: boolean; strayId?: string | null; strayLinked?: boolean } = {},
) {
  const calls: Record<string, unknown[]> = { saveCounters: [], createAuthUser: [], linkPlayer: [], deleteAuthUser: [], findPlayer: [], updatePassword: [] };
  const deps: MigrateDeps = {
    findAuthUserByEmail: async () => opts.strayId ?? null,
    isAuthUserLinked: async () => opts.strayLinked ?? false,
    updatePassword: async (...a) => { calls.updatePassword.push(a); return true; },
    now: () => now,
    findPlayer: async (name) => { calls.findPlayer.push(name); return player; },
    saveCounters: async (...a) => { calls.saveCounters.push(a); },
    createAuthUser: async (email, password) => {
      calls.createAuthUser.push([email, password]);
      return opts.createError ? { error: 'boom' } : { id: 'uuid-1' };
    },
    linkPlayer: async (...a) => { calls.linkPlayer.push(a); return opts.linkOk ?? true; },
    deleteAuthUser: async (id) => { calls.deleteAuthUser.push(id); },
  };
  return { deps, calls };
}

const lars = async (pw = 'geheim1'): Promise<PlayerRow> => ({
  id: 'p-1', password_hash: await sha256Hex(pw), failed_login_attempts: 0, locked_until: null,
});

test('malformed body is invalid, not a server error', async () => {
  const { deps } = fakeDeps(null);
  assert.deepEqual(await handleMigrateLogin(null, deps), { httpStatus: 200, body: { status: 'invalid' } });
  assert.deepEqual(await handleMigrateLogin({ name: 5 }, deps), { httpStatus: 200, body: { status: 'invalid' } });
});

test('unknown name is invalid and saves nothing', async () => {
  const { deps, calls } = fakeDeps(null);
  const r = await handleMigrateLogin({ name: 'Niemand', password: 'x' }, deps);
  assert.deepEqual(r.body, { status: 'invalid' });
  assert.equal(calls.saveCounters.length, 0);
});

test('wrong password saves the failed attempt', async () => {
  const { deps, calls } = fakeDeps(await lars());
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'fout' }, deps);
  assert.deepEqual(r.body, { status: 'invalid' });
  assert.deepEqual(calls.saveCounters, [['p-1', 1, null]]);
});

test('correct password creates the login and links the player', async () => {
  const { deps, calls } = fakeDeps(await lars());
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'geheim1' }, deps);
  assert.deepEqual(r, { httpStatus: 200, body: { status: 'ok' } });
  assert.deepEqual(calls.createAuthUser, [['p-1@apollo.invalid', 'geheim1']]);
  assert.deepEqual(calls.linkPlayer, [['p-1', 'uuid-1']]);
  assert.equal(calls.deleteAuthUser.length, 0);
});

test('default password asks for a new one and creates nothing', async () => {
  const { deps, calls } = fakeDeps({ id: 'p-2', password_hash: LEGACY_DEFAULT_HASH, failed_login_attempts: 0, locked_until: null });
  const r = await handleMigrateLogin({ name: 'Daan', password: '123' }, deps);
  assert.deepEqual(r.body, { status: 'needs_new_password' });
  assert.equal(calls.createAuthUser.length, 0);
  assert.equal(calls.saveCounters.length, 0);
});

test('failed link removes the just-created login and reports an error', async () => {
  const { deps, calls } = fakeDeps(await lars(), { linkOk: false });
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'geheim1' }, deps);
  assert.deepEqual(r, { httpStatus: 500, body: { status: 'error' } });
  assert.deepEqual(calls.deleteAuthUser, ['uuid-1']);
});

test('failed account creation reports an error', async () => {
  const { deps, calls } = fakeDeps(await lars(), { createError: true });
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'geheim1' }, deps);
  assert.deepEqual(r, { httpStatus: 500, body: { status: 'error' } });
  assert.equal(calls.linkPlayer.length, 0);
});

test('a stray unlinked login from an earlier failed attempt is reused', async () => {
  const { deps, calls } = fakeDeps(await lars(), { createError: true, strayId: 'stray-uuid' });
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'geheim1' }, deps);
  assert.deepEqual(r, { httpStatus: 200, body: { status: 'ok' } });
  assert.deepEqual(calls.updatePassword, [['stray-uuid', 'geheim1']]);
  assert.deepEqual(calls.linkPlayer, [['p-1', 'stray-uuid']]);
  assert.equal(calls.deleteAuthUser.length, 0);
});

test('an existing login linked to another player is never taken over', async () => {
  const { deps, calls } = fakeDeps(await lars(), { createError: true, strayId: 'other-uuid', strayLinked: true });
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'geheim1' }, deps);
  assert.deepEqual(r, { httpStatus: 500, body: { status: 'error' } });
  assert.equal(calls.updatePassword.length + calls.linkPlayer.length, 0);
});

test('reused stray login that then fails to link is left for a retry, not deleted', async () => {
  const { deps, calls } = fakeDeps(await lars(), { createError: true, strayId: 'stray-uuid', linkOk: false });
  const r = await handleMigrateLogin({ name: 'Lars van Dijk', password: 'geheim1' }, deps);
  assert.deepEqual(r, { httpStatus: 500, body: { status: 'error' } });
  assert.equal(calls.deleteAuthUser.length, 0);
});

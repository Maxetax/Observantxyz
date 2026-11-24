import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as admin from '../supabase/functions/admin-account/rules.ts';
import * as migrate from '../supabase/functions/migrate-login/rules.ts';
import { handleAdminAccount, type AdminDeps } from '../supabase/functions/admin-account/handler.ts';

const UUID = '11111111-2222-4333-8444-555555555555';

// ---------- parseAdminRequest ----------

test('set-password request is parsed and the password normalized', () => {
  assert.deepEqual(
    admin.parseAdminRequest({ action: 'set-password', playerId: 'p-1', password: ' nieuw1 ' }),
    { action: 'set-password', playerId: 'p-1', password: 'nieuw1' },
  );
});

test('short password is weak_password', () => {
  assert.deepEqual(admin.parseAdminRequest({ action: 'set-password', playerId: 'p-1', password: 'kort' }), { error: 'weak_password' });
});

test('malformed requests are invalid_request', () => {
  for (const body of [null, 'x', {}, { action: 'nope', playerId: 'p-1' }, { action: 'set-password', password: 'nieuw123' }, { action: 'remove' }, { action: 'remove', authUserId: 'abc' }]) {
    assert.deepEqual(admin.parseAdminRequest(body), { error: 'invalid_request' }, JSON.stringify(body));
  }
});

test('remove request with a uuid is parsed', () => {
  assert.deepEqual(admin.parseAdminRequest({ action: 'remove', authUserId: UUID }), { action: 'remove', authUserId: UUID });
});

test('both rule copies agree', () => {
  for (const s of ['  ab"c;d  ', 'x/y\\z', '', 'plain']) {
    assert.equal(admin.normalizePassword(s), migrate.normalizePassword(s));
  }
  assert.equal(admin.hiddenEmail('p-9'), migrate.hiddenEmail('p-9'));
  assert.equal(admin.MIN_PASSWORD_LENGTH, migrate.MIN_PASSWORD_LENGTH);
});

// ---------- handler ----------

type Player = { id: string; type: string; active: boolean; is_admin: boolean; auth_user_id: string | null };

function fake(players: Player[], opts: { linkOk?: boolean; linkedIds?: string[] } = {}) {
  const calls: Record<string, unknown[]> = { updatePassword: [], createAuthUser: [], linkPlayer: [], deleteAuthUser: [] };
  const deps: AdminDeps = {
    getPlayerByAuthId: async (id) => players.find((p) => p.auth_user_id === id) ?? null,
    getPlayer: async (id) => players.find((p) => p.id === id) ?? null,
    isAuthUserLinked: async (id) => (opts.linkedIds ?? players.map((p) => p.auth_user_id)).includes(id),
    updatePassword: async (...a) => { calls.updatePassword.push(a); return true; },
    createAuthUser: async (...a) => { calls.createAuthUser.push(a); return { id: 'new-uuid' }; },
    linkPlayer: async (...a) => { calls.linkPlayer.push(a); return opts.linkOk ?? true; },
    deleteAuthUser: async (id) => { calls.deleteAuthUser.push(id); },
  };
  return { deps, calls };
}

const team = (): Player[] => [
  { id: 'p-1', type: 'VAST', active: true, is_admin: true, auth_user_id: 'admin-uuid' },
  { id: 'p-2', type: 'VAST', active: true, is_admin: false, auth_user_id: 'player-uuid' },
  { id: 'p-3', type: 'VAST', active: true, is_admin: false, auth_user_id: null },
  { id: 'p-5', type: 'WISSEL', active: true, is_admin: false, auth_user_id: null },
  { id: 'p-6', type: 'VAST', active: true, is_admin: true, auth_user_id: 'ex-admin' },
];

const setPw = (playerId: string) => ({ action: 'set-password', playerId, password: 'nieuw123' });

test('caller not logged in is forbidden', async () => {
  const { deps } = fake(team());
  assert.deepEqual(await handleAdminAccount(setPw('p-2'), null, deps), { httpStatus: 200, body: { status: 'forbidden' } });
});

test('non-admin caller is forbidden', async () => {
  const { deps, calls } = fake(team());
  const r = await handleAdminAccount(setPw('p-3'), 'player-uuid', deps);
  assert.deepEqual(r.body, { status: 'forbidden' });
  assert.equal(calls.updatePassword.length + calls.createAuthUser.length, 0);
});

test('inactive admin is forbidden', async () => {
  const players = team();
  players[4].active = false;
  const { deps } = fake(players);
  assert.deepEqual((await handleAdminAccount(setPw('p-2'), 'ex-admin', deps)).body, { status: 'forbidden' });
});

test('weak password is rejected before anything else', async () => {
  const { deps } = fake(team());
  const r = await handleAdminAccount({ action: 'set-password', playerId: 'p-2', password: 'kort' }, 'admin-uuid', deps);
  assert.deepEqual(r.body, { status: 'weak_password' });
});

test('unknown, substitute or inactive target is not_found', async () => {
  const players = team();
  players.push({ id: 'p-7', type: 'VAST', active: false, is_admin: false, auth_user_id: null });
  const { deps } = fake(players);
  for (const id of ['p-404', 'p-5', 'p-7']) {
    assert.deepEqual((await handleAdminAccount(setPw(id), 'admin-uuid', deps)).body, { status: 'not_found' }, id);
  }
});

test('target with a login gets the password updated', async () => {
  const { deps, calls } = fake(team());
  const r = await handleAdminAccount(setPw('p-2'), 'admin-uuid', deps);
  assert.deepEqual(r.body, { status: 'ok' });
  assert.deepEqual(calls.updatePassword, [['player-uuid', 'nieuw123']]);
});

test('target without a login gets one created and linked', async () => {
  const { deps, calls } = fake(team());
  const r = await handleAdminAccount(setPw('p-3'), 'admin-uuid', deps);
  assert.deepEqual(r.body, { status: 'ok' });
  assert.deepEqual(calls.createAuthUser, [['p-3@apollo.invalid', 'nieuw123']]);
  assert.deepEqual(calls.linkPlayer, [['p-3', 'new-uuid']]);
});

test('failed link removes the new login and errors', async () => {
  const { deps, calls } = fake(team(), { linkOk: false });
  const r = await handleAdminAccount(setPw('p-3'), 'admin-uuid', deps);
  assert.deepEqual(r, { httpStatus: 500, body: { status: 'error' } });
  assert.deepEqual(calls.deleteAuthUser, ['new-uuid']);
});

test('remove refuses a login still linked to a player', async () => {
  const { deps, calls } = fake(team());
  const r = await handleAdminAccount({ action: 'remove', authUserId: UUID }, 'admin-uuid', { ...deps, isAuthUserLinked: async () => true });
  assert.deepEqual(r.body, { status: 'forbidden' });
  assert.equal(calls.deleteAuthUser.length, 0);
});

test('remove deletes an orphaned login', async () => {
  const { deps, calls } = fake(team());
  const r = await handleAdminAccount({ action: 'remove', authUserId: UUID }, 'admin-uuid', deps);
  assert.deepEqual(r.body, { status: 'ok' });
  assert.deepEqual(calls.deleteAuthUser, [UUID]);
});

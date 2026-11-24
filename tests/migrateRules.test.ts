import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sha256Hex,
  planMigration,
  onCreateFailure,
  LEGACY_DEFAULT_HASH,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
} from '../supabase/functions/migrate-login/rules.ts';

const now = new Date('2026-11-24T12:00:00.000Z');
const base = { failedAttempts: 0, lockedUntil: null, now };

test('sha256Hex of "123" is the legacy default hash', async () => {
  assert.equal(await sha256Hex('123'), LEGACY_DEFAULT_HASH);
  assert.equal(LEGACY_DEFAULT_HASH, 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3');
  assert.equal(MAX_FAILED_ATTEMPTS, 10);
  assert.equal(LOCK_MINUTES, 15);
});

test('correct non-default password creates the account with that password', async () => {
  const r = await planMigration({ ...base, storedHash: await sha256Hex('geheim1'), password: 'geheim1' });
  assert.deepEqual(r, { action: 'create', authPassword: 'geheim1' });
});

test('legacy normalization: stripped characters and spaces still match', async () => {
  const r = await planMigration({ ...base, storedHash: await sha256Hex('abcdef'), password: ' a"bcdef ' });
  assert.deepEqual(r, { action: 'create', authPassword: 'abcdef' });
});

test('legacy match shorter than 6 after normalization needs a new password', async () => {
  const r = await planMigration({ ...base, storedHash: await sha256Hex('abc'), password: ' a"bc ' });
  assert.equal(r.action, 'reject');
  assert.equal(r.status, 'needs_new_password');
});

test('default "123" without newPassword needs a new password', async () => {
  const r = await planMigration({ ...base, storedHash: LEGACY_DEFAULT_HASH, password: '123' });
  assert.equal(r.action, 'reject');
  assert.equal(r.status, 'needs_new_password');
  assert.equal(r.failedAttempts, 0);
});

test('4-character old password without newPassword needs a new password', async () => {
  const r = await planMigration({ ...base, storedHash: await sha256Hex('abcd'), password: 'abcd' });
  assert.equal(r.status, 'needs_new_password');
});

test('weak newPassword is rejected', async () => {
  const r = await planMigration({ ...base, storedHash: LEGACY_DEFAULT_HASH, password: '123', newPassword: 'kort' });
  assert.equal(r.status, 'weak_new_password');
});

test('correct old + good newPassword creates with newPassword', async () => {
  const r = await planMigration({ ...base, storedHash: LEGACY_DEFAULT_HASH, password: '123', newPassword: 'nieuw123' });
  assert.deepEqual(r, { action: 'create', authPassword: 'nieuw123' });
});

test('newPassword is normalized too', async () => {
  const r = await planMigration({ ...base, storedHash: LEGACY_DEFAULT_HASH, password: '123', newPassword: ' nieuw123 ' });
  assert.deepEqual(r, { action: 'create', authPassword: 'nieuw123' });
});

test('wrong password counts a failed attempt', async () => {
  const r = await planMigration({ ...base, failedAttempts: 3, storedHash: LEGACY_DEFAULT_HASH, password: 'fout' });
  assert.deepEqual(r, { action: 'reject', status: 'invalid', failedAttempts: 4, lockedUntil: null });
});

test('10th wrong password locks for 15 minutes and resets the counter', async () => {
  const r = await planMigration({ ...base, failedAttempts: 9, storedHash: LEGACY_DEFAULT_HASH, password: 'fout' });
  assert.deepEqual(r, {
    action: 'reject',
    status: 'invalid',
    failedAttempts: 0,
    lockedUntil: '2026-11-24T12:15:00.000Z',
  });
});

test('locked account is refused even with the correct password', async () => {
  const lockedUntil = '2026-11-24T12:05:00.000Z';
  const r = await planMigration({ ...base, failedAttempts: 2, lockedUntil, storedHash: LEGACY_DEFAULT_HASH, password: '123', newPassword: 'nieuw123' });
  assert.deepEqual(r, { action: 'reject', status: 'locked', failedAttempts: 2, lockedUntil });
});

test('expired lock no longer blocks', async () => {
  const r = await planMigration({ ...base, lockedUntil: '2026-11-24T11:00:00.000Z', storedHash: LEGACY_DEFAULT_HASH, password: '123', newPassword: 'nieuw123' });
  assert.equal(r.action, 'create');
});

test('missing stored hash is invalid', async () => {
  const r = await planMigration({ ...base, storedHash: null, password: '123' });
  assert.equal(r.status, 'invalid');
});

test('onCreateFailure deletes the auth user only when the row update failed', () => {
  assert.equal(onCreateFailure(false), 'delete_auth_user');
  assert.equal(onCreateFailure(true), 'keep');
});

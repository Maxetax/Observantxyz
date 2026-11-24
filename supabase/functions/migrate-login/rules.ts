// Pure rules for moving a player from the legacy SHA-256 hash to Supabase Auth.
// Web APIs only, so it runs in Deno (Edge Function) and in Node (tests).

export const MIN_PASSWORD_LENGTH = 6;
export const HIDDEN_EMAIL_DOMAIN = 'apollo.invalid';
export const LEGACY_DEFAULT_HASH =
  'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
export const MAX_FAILED_ATTEMPTS = 10;
export const LOCK_MINUTES = 15;

export const normalizePassword = (raw: string | undefined | null): string =>
  (raw || '').replace(/[<>"'`;\\/]/g, '').trim();

export const hiddenEmail = (playerId: string): string => `${playerId}@${HIDDEN_EMAIL_DOMAIN}`;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type RejectStatus = 'invalid' | 'locked' | 'needs_new_password' | 'weak_new_password';

export type MigrationPlan =
  | { action: 'create'; authPassword: string }
  | { action: 'reject'; status: RejectStatus; failedAttempts: number; lockedUntil: string | null };

export async function planMigration(input: {
  storedHash: string | null;
  password: string;
  newPassword?: string;
  failedAttempts: number;
  lockedUntil: string | null;
  now: Date;
}): Promise<MigrationPlan> {
  const { storedHash, failedAttempts, lockedUntil, now } = input;
  const reject = (status: RejectStatus, attempts = failedAttempts, until = lockedUntil): MigrationPlan => ({
    action: 'reject',
    status,
    failedAttempts: attempts,
    lockedUntil: until,
  });

  if (lockedUntil && new Date(lockedUntil).getTime() > now.getTime()) {
    return reject('locked');
  }

  const oldPassword = normalizePassword(input.password);
  if (!storedHash || (await sha256Hex(oldPassword)) !== storedHash) {
    const attempts = failedAttempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      return reject('invalid', 0, new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString());
    }
    return reject('invalid', attempts, null);
  }

  if (input.newPassword !== undefined) {
    const next = normalizePassword(input.newPassword);
    if (next.length < MIN_PASSWORD_LENGTH) return reject('weak_new_password');
    return { action: 'create', authPassword: next };
  }

  if (storedHash === LEGACY_DEFAULT_HASH || oldPassword.length < MIN_PASSWORD_LENGTH) {
    return reject('needs_new_password');
  }

  return { action: 'create', authPassword: oldPassword };
}

export const onCreateFailure = (rowUpdateOk: boolean): 'keep' | 'delete_auth_user' =>
  rowUpdateOk ? 'keep' : 'delete_auth_user';

// Columns set when a player is linked to their login. password_hash is kept on
// purpose: if the emergency rollback is ever run, old app builds then still see
// each player's old password (not the old app's "missing = 123" fallback).
// Migration 20261124000002 drops the column once everyone has moved over.
export const linkFields = (authUserId: string) => ({
  auth_user_id: authUserId,
  failed_login_attempts: 0,
  locked_until: null,
});

// Pure rules for admin-account. The password helpers are copied from
// migrate-login/rules.ts because dashboard-deployed functions cannot import
// across folders; tests/adminAccount.test.ts checks both copies agree.

export const MIN_PASSWORD_LENGTH = 6;
export const HIDDEN_EMAIL_DOMAIN = 'apollo.invalid';

export const normalizePassword = (raw: string | undefined | null): string =>
  (raw || '').replace(/[<>"'`;\\/]/g, '').trim();

export const hiddenEmail = (playerId: string): string => `${playerId}@${HIDDEN_EMAIL_DOMAIN}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminRequest =
  | { action: 'set-password'; playerId: string; password: string }
  | { action: 'remove'; authUserId: string }
  | { error: 'invalid_request' | 'weak_password' };

export function parseAdminRequest(body: unknown): AdminRequest {
  if (!body || typeof body !== 'object') return { error: 'invalid_request' };
  const b = body as Record<string, unknown>;

  if (b.action === 'set-password') {
    if (typeof b.playerId !== 'string' || !b.playerId || typeof b.password !== 'string') {
      return { error: 'invalid_request' };
    }
    const password = normalizePassword(b.password);
    if (password.length < MIN_PASSWORD_LENGTH) return { error: 'weak_password' };
    return { action: 'set-password', playerId: b.playerId, password };
  }

  if (b.action === 'remove') {
    if (typeof b.authUserId !== 'string' || !UUID_RE.test(b.authUserId)) return { error: 'invalid_request' };
    return { action: 'remove', authUserId: b.authUserId };
  }

  return { error: 'invalid_request' };
}

// Columns set when a player is linked to their login. password_hash is kept on
// purpose: if the emergency rollback is ever run, old app builds then still see
// each player's old password (not the old app's "missing = 123" fallback).
// Migration 20261124000002 drops the column once everyone has moved over.
export const linkFields = (authUserId: string) => ({
  auth_user_id: authUserId,
  failed_login_attempts: 0,
  locked_until: null,
});

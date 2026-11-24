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

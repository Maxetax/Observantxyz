// controller/passwordRules.js
// Kept identical to supabase/functions/*/rules.ts (tests check they agree).

export const MIN_PASSWORD_LENGTH = 6;
export const HIDDEN_EMAIL_DOMAIN = 'apollo.invalid';

// The old app stripped these characters while typing and trimmed before hashing.
// Applying the same rule everywhere keeps old and new passwords matching.
export const normalizePassword = (raw) => (raw || '').replace(/[<>"'`;\\/]/g, '').trim();

export const hiddenEmail = (playerId) => `${playerId}@${HIDDEN_EMAIL_DOMAIN}`;

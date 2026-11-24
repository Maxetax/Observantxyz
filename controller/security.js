// controller/security.js
import * as Crypto from 'expo-crypto';

export const DEFAULT_PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';

export const hashPassword = async (password) => {
  if (!password) return '';
  const trimmed = password.trim();
  try {
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      trimmed
    );
    return hash;
  } catch (err) {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const msgBuffer = new TextEncoder().encode(trimmed);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Never fall back to a known hash: that would let any password match.
    throw err;
  }
};

// Laat spaties (\s) gewoon toe TIJDENS het typen (geen .trim() hier!)
export const sanitizeName = (text) => {
  if (!text) return '';
  // Verwijdert alleen gevaarlijke tekens zoals <, >, quotes, etc., maar behoudt letters en spaties
  return text.replace(/[^a-zA-Z0-9À-ÿ\s.\-()]/g, '');
};

export const sanitizePasswordInput = (text) => {
  if (!text) return '';
  return text.replace(/[<>"'`;\\/]/g, '');
};

export const sanitizeText = (text) => {
  if (!text) return '';
  return text.replace(/[<>"'`;\\/]/g, '').replace(/--/g, '');
};
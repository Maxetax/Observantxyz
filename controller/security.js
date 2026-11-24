// controller/security.js
// Input clean-up for names and free text. Passwords: see passwordRules.js.

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
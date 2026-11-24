// controller/columns.js
// Exactly the player columns the database grants to logged-in users.
// Never add password_hash: it is not readable from the app.
export const PLAYER_COLUMNS =
  'id, name, type, active, is_admin, phone, address, notes, created_at, auth_user_id';

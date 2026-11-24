import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePassword,
  hiddenEmail,
  MIN_PASSWORD_LENGTH,
  HIDDEN_EMAIL_DOMAIN,
} from '../controller/passwordRules.js';

test('normalizePassword strips the characters the old app removed and trims', () => {
  assert.equal(normalizePassword('  ab"c;d  '), 'abcd');
  assert.equal(normalizePassword("x<y>'z`\\/"), 'xyz');
});

test('normalizePassword tolerates empty input', () => {
  assert.equal(normalizePassword(''), '');
  assert.equal(normalizePassword(undefined), '');
});

test('hiddenEmail builds the email from the player id', () => {
  assert.equal(hiddenEmail('p-1'), 'p-1@apollo.invalid');
  assert.equal(HIDDEN_EMAIL_DOMAIN, 'apollo.invalid');
});

test('minimum password length is 6', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
});

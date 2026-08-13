import crypto from 'crypto';

// Format: TK-XXXX where XXXX is 4 random uppercase alphanumeric chars.
// Short enough to read out over the phone, unique enough not to collide in practice.
export function generateUniqueId() {
  return `TK-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4)}`;
}

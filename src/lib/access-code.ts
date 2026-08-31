import crypto from "crypto";

/**
 * Access codes let admins add people without an email address: the code is
 * the person's sign-in credential until they get a real account. Stored
 * normalized (uppercase, no separators) in User.accessCode; displayed with a
 * dash for readability (e.g. "K7MP-X2WD").
 *
 * Alphabet omits 0/O/1/I/L to avoid transcription mistakes. 8 chars over 31
 * symbols ≈ 2^39 combinations — not guessable over HTTP at this scale, and a
 * code can be regenerated or removed by an admin at any time.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export function generateAccessCode(): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    const byte = crypto.randomBytes(1)[0];
    // Rejection sampling keeps the distribution uniform
    if (byte < ALPHABET.length * Math.floor(256 / ALPHABET.length)) {
      code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

/** Uppercase and strip separators/whitespace so typed codes match stored ones. */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^2-9A-Z]/g, "");
}

/** Human-friendly display form: "K7MPX2WD" → "K7MP-X2WD". */
export function formatAccessCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

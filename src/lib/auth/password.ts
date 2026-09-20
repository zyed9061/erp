import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

const KEY_LEN = 64;
// Paramètres scrypt (N=2^15) : ~50 ms, résistant au GPU.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, PARAMS, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Format : scrypt$<sel base64>$<clé base64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const MIN_PASSWORD_LENGTH = 10;

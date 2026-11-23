import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 32;

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error("Le mot de passe doit contenir au moins 12 caractères.");
  }

  if (password.length > 1024) {
    throw new Error("Le mot de passe est trop long.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt);

  return [
    "scrypt",
    String(SCRYPT_OPTIONS.N),
    String(SCRYPT_OPTIONS.r),
    String(SCRYPT_OPTIONS.p),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (!password || password.length > 1024) return false;

  const parts = storedHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, n, r, p, encodedSalt, encodedKey] = parts;

  if (
    n !== String(SCRYPT_OPTIONS.N) ||
    r !== String(SCRYPT_OPTIONS.r) ||
    p !== String(SCRYPT_OPTIONS.p)
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");

    if (
      salt.length !== SALT_LENGTH ||
      expectedKey.length !== KEY_LENGTH
    ) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);

    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

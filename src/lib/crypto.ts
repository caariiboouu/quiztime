const ITERATIONS = 200_000;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const arr = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type EncryptedBlob = {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
};

export async function encryptString(
  password: string,
  plaintext: string,
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: toBase64(ct),
    iv: toBase64(iv),
    salt: toBase64(salt),
    iterations: ITERATIONS,
  };
}

export async function decryptString(
  password: string,
  blob: EncryptedBlob,
): Promise<string> {
  const salt = fromBase64(blob.salt);
  const iv = fromBase64(blob.iv);
  const key = await deriveKey(password, salt, blob.iterations);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(blob.ciphertext),
  );
  return new TextDecoder().decode(pt);
}

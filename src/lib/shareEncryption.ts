/** Password protection for portable, read-only snapshots. No key is stored or sent. */
import type { ShareOptions, Web } from "../types";
import {
  MAX_IMPORT_BYTES,
  MAX_SHARE_LENGTH,
  parseImport,
  sanitizeSnapshot,
} from "./importExport";

export const MAX_ENCRYPTED_SHARE_LENGTH = MAX_SHARE_LENGTH;
export const MAX_ENCRYPTED_FILE_LENGTH = 32 * 1024 * 1024;
const VERSION = "v1.";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ITERATIONS = 600_000;
const AUTHENTICATED_DATA = new TextEncoder().encode(
  "FriendWeb locked snapshot v1",
);
const genericError = () => new Error("Incorrect password or damaged snapshot.");

function webCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    throw new Error(
      "Password protection requires a secure browser context with Web Crypto support.",
    );
  return globalThis.crypto;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (!password || password.length > 1024)
    throw new Error("Enter a password between 1 and 1024 characters.");
  const subtle = webCrypto().subtle;
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("Snapshot exceeds the supported size.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw genericError();
  let binary: string;
  try {
    binary = atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    );
  } catch {
    throw genericError();
  }
  const result = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  if (encodeBase64Url(result) !== value) throw genericError();
  return result;
}

/** Sanitize, compress, and encrypt a snapshot. Check its returned length before sharing it as a URL. */
export async function encryptSnapshot(
  web: Web,
  options: ShareOptions,
  password: string,
): Promise<string> {
  const engine = webCrypto();
  if (typeof CompressionStream === "undefined")
    throw new Error(
      "This browser does not support compressed password-protected links.",
    );
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ version: 1, web: sanitizeSnapshot(web, options) }),
  );
  if (plaintext.byteLength > MAX_IMPORT_BYTES)
    throw new Error("Snapshot exceeds the supported size.");
  const compressed = await collect(
    new Blob([plaintext])
      .stream()
      .pipeThrough(new CompressionStream("deflate")),
    MAX_IMPORT_BYTES,
  );
  const salt = engine.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = engine.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const encrypted = new Uint8Array(
    await engine.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: AUTHENTICATED_DATA,
        tagLength: 128,
      },
      key,
      compressed,
    ),
  );
  const packed = new Uint8Array(SALT_BYTES + IV_BYTES + encrypted.byteLength);
  packed.set(salt);
  packed.set(iv, SALT_BYTES);
  packed.set(encrypted, SALT_BYTES + IV_BYTES);
  return VERSION + encodeBase64Url(packed);
}

/** Decrypt and validate an encrypted fragment. Wrong passwords and tampering share one error. */
export async function decryptSnapshot(
  payload: string,
  password: string,
  maxLength = MAX_ENCRYPTED_SHARE_LENGTH,
): Promise<Web> {
  const engine = webCrypto();
  if (typeof DecompressionStream === "undefined")
    throw new Error(
      "This browser does not support compressed password-protected links.",
    );
  if (!password || password.length > 1024) throw genericError();
  if (
    !Number.isFinite(maxLength) ||
    maxLength < 1 ||
    !payload.startsWith(VERSION) ||
    payload.length > Math.min(maxLength, MAX_ENCRYPTED_FILE_LENGTH)
  )
    throw genericError();
  const packed = decodeBase64Url(payload.slice(VERSION.length));
  if (packed.length < SALT_BYTES + IV_BYTES + TAG_BYTES) throw genericError();
  const salt = packed.slice(0, SALT_BYTES);
  const iv = packed.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = packed.slice(SALT_BYTES + IV_BYTES);
  try {
    const key = await deriveKey(password, salt);
    const compressed = await engine.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: AUTHENTICATED_DATA,
        tagLength: 128,
      },
      key,
      ciphertext,
    );
    const bytes = await collect(
      new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream("deflate")),
      MAX_IMPORT_BYTES,
    );
    const contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseImport(contents);
  } catch {
    throw genericError();
  }
}

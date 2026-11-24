import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function pepper() {
  const value = process.env.API_KEY_PEPPER ?? "";
  if (value.length < 32) {
    throw new Error("API_KEY_PEPPER must be at least 32 characters.");
  }

  return Buffer.from(value);
}

/** 32-byte key derived from API_KEY_PEPPER for AES-256-GCM. */
function encryptionKey() {
  return createHmac("sha256", pepper()).update("clocked-in-external-sync-token-v1", "utf8").digest();
}

/** Encrypt a plaintext outbound token for storage. Returns base64url: iv.ciphertext.tag */
export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, encrypted, tag].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string) {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret.");
  }

  const [ivPart, dataPart, tagPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function mintWebhookSecret() {
  return `cwh_${randomBytes(24).toString("base64url")}`;
}

/**
 * Verify HMAC-SHA256 over `${timestamp}.${rawBody}` with header
 * `CASWJ-Signature: t=<unix>,v1=<hex>` (also accepts legacy `Clocked-In-Signature`).
 */
export function verifySyncWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretEnc: string | null,
): boolean {
  if (!signatureHeader || !secretEnc) {
    return false;
  }

  let secret: string;
  try {
    secret = decryptSecret(secretEnc);
  } catch {
    return false;
  }

  const match = /(?:^|,)\s*t=(\d+)\s*,\s*v1=([0-9a-f]+)\s*(?:,|$)/i.exec(signatureHeader.trim());
  if (!match) {
    return false;
  }

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const skewMs = Math.abs(Date.now() - timestamp * 1000);
  if (skewMs > 5 * 60 * 1000) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex")
    .toLowerCase();
  const actual = match[2].toLowerCase();
  const actualBuf = Buffer.from(actual, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(actualBuf, expectedBuf);
}

/** Build a signature header for tests / contract docs. */
export function signSyncWebhook(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

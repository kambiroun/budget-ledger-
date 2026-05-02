/**
 * Plaid webhook signature verification.
 *
 * Plaid signs webhooks with an ES256 JWT sent in the `Plaid-Verification` header.
 * The JWT contains a `body_hash` claim (SHA-256 hex of the raw request body) and
 * an `iat` (issue time). The signing key is fetched from Plaid's JWKS endpoint
 * using the `kid` in the JWT header, then cached for 5 minutes.
 *
 * Only enforced when PLAID_ENV === "production". Sandbox/Development webhooks
 * skip verification so local testing isn't blocked.
 */
import { createHash } from "crypto";
import { importJWK, jwtVerify } from "jose";
import { plaidClient } from "./client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const KEY_CACHE = new Map<string, { key: any; fetchedAt: number }>();
const KEY_TTL_MS = 5 * 60_000; // 5 minutes

async function getPublicKey(kid: string) {
  const cached = KEY_CACHE.get(kid);
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) return cached.key;

  const { data } = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  // data.key is a JWK (ES256) — convert to a CryptoKey via jose
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = await importJWK(data.key as any, "ES256");
  KEY_CACHE.set(kid, { key, fetchedAt: Date.now() });
  return key;
}

export async function verifyPlaidWebhook(
  rawBody: string,
  signatureJwt: string | null,
): Promise<boolean> {
  if (!signatureJwt) return false;

  try {
    // Decode JWT header without full verification to extract key ID
    const [headerB64] = signatureJwt.split(".");
    const header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8")
    ) as { kid?: string };
    if (!header.kid) return false;

    const publicKey = await getPublicKey(header.kid);

    const { payload } = await jwtVerify(signatureJwt, publicKey, {
      algorithms: ["ES256"],
      clockTolerance: 60,
    });

    // Verify the body hash matches
    const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    if ((payload as Record<string, unknown>).body_hash !== bodyHash) return false;

    // Reject stale webhooks (> 5 min old)
    const iat = payload.iat ?? 0;
    if (Math.floor(Date.now() / 1000) - iat > 300) return false;

    return true;
  } catch {
    return false;
  }
}

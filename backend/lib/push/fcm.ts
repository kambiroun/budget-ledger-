/**
 * Server-side FCM push notification sender.
 *
 * Uses the FCM HTTP v1 API with Google service-account JWT auth (RS256 via jose).
 * The service account JSON is read from FIREBASE_SERVICE_ACCOUNT_JSON.
 *
 * Access tokens are cached in-process for their lifetime (~1 hour).
 * In serverless cold-starts the cache is empty, so the first call fetches a fresh token.
 */
import { importPKCS8, SignJWT } from "jose";

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  return JSON.parse(raw) as ServiceAccount;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }

  const sa = getServiceAccount();
  const privateKey = await importPKCS8(sa.private_key, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth2:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FCM token exchange failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  /** Optional deep-link route (e.g. "#/budget") opened when user taps the notification */
  route?: string;
}

/** Send a single push notification. Returns true on success, false on failure. */
export async function sendPush(payload: PushPayload): Promise<boolean> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return false;
  try {
    const sa = getServiceAccount();
    const accessToken = await getAccessToken();

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: payload.token,
            notification: { title: payload.title, body: payload.body },
            ...(payload.route ? { data: { route: payload.route } } : {}),
          },
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      // 404 = stale/invalid token — not a hard error, log and return false
      if (res.status === 404) return false;
      console.error("[fcm] send failed", res.status, errBody);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[fcm] sendPush error", e);
    return false;
  }
}

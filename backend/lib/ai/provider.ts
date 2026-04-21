/**
 * AI provider — thin wrapper around Anthropic's REST API.
 *
 * We don't pull in @anthropic-ai/sdk because it drags a lot of weight and
 * all we need is a single chat call. Node 18+ has global fetch on Vercel.
 *
 * The public surface is intentionally tiny:
 *   - complete({ system, user, maxTokens?, json? }) → { text, usage }
 *
 * `json: true` tells the model to reply with JSON only and we parse it.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

export interface AICallInput {
  system: string;
  user: string;
  maxTokens?: number;
  json?: boolean;
  /** Optional: abort if the model takes too long (ms). Vercel caps at ~60s. */
  timeoutMs?: number;
  /** Optional image(s) to attach. Each entry is { media_type, data } (base64). */
  images?: { media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }[];
}

export interface AICallOutput {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

export class AIProviderError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function aiComplete(input: AICallInput): Promise<AICallOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(500, "ai_not_configured");
  }

  const userContent: any[] = [];
  if (input.images?.length) {
    for (const img of input.images) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      });
    }
  }
  userContent.push({ type: "text", text: input.user });

  const body = {
    model: MODEL,
    max_tokens: input.maxTokens ?? 1024,
    system: input.system + (input.json
      ? "\n\nReturn ONLY valid JSON — no preamble, no markdown fences."
      : ""),
    messages: [{ role: "user", content: userContent }],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 25_000);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    throw new AIProviderError(504, e?.name === "AbortError" ? "ai_timeout" : "ai_unreachable");
  }
  clearTimeout(timer);

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AIProviderError(res.status, json?.error?.message || `ai_http_${res.status}`, json);
  }

  // Anthropic shape: { content: [{ type: "text", text: "..." }], usage: { ... } }
  const text: string = (json.content ?? [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");

  return {
    text,
    usage: {
      input_tokens: json?.usage?.input_tokens ?? 0,
      output_tokens: json?.usage?.output_tokens ?? 0,
    },
  };
}

/** Parse JSON robustly — tolerates stray prose or code fences. */
export function parseJsonLoose<T = unknown>(text: string): T {
  // Strip fences
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  // Grab the first {...} or [...]
  const match = t.match(/[\[{][\s\S]*[\]}]/);
  if (match) t = match[0];
  return JSON.parse(t);
}

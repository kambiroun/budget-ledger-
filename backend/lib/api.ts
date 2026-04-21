import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Standard API envelope. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; details?: unknown };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, init);
}
export function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json<ApiErr>({ ok: false, error: message, details }, { status });
}

/**
 * Wrap a route handler so it:
 *   1. Rejects if no session (401)
 *   2. Parses the request body/query through a Zod schema
 *   3. Hands you (supabase, user, parsed) ready to query
 *   4. Serializes thrown errors into JSON
 */
export async function withAuth<T>(
  handler: (ctx: { supabase: SupabaseClient; user: User }) => Promise<T>
): Promise<NextResponse> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return err("unauthorized", 401);
    const result = await handler({ supabase, user });
    return ok(result);
  } catch (e: any) {
    if (e instanceof ZodError) return err("validation_failed", 422, e.flatten());
    if (e?.__apiStatus) return err(e.message, e.__apiStatus, e.details);
    console.error("[api] unhandled", e);
    // Surface the real message + any Supabase/PG hints in the JSON body so
    // the client network inspector has actionable info without opening the
    // Vercel function logs.
    return err(e?.message || "internal_error", 500, {
      name: e?.name,
      stack: typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 5).join("\n") : undefined,
    });
  }
}

export class ApiError extends Error {
  __apiStatus: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.__apiStatus = status;
    this.details = details;
  }
}

export async function parseJSON<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: Request, schema: ZodSchema<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { obj[k] = v; });
  return schema.parse(obj);
}

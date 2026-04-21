/**
 * Import batches — CRUD for the bulletproof importer.
 *
 *   GET    /api/imports          → list user's batches (newest first)
 *   POST   /api/imports          → create a pending batch (stashes raw + mapping)
 *   GET    /api/imports/[id]     → fetch one batch
 *   PATCH  /api/imports/[id]     → update mapping / status
 *   DELETE /api/imports/[id]     → undo: delete batch + all its transactions
 *
 * The heavy lifting (parse + dedupe + categorize + commit) happens client-side
 * via lib/import/commit.ts. The server routes just persist history + let us
 * undo, re-run, and list.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, parseJSON } from "@/lib/api";

const Create = z.object({
  filename: z.string().min(1).max(200),
  file_kind: z.enum(["csv", "tsv", "xlsx", "json", "ofx", "pdf", "image", "text", "unknown"]),
  file_size: z.number().int().nonnegative().optional(),
  raw_text: z.string().max(2_000_000).nullable().optional(),
  mapping: z.any().optional(),
});

export async function GET() {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("import_batches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

export async function POST(req: NextRequest) {
  return withAuth(async ({ supabase, user }) => {
    const body = await parseJSON(req, Create);
    const { data, error } = await supabase
      .from("import_batches")
      .insert({
        user_id: user.id,
        filename: body.filename,
        file_kind: body.file_kind,
        file_size: body.file_size ?? 0,
        // Cap raw_text to ~500KB for DB sanity; big XLSX/PDFs store a preview only.
        raw_text: body.raw_text ? body.raw_text.slice(0, 500_000) : null,
        mapping: body.mapping ?? null,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
}

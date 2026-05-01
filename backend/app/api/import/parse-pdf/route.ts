/**
 * POST /api/import/parse-pdf
 *
 * Accepts a multipart form upload with a single "file" field (PDF).
 * Runs parsePdf() on the server where pdfjs-dist has Node.js worker support,
 * and returns the resulting RawTable as JSON.
 *
 * Body: FormData { file: File }
 * Reply: ApiOk<RawTable>
 *
 * Why server-side? pdfjs-dist v4+ requires a worker URL in browser contexts
 * and is listed in serverExternalPackages, so it can't be bundled for the
 * client. Keeping parsing here keeps the client bundle clean.
 */
import { NextRequest } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { parsePdf } from "@/lib/import/parsers";

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "invalid_form_data");
    }

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "missing_file");

    const name = file.name.toLowerCase();
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
    if (!isPdf) throw new ApiError(400, "not_a_pdf");

    const buffer = await file.arrayBuffer();
    const table = await parsePdf(buffer, file.name);
    return table;
  });
}

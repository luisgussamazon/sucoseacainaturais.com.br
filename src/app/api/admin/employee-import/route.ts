import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { digest } from "@/lib/security";
import { CSV_MAX_BYTES, ImportError } from "@/lib/employee-csv";
import {
  importEmployees,
  previewEmployees,
  previewToken,
  verifyPreview,
} from "@/lib/employee-import";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const user = await currentUser();
    if (!user) throw new ImportError("Entre novamente.", 401);
    if (user.role !== "ADMIN")
      throw new ImportError("Acesso exclusivo do administrador.", 403);
    const origin = request.headers.get("origin"),
      host = request.headers.get("host");
    if (!origin || new URL(origin).host !== host)
      throw new ImportError("Origem inválida.", 403);
    if (
      Number(request.headers.get("content-length") ?? 0) >
      CSV_MAX_BYTES + 16384
    )
      throw new ImportError("Arquivo muito grande.", 413);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > CSV_MAX_BYTES + 16384) {
          await reader.cancel();
          throw new ImportError("Arquivo muito grande.", 413);
        }
        chunks.push(value);
      }
    const f = await new Response(Buffer.concat(chunks), {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData(),
      file = f.get("file");
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".csv") ||
      file.size > CSV_MAX_BYTES
    )
      throw new ImportError("Selecione um CSV de até 256 KB.");
    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      throw new ImportError("Salve o CSV com codificação UTF-8.");
    }
    const key = digest((await cookies()).get("amazonitos_session")!.value),
      action = String(f.get("action"));
    if (action === "preview")
      return Response.json(
        {
          rows: await previewEmployees(csv),
          token: previewToken(csv, user.id, key),
        },
        { headers },
      );
    if (action !== "confirm" || f.get("confirmed") !== "true")
      throw new ImportError("Confira a prévia e confirme a importação.");
    verifyPreview(String(f.get("token") ?? ""), csv, user.id, key);
    return Response.json(
      { rows: await importEmployees(csv, user.id) },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ImportError
            ? e.message
            : "Não foi possível concluir. Confira os usuários antes de tentar novamente.",
      },
      { status: e instanceof ImportError ? e.status : 500, headers },
    );
  }
}

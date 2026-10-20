import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const user = await currentUser({ allowTemporary: true });
    if (!user)
      return Response.json(
        { error: "Entre novamente." },
        { status: 401, headers },
      );
    if (!user.mustChangePassword)
      return Response.json(
        { error: "Use Meu acesso para alterar sua senha." },
        { status: 409, headers },
      );
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      return Response.json(
        { error: "Origem inválida." },
        { status: 403, headers },
      );
    if (Number(request.headers.get("content-length") ?? 0) > 2048)
      return Response.json(
        { error: "Envio inválido." },
        { status: 413, headers },
      );
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2048) {
          await reader.cancel();
          return Response.json(
            { error: "Envio inválido." },
            { status: 413, headers },
          );
        }
        chunks.push(value);
      }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.length > 2048)
      return Response.json(
        { error: "Envio inválido." },
        { status: 413, headers },
      );
    const { password, confirmation } = JSON.parse(raw);
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128 ||
      password !== confirmation ||
      verifyPassword(password, user.passwordHash)
    )
      return Response.json(
        {
          error:
            "Use uma nova senha de 12 a 128 caracteres e confirme o mesmo valor.",
        },
        { status: 400, headers },
      );
    await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordHash: user.passwordHash,
          mustChangePassword: true,
          active: true,
        },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword: false,
        },
      });
      if (changed.count !== 1) throw Error("stale");
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "INITIAL_PASSWORD_CHANGED",
          details: "Senha temporária substituída; sessões revogadas.",
        },
      });
    });
    (await cookies()).delete("amazonitos_session");
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json(
      { error: "Não foi possível alterar. Entre novamente e tente de novo." },
      { status: 400, headers },
    );
  }
}

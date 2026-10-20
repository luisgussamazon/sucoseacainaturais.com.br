import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  cropProfilePhoto,
  ProfilePhotoError,
  PROFILE_PHOTO_MAX,
} from "@/lib/profile-photo";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
async function mutate(request: Request, remove: boolean) {
  try {
    const user = await currentUser();
    if (!user)
      return Response.json(
        { error: "Entre novamente." },
        { status: 401, headers },
      );
    const origin = request.headers.get("origin");
    if (
      !origin ||
      ![
        request.headers.get("host"),
        request.headers.get("x-forwarded-host"),
        new URL(request.url).host,
      ].includes(new URL(origin).host)
    )
      throw new ProfilePhotoError("Origem inválida.", 403);
    const target = new URL(request.url).searchParams.get("userId");
    if (target && target !== user.id)
      throw new ProfilePhotoError(
        "Você só pode alterar sua própria foto.",
        403,
      );
    if (remove) {
      await db.$transaction(async (tx) => {
        await tx.profilePhoto.deleteMany({ where: { userId: user.id } });
        await tx.user.update({
          where: { id: user.id },
          data: { avatarUpdatedAt: null },
        });
        await tx.audit.create({
          data: {
            actorId: user.id,
            action: "PROFILE_PHOTO_REMOVED",
            details: user.id,
          },
        });
      });
      return Response.json({ avatarUpdatedAt: null }, { headers });
    }
    const max = PROFILE_PHOTO_MAX + 16384;
    if (Number(request.headers.get("content-length") ?? 0) > max)
      throw new ProfilePhotoError("Imagem acima de 4 MB.", 413);
    const reader = request.body?.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
          await reader.cancel();
          throw new ProfilePhotoError("Imagem acima de 4 MB.", 413);
        }
        chunks.push(value);
      }
    const f = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    if (f.get("userId") && f.get("userId") !== user.id)
      throw new ProfilePhotoError(
        "Você só pode alterar sua própria foto.",
        403,
      );
    if (f.get("consent") !== "true")
      throw new ProfilePhotoError(
        "Confirme a autorização para exibir sua foto aos colegas.",
      );
    const file = f.get("photo");
    if (!(file instanceof File))
      throw new ProfilePhotoError("Selecione uma fotografia.");
    const bytes = await cropProfilePhoto(
        file,
        Number(f.get("x") ?? 0.5),
        Number(f.get("y") ?? 0.5),
        Number(f.get("zoom") ?? 1),
      ),
      updatedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.profilePhoto.upsert({
        where: { userId: user.id },
        create: { userId: user.id, bytes, updatedAt },
        update: { bytes, updatedAt },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { avatarUpdatedAt: updatedAt },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "PROFILE_PHOTO_CHANGED",
          details: user.id,
        },
      });
    });
    return Response.json(
      { avatarUpdatedAt: updatedAt.toISOString() },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ProfilePhotoError
            ? e.message
            : "Não foi possível salvar a fotografia. Tente novamente.",
      },
      { status: e instanceof ProfilePhotoError ? e.status : 500, headers },
    );
  }
}
export async function POST(request: Request) {
  return mutate(request, false);
}
export async function DELETE(request: Request) {
  return mutate(request, true);
}

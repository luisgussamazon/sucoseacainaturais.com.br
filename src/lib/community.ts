import { Prisma, User, CommunityGrant } from "@prisma/client";
import { db } from "./db";
import sharp from "sharp";
import { z } from "zod";
export const categories = [
  "Ações do RH",
  "Eventos",
  "Reconhecimento",
  "Comunicados",
  "Campanhas",
  "Conquistas da operação",
] as const;
export const photoGuidance =
  "Envie somente imagens autorizadas. Não fotografe informações confidenciais, dados pessoais, etiquetas sensíveis ou situações que comprometam a segurança da operação. Nunca fotografe em condições inseguras.";
export type Actor = User & { communityGrant: CommunityGrant | null };
export function rights(u: Actor) {
  const g = u.communityGrant;
  const eligible = u.role === "ADMIN" || u.role === "HR" || !!g?.leadership;
  return {
    publish: eligible && !!g?.publish,
    review: eligible && !!g?.review,
    moderate: eligible && !!g?.moderate,
    manage: u.role === "ADMIN",
    management: eligible,
  };
}
export function demand(
  u: Actor,
  permission: "publish" | "review" | "moderate" | "manage",
) {
  if (!rights(u)[permission])
    throw new CommunityError("Você não tem autorização para esta ação.", 403);
}
export class CommunityError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const text = (f: FormData, k: string, min = 1, max = 200) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .parse(String(f.get(k) ?? ""));
export const optional = (f: FormData, k: string) =>
  String(f.get(k) ?? "").trim() || null;
export const flag = (f: FormData, k: string) =>
  f.get(k) === "on" || f.get(k) === "true";
export const positive = (f: FormData, k: string, max = 100000) =>
  z.coerce.number().int().min(1).max(max).parse(f.get(k));
export const dateValue = (f: FormData, k: string) =>
  z.coerce.date().parse(
    (() => {
      const s = text(f, k, 1, 60);
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s + "-03:00" : s;
    })(),
  );
export const publication = (f: FormData) => ({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).parse(f.get("status")),
  visibility: z.enum(["INTERNAL", "MANAGEMENT"]).parse(f.get("visibility")),
});
export const publishedWhere = (u: Actor) => ({
  status: "PUBLISHED" as const,
  ...(!rights(u).management ? { visibility: "INTERNAL" as const } : {}),
});
export function readable(
  item: { status: string; visibility: string; publishedAt?: Date },
  u: Actor,
) {
  return (
    item.status === "PUBLISHED" &&
    (!item.publishedAt || item.publishedAt <= new Date()) &&
    (item.visibility === "INTERNAL" || rights(u).management)
  );
}
export async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 20000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        i < 4
      )
        continue;
      throw e;
    }
  }
  throw new Error("Tente novamente.");
}
export function audit(
  tx: Prisma.TransactionClient,
  u: Actor,
  action: string,
  details: string,
) {
  return tx.audit.create({ data: { actorId: u.id, action, details } });
}
export async function loadPost(
  id: string,
  u: Actor,
  tx: Prisma.TransactionClient = db,
) {
  const p = await tx.communityPost.findUnique({ where: { id } });
  if (!p || !readable(p, u))
    throw new CommunityError("Publicação indisponível.", 404);
  return p;
}
export async function imageFiles(f: FormData, max = 8) {
  const files = f
    .getAll("photos")
    .filter((v): v is File => v instanceof File && v.size > 0);
  if (
    files.length > max ||
    files.reduce((n, v) => n + v.size, 0) > 20 * 1024 * 1024
  )
    throw new CommunityError(
      "Envie até " + max + " fotos e no máximo 20 MB por envio.",
    );
  return Promise.all(
    files.map(async (file, index) => {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 4 * 1024 * 1024
      )
        throw new CommunityError("Use JPEG, PNG ou WebP de até 4 MB por foto.");
      const input = Buffer.from(await file.arrayBuffer());
      try {
        const decoder = sharp(input, {
          limitInputPixels: 20000000,
          failOn: "warning",
          animated: false,
        });
        const meta = await decoder.metadata();
        const expected = {
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
        }[meta.format as "jpeg"];
        if (expected !== file.type || (meta.pages ?? 1) > 1)
          throw new Error("Formato inválido");
        const { data, info } = await decoder
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        if (data.length > 1024 * 1024) throw new Error("Imagem muito complexa");
        return {
          bytes: new Uint8Array(data),
          width: info.width,
          height: info.height,
          mime: "image/webp",
          cover: index === 0,
          expiresAt: new Date(Date.now() + 365 * 86400000),
        };
      } catch {
        throw new CommunityError(
          "Foto inválida ou muito grande. Selecione outra imagem.",
        );
      }
    }),
  );
}
export async function mediaAllowed(id: string, u: Actor) {
  const m = await db.communityMedia.findUnique({
    where: { id },
    include: {
      post: true,
      album: true,
      photoMission: { include: { mission: true } },
      evidence: { include: { photoMission: true } },
    },
  });
  if (!m || m.expiresAt <= new Date()) return null;
  const r = rights(u);
  if (m.evidence) {
    if (
      m.evidence.userId !== u.id &&
      !(
        r.review &&
        (!m.evidence.photoMission.reviewerId ||
          m.evidence.photoMission.reviewerId === u.id)
      )
    )
      return null;
  } else if (m.post) {
    if (!readable(m.post, u) && !r.publish) return null;
  } else if (m.album) {
    if (!readable(m.album, u) && !r.publish) return null;
  } else if (m.photoMission) {
    if (
      !(
        m.photoMission.status === "PUBLISHED" && m.photoMission.mission.active
      ) &&
      !r.publish
    )
      return null;
  } else return null;
  return m;
}

import { Prisma, User, CommunityGrant } from "@prisma/client";
import { db } from "./db";
import sharp from "sharp";
import { z } from "zod";
import { permissions } from "./community-options";
export { categories } from "./community-options";
export const photoGuidance =
  "Envie somente imagens autorizadas. Não fotografe informações confidenciais, dados pessoais, etiquetas sensíveis ou situações que comprometam a segurança da operação. Nunca fotografe em condições inseguras.";
export type Actor = User & { communityGrant: CommunityGrant | null };
export function rights(u: Actor) {
  const g = u.communityGrant;
  return {
    publish: !!g?.publish,
    photos: !!g?.photos,
    albums: !!g?.albums,
    events: !!g?.events,
    missions: !!g?.missions,
    recognize: !!g?.recognize,
    review: !!g?.review,
    moderate: !!g?.moderate,
    manage: u.role === "ADMIN",
    management: u.role === "ADMIN" || permissions.some((p) => !!g?.[p.key]),
  };
}
export function demand(
  u: Actor,
  permission: (typeof permissions)[number]["key"] | "manage",
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
export const publication = (f: FormData) => {
  const value = String(f.get("status") ?? "");
  const status =
    value === "SCHEDULED"
      ? "PUBLISHED"
      : z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).parse(value);
  return {
    status: status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    visibility: "INTERNAL" as const,
  };
};
export const publishedWhere = (_u: Actor) => ({
  status: "PUBLISHED" as const,
  visibility: "INTERNAL" as const,
});
export function readable(
  item: { status: string; publishedAt?: Date; visibility?: string },
  _u: Actor,
) {
  return (
    item.status === "PUBLISHED" &&
    (!item.visibility || item.visibility === "INTERNAL") &&
    (!item.publishedAt || item.publishedAt <= new Date())
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
          cover: index === Number(f.get("coverIndex") ?? 0),
          position: index,
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
      event: true,
      photoMission: { include: { mission: true } },
      evidence: { include: { photoMission: true } },
    },
  });
  if (!m || m.expiresAt <= new Date()) return null;
  const r = rights(u);
  // Evidence access remains restricted to its participant and assigned reviewer.
  if (m.evidence) {
    return m.evidence.userId === u.id ||
      (r.review &&
        (!m.evidence.photoMission.reviewerId ||
          m.evidence.photoMission.reviewerId === u.id))
      ? m
      : null;
  }
  const parent = m.post ?? m.album ?? m.event;
  if (parent) {
    const released =
      readable(parent, u) &&
      (await mediaConsent(
        parent,
        m.album ? "ALBUM" : m.post ? "POST" : "EVENT",
      ));
    // No new permission bypasses consent or opens another author's drafts.
    const ownerPreview =
      m.ownerId === u.id &&
      (m.post ? r.publish || r.recognize : m.album ? r.albums : r.events) &&
      r.photos;
    return released || ownerPreview ? m : null;
  }
  if (m.photoMission) {
    return (m.photoMission.status === "PUBLISHED" &&
      m.photoMission.mission.active) ||
      (m.ownerId === u.id && r.missions && r.photos)
      ? m
      : null;
  }
  return null;
}

export async function mediaConsent(
  parent: {
    id: string;
    imageAuthorization: boolean | null;
    restrictedChecked: boolean | null;
  },
  kind: "POST" | "ALBUM" | "EVENT",
  tx: Prisma.TransactionClient = db,
) {
  if (parent.imageAuthorization === true && parent.restrictedChecked === true)
    return true;
  if (
    kind === "ALBUM" &&
    parent.imageAuthorization === null &&
    parent.restrictedChecked === null
  ) {
    return !!(await tx.audit.findFirst({
      where: { action: "COMMUNITY_ALBUM", details: parent.id },
      select: { id: true },
    }));
  }
  return false;
}

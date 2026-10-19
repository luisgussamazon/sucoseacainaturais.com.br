import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  categories,
  CommunityError,
  demand,
  rights,
  text,
  optional,
  flag,
  positive,
  dateValue,
  publication,
  imageFiles,
  serial,
  audit,
  loadPost,
} from "@/lib/community";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const origin = request.headers.get("origin");
    const hosts = [
      request.headers.get("host"),
      request.headers.get("x-forwarded-host"),
      new URL(request.url).host,
    ];
    if (!origin || !hosts.includes(new URL(origin).host))
      throw new CommunityError("Origem inválida. Recarregue a página.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 22 * 1024 * 1024)
      throw new CommunityError("Envio acima de 20 MB.", 413);
    const current = await currentUser();
    if (!current)
      throw new CommunityError("Entre novamente para continuar.", 401);
    const u = await db.user.findUniqueOrThrow({
      where: { id: current.id },
      include: { communityGrant: true },
    });
    const { action } = await params;
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 22 * 1024 * 1024) {
          await reader.cancel();
          throw new CommunityError("Envio acima de 20 MB.", 413);
        }
        chunks.push(value);
      }
    }
    const f = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    let message = "Alteração salva.";
    if (
      ["post", "album", "photo-mission", "submit"].includes(action) &&
      (await db.communityMedia.count({
        where: {
          ownerId: u.id,
          createdAt: { gt: new Date(Date.now() - 86400000) },
        },
      })) >= 100
    )
      throw new CommunityError(
        "Limite diário de 100 imagens atingido. Tente amanhã.",
        429,
      );
    if (action === "grant") {
      demand(u, "manage");
      const userId = text(f, "userId");
      const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
      if (!target.active) throw new CommunityError("Usuário inativo.");
      const data = {
        publish: flag(f, "publish"),
        review: flag(f, "review"),
        moderate: flag(f, "moderate"),
        leadership: flag(f, "leadership"),
        assignedBy: u.id,
      };
      if (
        target.role === "EMPLOYEE" &&
        !data.leadership &&
        (data.publish || data.review || data.moderate)
      )
        throw new CommunityError(
          "Associe o colaborador à liderança antes de conceder permissões de gestão.",
        );
      await serial(async (tx) => {
        await tx.communityGrant.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
        });
        await audit(
          tx,
          u,
          "COMMUNITY_GRANT",
          JSON.stringify({ userId, ...data }),
        );
      });
    } else if (action === "post" || action === "album" || action === "event") {
      demand(u, "publish");
      const id = optional(f, "id");
      const title = text(f, "title", 3, 150),
        description = text(f, "description", 5, 5000);
      const state = publication(f);
      const photos = action === "event" ? [] : await imageFiles(f);
      if (
        photos.length &&
        (!flag(f, "imageAuthorization") || !flag(f, "restrictedChecked"))
      )
        throw new CommunityError(
          "Confirme a autorização de uso das imagens e a revisão de informações restritas.",
        );
      await serial(async (tx) => {
        if (action === "post") {
          const existing = id
            ? await tx.communityPost.findUniqueOrThrow({ where: { id } })
            : null;
          const evidenceId = existing?.evidenceId ?? optional(f, "evidenceId");
          let highlightPhotos: typeof photos = [];
          if (evidenceId) {
            const e = await tx.photoEvidence.findUniqueOrThrow({
              where: { id: evidenceId },
              include: { media: { where: { expiresAt: { gt: new Date() } } } },
            });
            if (
              e.status !== "APPROVED" ||
              !e.shareConsent ||
              !flag(f, "imageAuthorization") ||
              !flag(f, "restrictedChecked")
            )
              throw new CommunityError(
                "O destaque exige evidência aprovada, consentimento do participante e revisão administrativa independente.",
              );
            highlightPhotos = id
              ? []
              : e.media
                  .filter((m) => m.attempt === e.attempts)
                  .map((m) => ({
                    bytes: m.bytes,
                    width: m.width,
                    height: m.height,
                    mime: m.mime,
                    cover: m.cover,
                    expiresAt: m.expiresAt,
                  }));
            if (!id && !highlightPhotos.length)
              throw new CommunityError("As imagens expiraram.");
          }
          const albumId = optional(f, "albumId"),
            eventId = optional(f, "eventId");
          const data = {
            title,
            description,
            ...state,
            category: z.enum(categories).parse(f.get("category")),
            publishedAt: dateValue(f, "publishedAt"),
            pinned: flag(f, "pinned"),
            albumId,
            eventId,
            imageAuthorization: flag(f, "imageAuthorization"),
            restrictedChecked: flag(f, "restrictedChecked"),
          };
          const p = id
            ? await tx.communityPost.update({ where: { id }, data })
            : await tx.communityPost.create({
                data: { ...data, authorId: u.id, evidenceId },
              });
          if (
            photos.length +
              highlightPhotos.length +
              (await tx.communityMedia.count({ where: { postId: p.id } })) >
            8
          )
            throw new CommunityError("Uma publicação pode ter até 8 fotos.");
          await tx.communityMedia.createMany({
            data: [...photos, ...highlightPhotos].map((m) => ({
              ...m,
              ownerId: u.id,
              postId: p.id,
            })),
          });
          const coverId = optional(f, "coverId");
          if (coverId) {
            const cover = await tx.communityMedia.findFirst({
              where: { id: coverId, postId: p.id },
            });
            if (!cover) throw new CommunityError("Capa inválida.");
            await tx.communityMedia.updateMany({
              where: { postId: p.id },
              data: { cover: false },
            });
            await tx.communityMedia.update({
              where: { id: coverId },
              data: { cover: true },
            });
          }
          await audit(tx, u, "COMMUNITY_POST", p.id);
        } else if (action === "album") {
          const data = {
            title,
            description,
            ...state,
            eventDate: dateValue(f, "eventDate"),
            eventId: optional(f, "eventId"),
          };
          const a = id
            ? await tx.communityAlbum.update({ where: { id }, data })
            : await tx.communityAlbum.create({
                data: { ...data, authorId: u.id },
              });
          if (
            photos.length +
              (await tx.communityMedia.count({ where: { albumId: a.id } })) >
            8
          )
            throw new CommunityError("Um álbum pode ter até 8 fotos.");
          await tx.communityMedia.createMany({
            data: photos.map((m) => ({ ...m, ownerId: u.id, albumId: a.id })),
          });
          const coverId = optional(f, "coverId");
          if (coverId) {
            const cover = await tx.communityMedia.findFirst({
              where: { id: coverId, albumId: a.id },
            });
            if (!cover) throw new CommunityError("Capa inválida.");
            await tx.communityMedia.updateMany({
              where: { albumId: a.id },
              data: { cover: false },
            });
            await tx.communityMedia.update({
              where: { id: coverId },
              data: { cover: true },
            });
          }
          await audit(tx, u, "COMMUNITY_ALBUM", a.id);
        } else {
          const startsAt = dateValue(f, "startsAt"),
            endsAt = dateValue(f, "endsAt");
          if (endsAt < startsAt)
            throw new CommunityError("O término deve ser após o início.");
          const data = {
            title,
            description,
            ...state,
            location: text(f, "location", 2, 200),
            startsAt,
            endsAt,
          };
          const e = id
            ? await tx.communityEvent.update({ where: { id }, data })
            : await tx.communityEvent.create({
                data: { ...data, authorId: u.id },
              });
          await audit(tx, u, "COMMUNITY_EVENT", e.id);
        }
      });
      message =
        "Conteúdo salvo. Rascunhos e arquivos permanecem fora do mural.";
    } else if (action === "like") {
      const postId = text(f, "postId");
      await serial(async (tx) => {
        await loadPost(postId, u, tx);
        if (flag(f, "liked"))
          await tx.communityLike.upsert({
            where: { postId_userId: { postId, userId: u.id } },
            create: { postId, userId: u.id },
            update: {},
          });
        else
          await tx.communityLike.deleteMany({
            where: { postId, userId: u.id },
          });
      });
      message = "Interação atualizada.";
    } else if (action === "comment") {
      const postId = text(f, "postId"),
        body = text(f, "text", 1, 1000);
      await serial(async (tx) => {
        await loadPost(postId, u, tx);
        const recent = await tx.communityComment.count({
          where: {
            userId: u.id,
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
        });
        if (recent >= 5)
          throw new CommunityError(
            "Aguarde um minuto antes de comentar novamente.",
          );
        await tx.communityComment.create({
          data: { postId, userId: u.id, text: body },
        });
      });
      message = "Comentário enviado.";
    } else if (action === "moderate") {
      demand(u, "moderate");
      const id = text(f, "id"),
        reason = text(f, "reason", 5, 300);
      await serial(async (tx) => {
        await tx.communityComment.update({
          where: { id },
          data: {
            hidden: flag(f, "hidden"),
            moderatedBy: u.id,
            moderationReason: reason,
          },
        });
        await audit(
          tx,
          u,
          "MODERATE_COMMENT",
          JSON.stringify({ id, reason, hidden: flag(f, "hidden") }),
        );
      });
    } else if (action === "photo-mission") {
      demand(u, "publish");
      const title = text(f, "title", 3, 100),
        description = text(f, "description", 5, 1000),
        reward = positive(f, "reward"),
        endsAt = dateValue(f, "endsAt"),
        startsAt = dateValue(f, "startsAt");
      if (endsAt <= startsAt) throw new CommunityError("Prazo inválido.");
      const photos = await imageFiles(f, 1);
      if (photos.length && !flag(f, "imageAuthorization"))
        throw new CommunityError("Confirme a autorização da capa.");
      const reviewerId = optional(f, "reviewerId");
      if (reviewerId) {
        const reviewer = await db.user.findUniqueOrThrow({
          where: { id: reviewerId },
          include: { communityGrant: true },
        });
        if (!reviewer.active || !rights(reviewer).review)
          throw new CommunityError("Responsável sem permissão de avaliação.");
      }
      const id = optional(f, "id");
      const config = {
        category: text(f, "category", 2, 80),
        startsAt,
        maxPhotos: positive(f, "maxPhotos", 5),
        participationLimit: positive(f, "participationLimit", 10000),
        allowResubmit: flag(f, "allowResubmit"),
        reviewerId,
        status: publication(f).status,
      };
      await serial(async (tx) => {
        let pm;
        if (id) {
          const prior = await tx.photoMission.findUniqueOrThrow({
            where: { id },
          });
          const count = await tx.photoEvidence.count({
            where: { photoMissionId: id },
          });
          if (count)
            throw new CommunityError(
              "Missão com participações não pode alterar suas regras. Use encerrar.",
            );
          await tx.mission.update({
            where: { id: prior.missionId },
            data: { title, description, reward, endsAt },
          });
          pm = await tx.photoMission.update({ where: { id }, data: config });
        } else {
          const baseMission = await tx.mission.create({
            data: {
              title,
              description,
              reward,
              endsAt,
              question: "Evidência fotográfica obrigatória",
              options: [],
              answer: 0,
            },
          });
          pm = await tx.photoMission.create({
            data: { ...config, missionId: baseMission.id },
          });
        }
        if (
          photos.length +
            (await tx.communityMedia.count({
              where: { photoMissionId: pm.id },
            })) >
          1
        )
          throw new CommunityError("A missão já possui capa.");
        await tx.communityMedia.createMany({
          data: photos.map((m) => ({
            ...m,
            ownerId: u.id,
            photoMissionId: pm.id,
          })),
        });
        await audit(tx, u, "PHOTO_MISSION", pm.id);
      });
    } else if (action === "close-photo-mission") {
      demand(u, "publish");
      const id = text(f, "id");
      await serial(async (tx) => {
        const pm = await tx.photoMission.update({
          where: { id },
          data: { status: "ARCHIVED" },
        });
        await tx.mission.update({
          where: { id: pm.missionId },
          data: { active: false },
        });
        await audit(tx, u, "CLOSE_PHOTO_MISSION", id);
      });
    } else if (action === "submit") {
      const photoMissionId = text(f, "photoMissionId");
      const config = await db.photoMission.findUniqueOrThrow({
        where: { id: photoMissionId },
      });
      const photos = await imageFiles(f, config.maxPhotos);
      if (!photos.length)
        throw new CommunityError("Envie pelo menos uma fotografia válida.");
      if (!flag(f, "safeImage"))
        throw new CommunityError(
          "Confirme que as fotos estão autorizadas e são seguras.",
        );
      await serial(async (tx) => {
        const pm = await tx.photoMission.findUniqueOrThrow({
          where: { id: photoMissionId },
          include: { mission: true },
        });
        const now = new Date();
        if (
          pm.status !== "PUBLISHED" ||
          !pm.mission.active ||
          pm.startsAt > now ||
          pm.mission.endsAt < now
        )
          throw new CommunityError("Missão fora do período de participação.");
        const old = await tx.photoEvidence.findUnique({
          where: { photoMissionId_userId: { photoMissionId, userId: u.id } },
        });
        if (old && !(old.status === "REJECTED" && pm.allowResubmit))
          throw new CommunityError(
            "Participação já enviada ou reenvio não permitido.",
          );
        if (
          !old &&
          (await tx.photoEvidence.count({ where: { photoMissionId } })) >=
            pm.participationLimit
        )
          throw new CommunityError("Limite de participantes atingido.");
        const e = old
          ? await tx.photoEvidence.update({
              where: { id: old.id },
              data: {
                status: "PENDING",
                attempts: { increment: 1 },
                submittedAt: now,
                reviewedAt: null,
                reviewerId: null,
                reason: null,
                shareConsent: flag(f, "shareConsent"),
              },
            })
          : await tx.photoEvidence.create({
              data: {
                photoMissionId,
                userId: u.id,
                shareConsent: flag(f, "shareConsent"),
              },
            });
        await tx.communityMedia.createMany({
          data: photos.map((m) => ({
            ...m,
            ownerId: u.id,
            evidenceId: e.id,
            attempt: e.attempts,
            expiresAt: new Date(Date.now() + 90 * 86400000),
          })),
        });
        await audit(tx, u, "PHOTO_SUBMITTED", e.id);
      });
      message =
        "Fotografias enviadas. Sua participação está em análise; a recompensa depende da aprovação.";
    } else if (action === "cancel") {
      const id = text(f, "id");
      await serial(async (tx) => {
        const changed = await tx.photoEvidence.updateMany({
          where: { id, userId: u.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        if (!changed.count)
          throw new CommunityError("Participação não pode ser cancelada.");
        await audit(tx, u, "PHOTO_CANCELLED", id);
      });
    } else if (action === "review") {
      demand(u, "review");
      const id = text(f, "id"),
        approved = flag(f, "approved"),
        reason = approved ? null : text(f, "reason", 5, 500);
      await serial(async (tx) => {
        const e = await tx.photoEvidence.findUniqueOrThrow({
          where: { id },
          include: { photoMission: { include: { mission: true } } },
        });
        if (e.userId === u.id)
          throw new CommunityError(
            "Não é permitido avaliar sua própria participação.",
            403,
          );
        if (e.photoMission.reviewerId && e.photoMission.reviewerId !== u.id)
          throw new CommunityError(
            "Evidência atribuída a outro responsável.",
            403,
          );
        if (e.status !== "PENDING") return;
        if (
          approved &&
          (await tx.communityMedia.count({
            where: {
              evidenceId: id,
              attempt: e.attempts,
              expiresAt: { gt: new Date() },
            },
          })) === 0
        )
          throw new CommunityError("Não há fotografia válida para avaliar.");
        const changed = await tx.photoEvidence.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: approved ? "APPROVED" : "REJECTED",
            reviewerId: u.id,
            reviewedAt: new Date(),
            reason,
          },
        });
        if (!changed.count) return;
        if (approved) {
          const m = e.photoMission.mission;
          await tx.completion.create({
            data: { userId: e.userId, missionId: m.id },
          });
          await tx.user.update({
            where: { id: e.userId, active: true },
            data: { balance: { increment: m.reward } },
          });
          await tx.ledger.create({
            data: {
              userId: e.userId,
              amount: m.reward,
              description:
                "Missão fotográfica: " + m.title + " · evidência " + e.id,
            },
          });
        }
        await tx.evidenceReview.create({
          data: {
            evidenceId: id,
            reviewerId: u.id,
            status: approved ? "APPROVED" : "REJECTED",
            reason,
          },
        });
        await audit(tx, u, approved ? "PHOTO_APPROVED" : "PHOTO_REJECTED", id);
      });
      message = approved
        ? "Avaliação concluída. Recompensa registrada uma única vez."
        : "Evidência reprovada sem crédito de moedas.";
    } else if (action === "purge") {
      demand(u, "manage");
      await serial(async (tx) => {
        const result = await tx.communityMedia.deleteMany({
          where: { expiresAt: { lte: new Date() } },
        });
        await audit(tx, u, "PURGE_EXPIRED_MEDIA", String(result.count));
      });
      message =
        "Somente imagens com retenção expirada foram removidas. Registros e histórico preservados.";
    } else throw new CommunityError("Ação inexistente.", 404);
    revalidatePath("/", "layout");
    return Response.json({ message }, { headers });
  } catch (e) {
    if (e instanceof CommunityError)
      return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof z.ZodError)
      return Response.json(
        { error: "Revise os campos obrigatórios e os limites do formulário." },
        { status: 400, headers },
      );
    console.error(
      "community request failed",
      e instanceof Error ? e.name : "unknown",
    );
    return Response.json(
      {
        error:
          "Não foi possível concluir. Atualize a página e tente novamente.",
      },
      { status: 400, headers },
    );
  }
}

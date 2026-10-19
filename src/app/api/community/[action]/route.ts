import { socialMutation } from "@/lib/community-social";
import { permissions, missionCategories } from "@/lib/community-options";
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
    let contentId: string | undefined;
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
        photos: flag(f, "photos"),
        albums: flag(f, "albums"),
        events: flag(f, "events"),
        missions: flag(f, "missions"),
        recognize: flag(f, "recognize"),
        assignedBy: u.id,
      };
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
      const id = optional(f, "id");
      const currentPost =
        action === "post" && id
          ? await db.communityPost.findUniqueOrThrow({ where: { id } })
          : null;
      demand(
        u,
        action === "post"
          ? optional(f, "completionId") ||
            optional(f, "evidenceId") ||
            currentPost?.completionId ||
            currentPost?.evidenceId
            ? "recognize"
            : "publish"
          : action === "album"
            ? "albums"
            : "events",
      );
      const title = text(f, "title", 3, 150),
        description = text(f, "description", 5, 5000);
      const state = publication(f);
      const photos = await imageFiles(f);
      if (photos.length) demand(u, "photos");
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
          let evidenceId = existing?.evidenceId ?? optional(f, "evidenceId");
          let completionId =
            existing?.completionId ?? optional(f, "completionId");
          if (evidenceId && !completionId) {
            const e = await tx.photoEvidence.findUniqueOrThrow({
              where: { id: evidenceId },
              include: { photoMission: true },
            });
            const c = await tx.completion.findUnique({
              where: {
                userId_missionId: {
                  userId: e.userId,
                  missionId: e.photoMission.missionId,
                },
              },
            });
            if (!c)
              throw new CommunityError("Conquista sem conclusão registrada.");
            completionId = c.id;
          }
          let identified = false;
          if (completionId) {
            demand(u, "recognize");
            const c = await tx.completion.findUniqueOrThrow({
              where: { id: completionId },
              include: { mission: { include: { photoConfig: true } } },
            });
            identified = flag(f, "identify");
            if (identified && !c.recognitionConsent)
              throw new CommunityError(
                "A divulgação da identificação exige consentimento do associado.",
              );
            if (!flag(f, "recognitionAuthorization"))
              throw new CommunityError(
                "Confirme a publicação administrativa do reconhecimento.",
              );
            if (
              !id &&
              (await tx.communityPost.count({
                where: {
                  OR: [
                    { completionId },
                    {
                      evidence: {
                        userId: c.userId,
                        photoMission: { missionId: c.missionId },
                      },
                    },
                  ],
                },
              }))
            )
              throw new CommunityError(
                "Esta conquista já possui publicação. Edite o registro existente.",
              );
            if (c.mission.photoConfig) {
              const e = await tx.photoEvidence.findUnique({
                where: {
                  photoMissionId_userId: {
                    photoMissionId: c.mission.photoConfig.id,
                    userId: c.userId,
                  },
                },
              });
              if (!e || e.status !== "APPROVED")
                throw new CommunityError("A evidência ainda não foi aprovada.");
              if (flag(f, "includePhotos")) {
                if (!e.shareConsent)
                  throw new CommunityError(
                    "Sem consentimento para divulgação das imagens.",
                  );
                evidenceId = e.id;
              } else if (!id) evidenceId = null;
            }
          }

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
                  .map((m, index) => ({
                    position: index,
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
            recognitionIdentified: identified,
            albumId,
            eventId,
            imageAuthorization: flag(f, "imageAuthorization"),
            restrictedChecked: flag(f, "restrictedChecked"),
          };
          if (f.get("status") === "SCHEDULED" && data.publishedAt <= new Date())
            throw new CommunityError("Para agendar, escolha uma data futura.");
          const p = id
            ? await tx.communityPost.update({ where: { id }, data })
            : await tx.communityPost.create({
                data: { ...data, authorId: u.id, evidenceId, completionId },
              });
          contentId = p.id;
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
            demand(u, "photos");
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
            category: optional(f, "category") ?? "Eventos",
            imageAuthorization: flag(f, "imageAuthorization"),
            restrictedChecked: flag(f, "restrictedChecked"),
            eventId: optional(f, "eventId"),
          };
          const a = id
            ? await tx.communityAlbum.update({ where: { id }, data })
            : await tx.communityAlbum.create({
                data: { ...data, authorId: u.id },
              });
          contentId = a.id;
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
            demand(u, "photos");
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
            imageAuthorization: flag(f, "imageAuthorization"),
            restrictedChecked: flag(f, "restrictedChecked"),
            startsAt,
            endsAt,
          };
          const e = id
            ? await tx.communityEvent.update({ where: { id }, data })
            : await tx.communityEvent.create({
                data: { ...data, authorId: u.id },
              });
          if (
            photos.length +
              (await tx.communityMedia.count({ where: { eventId: e.id } })) >
            8
          )
            throw new CommunityError("Um evento pode ter até 8 fotos.");
          await tx.communityMedia.createMany({
            data: photos.map((m) => ({ ...m, ownerId: u.id, eventId: e.id })),
          });
          const eventCover = optional(f, "coverId");
          if (eventCover) {
            demand(u, "photos");
            if (
              !(await tx.communityMedia.findFirst({
                where: { id: eventCover, eventId: e.id },
              }))
            )
              throw new CommunityError("Capa inválida.");
            await tx.communityMedia.updateMany({
              where: { eventId: e.id },
              data: { cover: false },
            });
            await tx.communityMedia.update({
              where: { id: eventCover },
              data: { cover: true },
            });
          }
          contentId = e.id;
          await audit(tx, u, "COMMUNITY_EVENT", e.id);
        }
      });
      message =
        "Conteúdo salvo. Rascunhos e arquivos permanecem fora do mural.";
    } else if (
      ["like", "comment", "delete-comment", "moderate"].includes(action)
    ) {
      message = await socialMutation(action, f, u);
    } else if (action === "photo-mission") {
      demand(u, "missions");
      const title = text(f, "title", 3, 100),
        description = text(f, "description", 5, 1000),
        reward = positive(f, "reward"),
        endsAt = dateValue(f, "endsAt"),
        startsAt = dateValue(f, "startsAt");
      if (endsAt <= startsAt) throw new CommunityError("Prazo inválido.");
      const photos = await imageFiles(f, 1);
      if (photos.length) demand(u, "photos");
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
      demand(u, "missions");
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
    } else if (action === "quiz-mission") {
      demand(u, "missions");
      const title = text(f, "title", 3, 100),
        description = text(f, "description", 5, 1000),
        reward = positive(f, "reward"),
        endsAt = dateValue(f, "endsAt"),
        question = text(f, "question", 5, 300),
        options = [
          text(f, "option0", 1, 200),
          text(f, "option1", 1, 200),
          text(f, "option2", 1, 200),
        ],
        answer = z.coerce.number().int().min(0).max(2).parse(f.get("answer"));
      if (endsAt <= new Date())
        throw new CommunityError("Defina um encerramento futuro.");
      const m = await serial(async (tx) => {
        const m = await tx.mission.create({
          data: {
            title,
            description,
            reward,
            endsAt,
            question,
            options,
            answer,
            active: f.get("status") === "PUBLISHED",
          },
        });
        await audit(tx, u, "CREATE_CAMPAIGN", m.id);
        return m;
      });
      contentId = m.id;
    } else if (action === "consent-recognition") {
      const id = text(f, "id");
      await serial(async (tx) => {
        const c = await tx.completion.findUniqueOrThrow({ where: { id } });
        if (c.userId !== u.id)
          throw new CommunityError("Sem acesso a esta conquista.", 403);
        await tx.completion.update({
          where: { id },
          data: { recognitionConsent: flag(f, "consent") },
        });
        await audit(
          tx,
          u,
          "RECOGNITION_CONSENT",
          JSON.stringify({ id, consent: flag(f, "consent") }),
        );
      });
      message = "Autorização de identificação atualizada.";
    } else if (action === "append-photos") {
      demand(u, "photos");
      const id = text(f, "targetId"),
        kind = z.enum(["POST", "ALBUM", "EVENT"]).parse(f.get("kind")),
        photos = await imageFiles(f);
      if (!flag(f, "imageAuthorization") || !flag(f, "restrictedChecked"))
        throw new CommunityError(
          "Confirme a autorização e revisão de todas as imagens do conteúdo.",
        );
      await serial(async (tx) => {
        const context =
          kind === "POST"
            ? { postId: id }
            : kind === "ALBUM"
              ? { albumId: id }
              : { eventId: id };
        const target =
          kind === "POST"
            ? await tx.communityPost.findUniqueOrThrow({ where: { id } })
            : kind === "ALBUM"
              ? await tx.communityAlbum.findUniqueOrThrow({ where: { id } })
              : await tx.communityEvent.findUniqueOrThrow({ where: { id } });
        if (target.authorId !== u.id && target.status !== "PUBLISHED")
          throw new CommunityError(
            "Rascunhos de outros autores permanecem privados.",
            403,
          );
        const count = await tx.communityMedia.count({ where: context });
        if (count + photos.length > 8)
          throw new CommunityError("O limite é de 8 fotos por conteúdo.");
        const coverId = optional(f, "coverId");
        if (photos.some((m) => m.cover) || coverId)
          await tx.communityMedia.updateMany({
            where: context,
            data: { cover: false },
          });
        await tx.communityMedia.createMany({
          data: photos.map((m, i) => ({
            ...m,
            position: count + i,
            ownerId: u.id,
            ...context,
          })),
        });
        if (coverId) {
          if (
            !(await tx.communityMedia.findFirst({
              where: { id: coverId, ...context },
            }))
          )
            throw new CommunityError("Capa inválida.");
          await tx.communityMedia.update({
            where: { id: coverId },
            data: { cover: true },
          });
        }
        const authorization = {
          imageAuthorization: true,
          restrictedChecked: true,
        };
        if (kind === "POST")
          await tx.communityPost.update({ where: { id }, data: authorization });
        else if (kind === "ALBUM")
          await tx.communityAlbum.update({
            where: { id },
            data: authorization,
          });
        else
          await tx.communityEvent.update({
            where: { id },
            data: authorization,
          });
        await audit(tx, u, "APPEND_AUTHORIZED_PHOTOS", kind + ":" + id);
      });
      message = "Fotos e capa atualizadas.";
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
    return Response.json({ message, contentId }, { headers });
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

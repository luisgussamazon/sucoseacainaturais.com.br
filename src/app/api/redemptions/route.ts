import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CommunityError,
  flag,
  imageFiles,
  serial,
  text,
} from "@/lib/community";
import { finalizeOrder } from "@/lib/order-transition";
import { productPhotoSrc } from "@/lib/product-photo";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const actor = await currentUser();
  if (!actor)
    return Response.json(
      { error: "Entre novamente." },
      { status: 401, headers },
    );
  const where = { userId: actor.id };
  const [orders, counts, shares, publications] = await Promise.all([
    db.order.aggregate({
      where,
      _count: { _all: true },
      _max: { createdAt: true, collectedAt: true, cancelledAt: true },
    }),
    db.order.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
    db.redemptionShare.aggregate({
      where: { order: where },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.communityPost.aggregate({
      where: { redemptionShare: { order: where } },
      _max: { updatedAt: true },
    }),
  ]);
  return Response.json({ orders, counts, shares, publications }, { headers });
}
async function attempt(actorId: string) {
  const n = await serial(async (tx) => {
    const old = await tx.pickupAttempt.findUnique({ where: { actorId } });
    const reset = !old || old.windowStart.getTime() < Date.now() - 60000;
    return tx.pickupAttempt.upsert({
      where: { actorId },
      create: { actorId, attempts: 1 },
      update: reset
        ? { attempts: 1, windowStart: new Date() }
        : { attempts: { increment: 1 } },
    });
  });
  if (n.attempts > 30)
    throw new CommunityError("Muitas tentativas. Aguarde um minuto.", 429);
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
    if (!origin || new URL(origin).host !== host)
      throw new CommunityError("Origem inválida.", 403);
    const actor = await currentUser();
    if (!actor) throw new CommunityError("Entre novamente.", 401);
    if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024)
      throw new CommunityError("Envio acima do limite.", 413);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 6 * 1024 * 1024) {
          await reader.cancel();
          throw new CommunityError("Envio acima do limite.", 413);
        }
        chunks.push(value);
      }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const action = text(form, "action", 1, 30);
    let contentId: string | undefined;
    let message = "Operação concluída.";
    if (action === "lookup" || action === "confirm") {
      if (!["HR", "ADMIN"].includes(actor.role))
        throw new CommunityError(
          "Somente RH e administradores podem conferir retiradas.",
          403,
        );
      await attempt(actor.id);
      const code = text(form, "code", 1, 100).toLowerCase();
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          code,
        )
      )
        throw new CommunityError("Comprovante não encontrado.", 404);
      const order = await db.order.findUnique({
        where: { pickupCode: code },
        include: { product: true, user: { select: { name: true } } },
      });
      if (!order) throw new CommunityError("Comprovante não encontrado.", 404);
      if (action === "lookup")
        return Response.json(
          {
            order: {
              id: order.id,
              code: order.pickupCode,
              name: order.user.name,
              product: order.product.name,
              description: order.product.description,
              image: productPhotoSrc(order.product),
              quantity: order.quantity,
              cost: order.cost,
              status: order.status,
              createdAt: order.createdAt,
              collectedAt: order.collectedAt,
              collectedByName: order.collectedByName,
            },
          },
          { headers },
        );
      if (form.get("orderId") !== order.id || !flag(form, "checked"))
        throw new CommunityError(
          "Confira o pedido e a entrega antes de confirmar.",
        );
      await serial(async (tx) => {
        const current = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        if (current.status !== "RESERVED")
          throw new CommunityError("Pedido já finalizado.", 409);
        await finalizeOrder(tx, order.id, "COLLECTED", actor);
      });
      message = "Retirada confirmada. Saldo e estoque preservados.";
    } else if (action === "cancel") {
      const orderId = text(form, "orderId", 1, 100);
      await serial(async (tx) => {
        const o = await tx.order.findFirst({
          where: { id: orderId, userId: actor.id },
        });
        if (!o) throw new CommunityError("Pedido indisponível.", 404);
        if (o.status !== "RESERVED")
          throw new CommunityError("Pedido já finalizado.", 409);
        await finalizeOrder(tx, o.id, "CANCELLED", actor);
      });
      message = "Resgate cancelado e Amazonitos estornados.";
    } else if (action === "share") {
      const orderId = text(form, "orderId", 1, 100);
      const order = await db.order.findFirst({
        where: { id: orderId, userId: actor.id, status: "COLLECTED" },
        include: { product: true, share: true },
      });
      if (!order)
        throw new CommunityError(
          "Somente seus pedidos retirados podem ser compartilhados.",
          403,
        );
      if (order.share)
        return Response.json(
          {
            message: "Esta conquista já possui uma publicação.",
            contentId: order.share.postId,
          },
          { headers },
        );
      if (!flag(form, "imageAuthorization") || !flag(form, "restrictedChecked"))
        throw new CommunityError(
          "Confirme o uso de imagem e a ausência de informações confidenciais.",
        );
      const caption = text(form, "caption", 3, 1000);
      if (
        caption.includes(order.id) ||
        caption.toLowerCase().includes(order.pickupCode) ||
        /[a-f0-9]{8}-[a-f0-9-]{27,}|\bc[a-z0-9]{24,}\b|\S+@\S+\.\S+|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11,}\b/i.test(
          caption,
        )
      )
        throw new CommunityError(
          "Remova códigos, documentos e dados pessoais da legenda.",
        );
      if (
        (await db.communityMedia.count({
          where: {
            ownerId: actor.id,
            createdAt: { gt: new Date(Date.now() - 86400000) },
          },
        })) >= 100
      )
        throw new CommunityError("Limite diário de imagens atingido.", 429);
      const photos = await imageFiles(form, 1);
      if (photos.length !== 1)
        throw new CommunityError(
          "Selecione uma fotografia JPG, PNG ou WEBP de até 4 MB.",
        );
      try {
        contentId = await serial(async (tx) => {
          const current = await tx.order.findFirst({
            where: { id: orderId, userId: actor.id, status: "COLLECTED" },
            include: { share: true },
          });
          if (!current) throw new CommunityError("Pedido indisponível.", 403);
          if (current.share) return current.share.postId;
          const post = await tx.communityPost.create({
            data: {
              title: "Mais uma conquista no SSD VBJ2!",
              description:
                caption +
                "\nProduto resgatado: " +
                order.product.name +
                ".\nUma conquista com Amazonitos.",
              category: "Conquistas da operação",
              status: "PUBLISHED",
              visibility: "INTERNAL",
              authorId: actor.id,
              imageAuthorization: true,
              restrictedChecked: true,
              media: {
                create: photos.map((photo) => ({
                  ...photo,
                  ownerId: actor.id,
                })),
              },
              redemptionShare: { create: { orderId } },
            },
          });
          await tx.audit.create({
            data: {
              actorId: actor.id,
              action: "REDEMPTION_SHARE",
              details: post.id,
            },
          });
          return post.id;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const existing = await db.redemptionShare.findUnique({
            where: { orderId },
          });
          if (!existing) throw error;
          contentId = existing.postId;
        } else throw error;
      }
      message = "Conquista publicada no Mural SSD VBJ2!";
    } else if (
      ["remove-share", "report-share", "moderate-share"].includes(action)
    ) {
      const postId = text(form, "postId", 1, 100);
      const share = await db.redemptionShare.findUnique({
        where: { postId },
        include: { post: true },
      });
      if (!share) throw new CommunityError("Publicação indisponível.", 404);
      if (action === "remove-share" && share.post.authorId !== actor.id)
        throw new CommunityError("Esta publicação não pertence a você.", 403);
      if (action === "moderate-share" && actor.role !== "ADMIN")
        throw new CommunityError(
          "Somente administradores podem moderar esta conquista.",
          403,
        );
      if (action === "report-share") {
        if (share.post.status !== "PUBLISHED")
          throw new CommunityError("Publicação indisponível.", 404);
        const reason = text(form, "reason", 5, 500);
        await serial(async (tx) => {
          await tx.redemptionReport.upsert({
            where: { postId_reporterId: { postId, reporterId: actor.id } },
            create: { postId, reporterId: actor.id, reason },
            update: { reason },
          });
          await tx.audit.create({
            data: {
              actorId: actor.id,
              action: "REDEMPTION_REPORT",
              details: postId,
            },
          });
        });
        message = "Denúncia registrada para análise administrativa.";
      } else {
        await serial(async (tx) => {
          await tx.communityPost.update({
            where: { id: postId },
            data: { status: "ARCHIVED" },
          });
          await tx.audit.create({
            data: {
              actorId: actor.id,
              action:
                action === "remove-share"
                  ? "REDEMPTION_REMOVE"
                  : "REDEMPTION_MODERATE",
              details: postId,
            },
          });
        });
        message = "Publicação removida do mural. O resgate foi preservado.";
      }
    } else throw new CommunityError("Ação inválida.");
    revalidatePath("/", "layout");
    return Response.json({ message, contentId }, { headers });
  } catch (error) {
    if (error instanceof CommunityError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      {
        error:
          "Não foi possível concluir. Confira os dados e atualize a página.",
      },
      { status: 400, headers },
    );
  }
}

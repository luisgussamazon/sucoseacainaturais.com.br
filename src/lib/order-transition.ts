import type { Prisma } from "@prisma/client";
// Callers enforce authorization. Transition, refund (only cancellation) and audit are atomic.
export async function finalizeOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  status: "COLLECTED" | "CANCELLED",
  actor: { id: string; name: string },
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { allocations: true },
  });
  const changed = await tx.order.updateMany({
    where: { id: order.id, status: "RESERVED" },
    data: {
      status,
      ...(status === "COLLECTED"
        ? {
            collectedAt: new Date(),
            collectedById: actor.id,
            collectedByName: actor.name,
          }
        : { cancelledAt: new Date(), cancelledByName: actor.name }),
    },
  });
  if (!changed.count) throw new Error("Pedido já finalizado.");
  if (status === "CANCELLED") {
    for (const a of order.allocations)
      await tx.batch.update({
        where: { id: a.batchId },
        data: { quantity: { increment: a.quantity } },
      });
    await tx.user.update({
      where: { id: order.userId },
      data: { balance: { increment: order.cost } },
    });
    await tx.ledger.create({
      data: {
        userId: order.userId,
        amount: order.cost,
        description: `Estorno ${order.id}`,
      },
    });
  }
  await tx.audit.create({
    data: { actorId: actor.id, action: status, details: order.id },
  });
}

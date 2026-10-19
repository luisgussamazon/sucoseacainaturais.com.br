"use server";
import { resolveProductPhoto, ProductPhotoError } from "./product-photo";
import { demand } from "./community";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "./db";
import { requireRole, requireUser } from "./auth";
import { allocateFEFO, digest, hashPassword, verifyPassword } from "./security";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const positive = z.coerce.number().int().min(1).max(100000);
async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let n = 0; n < 4; n++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        n < 3
      )
        continue;
      throw e;
    }
  }
  throw new Error("Tente novamente.");
}
export async function login(f: FormData) {
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "");
  if (!z.email().safeParse(email).success || password.length > 128)
    redirect("/login?error=invalid");
  const key = digest(email);
  const now = new Date();
  const attempt = await db.loginAttempt.upsert({
    where: { key },
    create: { key, count: 1, resetAt: new Date(Date.now() + 15 * 60000) },
    update: { count: { increment: 1 } },
  });
  if (attempt.resetAt < now)
    await db.loginAttempt.update({
      where: { key },
      data: { count: 1, resetAt: new Date(Date.now() + 15 * 60000) },
    });
  else if (attempt.count > 10) redirect("/login?error=rate");
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active || !verifyPassword(password, user.passwordHash))
    redirect("/login?error=invalid");
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: digest(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  await db.loginAttempt.delete({ where: { key } }).catch(() => {});
  (await cookies()).set("amazonitos_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  redirect("/");
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("amazonitos_session")?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  jar.delete("amazonitos_session");
  redirect("/login");
}
export async function redeem(f: FormData) {
  const user = await requireUser();
  const productId = str(f, "productId");
  const quantity = positive.parse(f.get("quantity"));
  let failed = false;
  try {
    await transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
      });
      if (!product.active) throw new Error("Indisponível");
      const cost = product.price * quantity;
      const debit = await tx.user.updateMany({
        where: { id: user.id, active: true, balance: { gte: cost } },
        data: { balance: { decrement: cost } },
      });
      if (debit.count !== 1) throw new Error("Saldo insuficiente");
      const batches = await tx.batch.findMany({
        where: {
          productId,
          expiresAt: { gt: new Date() },
          quantity: { gt: 0 },
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      });
      const allocations = allocateFEFO(batches, quantity);
      for (const item of allocations) {
        const updated = await tx.batch.updateMany({
          where: { id: item.batchId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (!updated.count) throw new Error("Estoque alterado");
      }
      const order = await tx.order.create({
        data: {
          userId: user.id,
          productId,
          quantity,
          cost,
          allocations: { create: allocations },
        },
      });
      await tx.ledger.create({
        data: {
          userId: user.id,
          amount: -cost,
          description: `Resgate ${product.name} · ${order.id}`,
        },
      });
      await tx.audit.create({
        data: { actorId: user.id, action: "REDEEM", details: order.id },
      });
    });
  } catch {
    failed = true;
  }
  revalidatePath("/", "layout");
  redirect(failed ? "/loja?error=redeem" : "/resgates?success=1");
}
export async function completeMission(f: FormData) {
  const user = await requireUser();
  let failed = false;
  try {
    await transaction(async (tx) => {
      const mission = await tx.mission.findUniqueOrThrow({
        where: { id: str(f, "missionId") },
        include: { photoConfig: true },
      });
      if (
        !!mission.photoConfig ||
        !mission.active ||
        mission.endsAt < new Date() ||
        mission.answer !==
          z.coerce
            .number()
            .int()
            .min(0)
            .max(2)
            .parse(z.string().min(1).parse(f.get("answer")))
      )
        throw new Error("Resposta inválida");
      await tx.completion.create({
        data: { userId: user.id, missionId: mission.id },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { increment: mission.reward } },
      });
      await tx.ledger.create({
        data: {
          userId: user.id,
          amount: mission.reward,
          description: `Missão: ${mission.title}`,
        },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "MISSION_COMPLETE",
          details: mission.id,
        },
      });
    });
  } catch {
    failed = true;
  }
  revalidatePath("/", "layout");
  redirect(failed ? "/missoes?error=mission" : "/missoes?success=1");
}
export async function grantCoins(f: FormData) {
  const actor = await requireRole(["HR", "ADMIN"]);
  const amount = positive.parse(f.get("amount"));
  const description = z.string().min(5).max(300).parse(str(f, "description"));
  await transaction(async (tx) => {
    const target = await tx.user.findFirstOrThrow({
      where: { id: str(f, "userId"), active: true },
    });
    await tx.user.update({
      where: { id: target.id },
      data: { balance: { increment: amount } },
    });
    await tx.ledger.create({
      data: { userId: target.id, amount, description },
    });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: "GRANT_COINS",
        details: JSON.stringify({ userId: target.id, amount, description }),
      },
    });
  });
  revalidatePath("/", "layout");
}
export async function createUser(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const name = z.string().min(2).max(100).parse(str(f, "name"));
  const email = z.email().parse(str(f, "email").toLowerCase());
  const password = z.string().min(12).max(128).parse(str(f, "password"));
  const role = z.enum(["EMPLOYEE", "HR", "ADMIN"]).parse(str(f, "role"));
  await transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, role, passwordHash: hashPassword(password) },
    });
    await tx.audit.create({
      data: { actorId: actor.id, action: "CREATE_USER", details: user.id },
    });
  });
  revalidatePath("/admin");
}
export async function createProduct(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const name = z.string().min(2).max(100).parse(str(f, "name"));
  const description = z.string().min(5).max(1000).parse(str(f, "description"));
  const category = z.string().min(2).max(60).parse(str(f, "category"));
  const imageUrl = await resolveProductPhoto(f);
  const price = positive.parse(f.get("price"));
  await transaction(async (tx) => {
    const product = await tx.product.create({
      data: { name, description, category, imageUrl, price },
    });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: "CREATE_PRODUCT",
        details: product.id,
      },
    });
  });
  revalidatePath("/", "layout");
}
export async function createBatch(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const quantity = positive.parse(f.get("quantity"));
  const code = z.string().min(2).max(80).parse(str(f, "code"));
  const expiresAt = z.coerce
    .date()
    .refine((d) => d > new Date())
    .parse(`${str(f, "expiresAt")}-03:00`);
  await transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: { productId: str(f, "productId"), quantity, code, expiresAt },
    });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: "STOCK_ENTRY",
        details: JSON.stringify({ batchId: batch.id, quantity }),
      },
    });
  });
  revalidatePath("/", "layout");
}
export async function createMission(f: FormData) {
  const session = await requireUser();
  const actor = await db.user.findUniqueOrThrow({
    where: { id: session.id },
    include: { communityGrant: true },
  });
  demand(actor, "missions");
  const title = z.string().min(3).max(100).parse(str(f, "title"));
  const description = z.string().min(5).max(1000).parse(str(f, "description"));
  const question = z.string().min(5).max(300).parse(str(f, "question"));
  const options = z
    .array(z.string().min(1).max(200))
    .length(3)
    .parse([str(f, "option0"), str(f, "option1"), str(f, "option2")]);
  const answer = z.coerce.number().int().min(0).max(2).parse(f.get("answer"));
  const reward = positive.parse(f.get("reward"));
  const endsAt = z.coerce
    .date()
    .refine((d) => d > new Date())
    .parse(`${str(f, "endsAt")}-03:00`);
  await transaction(async (tx) => {
    const mission = await tx.mission.create({
      data: { title, description, question, options, answer, reward, endsAt },
    });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: "CREATE_CAMPAIGN",
        details: mission.id,
      },
    });
  });
  revalidatePath("/", "layout");
}
export async function updateOrder(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const status = z.enum(["COLLECTED", "CANCELLED"]).parse(f.get("status"));
  await transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: str(f, "orderId") },
      include: { allocations: true },
    });
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: "RESERVED" },
      data: { status },
    });
    if (!changed.count) throw new Error("Pedido já finalizado");
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
  });
  revalidatePath("/", "layout");
}
export async function updateUser(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const id = str(f, "userId");
  if (id === actor.id)
    throw new Error("Não é permitido alterar seu próprio acesso.");
  const role = z.enum(["EMPLOYEE", "HR", "ADMIN"]).parse(f.get("role"));
  const active = f.get("active") === "true";
  await transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { role, active } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: "UPDATE_ACCESS",
        details: JSON.stringify({ id, role, active }),
      },
    });
  });
  revalidatePath("/admin");
}

export async function changePassword(f: FormData) {
  const user = await requireUser();
  const current = String(f.get("currentPassword") ?? "");
  const password = z.string().min(12).max(128).parse(f.get("password"));
  if (!verifyPassword(current, user.passwordHash)) redirect("/perfil?error=1");
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: "CHANGE_PASSWORD",
        details: "Sessões revogadas",
      },
    });
  });
  (await cookies()).delete("amazonitos_session");
  redirect("/login");
}
export async function resetPassword(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const id = str(f, "userId");
  if (id === actor.id)
    throw new Error("Use Meu acesso para sua própria senha.");
  const password = z.string().min(12).max(128).parse(f.get("password"));
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash: hashPassword(password) },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.audit.create({
      data: { actorId: actor.id, action: "RESET_PASSWORD", details: id },
    });
  });
  revalidatePath("/admin");
}
export async function updateProduct(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const id = str(f, "productId");
  const name = z.string().min(2).max(100).parse(str(f, "name"));
  const description = z.string().min(5).max(1000).parse(str(f, "description"));
  const category = z.string().min(2).max(60).parse(str(f, "category"));
  const existing = await db.product.findUniqueOrThrow({
    where: { id },
    select: { imageUrl: true },
  });
  const imageUrl = await resolveProductPhoto(f, existing.imageUrl);
  const price = positive.parse(f.get("price"));
  const active = f.get("active") === "true";
  await transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: { name, description, category, imageUrl, price, active },
    });
    await tx.audit.create({
      data: { actorId: actor.id, action: "UPDATE_PRODUCT", details: id },
    });
  });
  revalidatePath("/", "layout");
}
export async function closeMission(f: FormData) {
  const session = await requireUser();
  const actor = await db.user.findUniqueOrThrow({
    where: { id: session.id },
    include: { communityGrant: true },
  });
  demand(actor, "missions");
  const id = str(f, "missionId");
  await transaction(async (tx) => {
    await tx.mission.update({ where: { id }, data: { active: false } });
    await tx.audit.create({
      data: { actorId: actor.id, action: "CLOSE_CAMPAIGN", details: id },
    });
  });
  revalidatePath("/", "layout");
}
export async function adjustStock(f: FormData) {
  const actor = await requireRole(["ADMIN"]);
  const id = str(f, "batchId");
  const delta = z.coerce
    .number()
    .int()
    .min(-100000)
    .max(100000)
    .refine((v) => v !== 0)
    .parse(f.get("delta"));
  const reason = z.string().min(5).max(300).parse(str(f, "reason"));
  await transaction(async (tx) => {
    const batch = await tx.batch.findUniqueOrThrow({ where: { id } });
    if (batch.quantity + delta < 0)
      throw new Error("Quantidade resultante não pode ser negativa");
    await tx.batch.update({
      where: { id },
      data: { quantity: { increment: delta } },
    });
    await tx.audit.create({
      data: {
        actorId: actor.id,
        action: "STOCK_ADJUSTMENT",
        details: JSON.stringify({ batchId: id, delta, reason }),
      },
    });
  });
  revalidatePath("/", "layout");
}

export async function saveProduct(
  form: FormData,
): Promise<{ error?: string; success?: string }> {
  await requireRole(["ADMIN"]);
  try {
    if (str(form, "productId")) await updateProduct(form);
    else await createProduct(form);
    return { success: "Produto salvo com sucesso." };
  } catch (error) {
    if (error instanceof ProductPhotoError) return { error: error.message };
    if (error instanceof z.ZodError)
      return {
        error:
          "Revise os campos obrigatórios, o preço e os limites do cadastro.",
      };
    return { error: "Não foi possível salvar o produto. Tente novamente." };
  }
}

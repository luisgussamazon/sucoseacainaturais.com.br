import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
const db = new PrismaClient();
try {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (
    !email ||
    !email.includes("@") ||
    !password ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error(
      "Defina as variáveis de administrador no ambiente; senha de 12 a 128 caracteres.",
    );
  const salt = randomBytes(16).toString("hex");
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Administrador",
      role: "ADMIN",
      passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
    },
  });
  console.log(
    "Administrador inicial disponível. Valores de credenciais não foram exibidos.",
  );
} catch {
  console.error(
    "Não foi possível criar o administrador. Confira as variáveis de ambiente e a conexão ao banco.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

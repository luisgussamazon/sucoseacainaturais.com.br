import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security";
const db = new PrismaClient();
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 12 caracteres) no ambiente.",
    );
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Administrador",
      role: "ADMIN",
      passwordHash: hashPassword(password),
    },
  });
  console.log("Administrador inicial disponível. Nenhuma senha foi exibida.");
}
main()
  .catch(() => {
    console.error("Falha no seed. Confira as variáveis e a conexão ao banco.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

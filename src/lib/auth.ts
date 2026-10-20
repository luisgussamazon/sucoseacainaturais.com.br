import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { digest } from "./security";
export async function currentUser({ allowTemporary = false } = {}) {
  const token = (await cookies()).get("amazonitos_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  return session &&
    session.expiresAt > new Date() &&
    session.user.active &&
    (allowTemporary || !session.user.mustChangePassword)
    ? session.user
    : null;
}
export async function requireUser() {
  const user = await currentUser({ allowTemporary: true });
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/alterar-senha-inicial");
  return user;
}
export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("Acesso não autorizado.");
  return user;
}

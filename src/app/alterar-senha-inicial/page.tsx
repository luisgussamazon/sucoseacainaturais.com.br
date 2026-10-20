import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InitialPassword } from "@/components/initial-password";
import { logout } from "@/lib/actions";
export const dynamic = "force-dynamic";
export default async function InitialPasswordPage() {
  const user = await currentUser({ allowTemporary: true });
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");
  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 20 }}>
      <section className="panel">
        <p className="eyebrow">SSD VBJ2 · PRIMEIRO ACESSO</p>
        <h1>Defina sua senha pessoal</h1>
        <p>
          Substitua a senha temporária antes de acessar a plataforma. Use de 12
          a 128 caracteres. Depois, entre novamente com sua nova senha.
        </p>
        <InitialPassword />
        <form action={logout}>
          <button className="button secondary">Sair</button>
        </form>
      </section>
    </main>
  );
}

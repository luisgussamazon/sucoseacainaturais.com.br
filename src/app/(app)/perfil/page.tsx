import { requireUser } from "@/lib/auth";
import { changePassword } from "@/lib/actions";
import { PageTitle, Field } from "@/components/ui";
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const u = await requireUser();
  return (
    <>
      <PageTitle
        eyebrow="PRIVACIDADE E SEGURANÇA"
        title="Meu acesso"
        description={`${u.name} · ${u.email}`}
      />
      <section className="panel" style={{ maxWidth: 520 }}>
        <h2>Alterar senha</h2>
        <p className="muted">
          Use pelo menos 12 caracteres. Ao salvar, todas as suas sessões serão
          encerradas.
        </p>
        {(await searchParams).error && (
          <div className="notice error">A senha atual está incorreta.</div>
        )}
        <form action={changePassword} className="form-stack">
          <Field label="Senha atual" name="currentPassword" type="password" />
          <Field label="Nova senha" name="password" type="password" />
          <button className="button">Salvar nova senha</button>
        </form>
      </section>
    </>
  );
}

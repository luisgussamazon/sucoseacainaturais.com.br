import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import {
  UserRound,
  Mail,
  ShieldCheck,
  CalendarDays,
  CheckCircle,
} from "lucide-react";
import styles from "@/components/profile.module.css";
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
        title="Meu perfil"
        description="Sua identidade e suas informações de acesso ao SSD VBJ2."
      />
      <div className={styles.grid}>
        <ProfilePhotoEditor
          id={u.id}
          name={u.name}
          avatarUpdatedAt={u.avatarUpdatedAt?.toISOString() ?? null}
        />
        <section className={styles.card}>
          <h2>Informações da conta</h2>
          <p className="muted">
            Dados informativos. Permissões são gerenciadas pela Administração.
          </p>
          <dl className={styles.info}>
            {[
              { label: "Nome completo", value: u.name, Icon: UserRound },
              { label: "E-mail corporativo", value: u.email, Icon: Mail },
              {
                label: "Perfil de acesso",
                value:
                  u.role === "ADMIN"
                    ? "Administrador"
                    : u.role === "HR"
                      ? "RH"
                      : "Colaborador",
                Icon: ShieldCheck,
              },
              {
                label: "Conta criada em",
                value: u.createdAt.toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                }),
                Icon: CalendarDays,
              },
              {
                label: "Situação da conta",
                value: u.active ? "Ativa" : "Inativa",
                Icon: CheckCircle,
              },
            ].map(({ label, value, Icon }) => (
              <div className={styles.item} key={label}>
                <dt>
                  <Icon size={16} />
                  {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section
        id="alterar-senha"
        className={styles.card + " " + styles.password}
        style={{ maxWidth: 650 }}
      >
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

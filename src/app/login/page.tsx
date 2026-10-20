import { PasswordInput } from "@/components/password-input";
import { InstallApp } from "@/components/pwa-provider";
import { Brand } from "@/components/brand";
import { login } from "@/lib/actions";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Leaf, ArrowRight, ShieldCheck } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sessionUser = await currentUser({ allowTemporary: true });
  if (sessionUser)
    redirect(sessionUser.mustChangePassword ? "/alterar-senha-inicial" : "/");
  const { error } = await searchParams;
  return (
    <div className="login-shell">
      <section className="login-story">
        <div className="brand">
          <Brand />
        </div>
        <div>
          <div className="hero-tag">
            <Leaf size={16} />
            CADA CONQUISTA VALE MAIS
          </div>
          <h1>
            Reconhecer pessoas.
            <br />
            Transformar escolhas.
          </h1>
          <p>
            Seu espaço para conquistar recompensas,
            <br />
            aproveitar oportunidades e fazer a diferença.
          </p>
          <div className="login-coin" aria-hidden="true">
            a
          </div>
        </div>
        <small>Amazonitos: moeda fictícia, sem valor monetário real.</small>
      </section>
      <section className="login-form">
        <div className="eyebrow">BEM-VINDO AO SSD VBJ2</div>
        <h2>
          Seu próximo passo
          <br />
          começa aqui.
        </h2>
        <p className="muted">Entre com o acesso fornecido pela sua equipe.</p>
        {error && (
          <div className="notice error" role="alert">
            {error === "rate"
              ? "Muitas tentativas. Aguarde 15 minutos."
              : "E-mail ou senha inválidos."}
          </div>
        )}
        <form action={login}>
          <label className="field">
            E-mail corporativo
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="voce@empresa.com.br"
            />
          </label>
          <label className="field">
            Senha
            <PasswordInput
              name="password"
              autoComplete="current-password"
              required
              maxLength={128}
              placeholder="Sua senha"
            />
          </label>
          <button className="button full" type="submit">
            Entrar na minha conta
            <ArrowRight size={18} />
          </button>
        </form>
        <InstallApp />
        <p className="login-help">
          <ShieldCheck size={16} /> Precisa de acesso? Fale com o administrador.
        </p>
      </section>
    </div>
  );
}

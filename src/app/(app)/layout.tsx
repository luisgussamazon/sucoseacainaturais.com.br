import { MobileNavigation } from "@/components/mobile-navigation";
import { Brand } from "@/components/brand";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Navigation } from "@/components/navigation";
import { logout } from "@/lib/actions";
import { LogOut, Coins } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Navigation role={user.role} />
        <div className="sidebar-footer">FEITO PARA QUEM FAZ A DIFERENÇA</div>
      </aside>
      <MobileNavigation role={user.role} />
      <div className="workspace">
        <header className="topbar">
          <Link href="/" className="brand header-brand">
            <Brand />
          </Link>
          <div className="workspace-label">
            Programa de reconhecimento <span>•</span> Colaboradores
          </div>
          <div className="topbar-right">
            <Link className="balance-pill" href="/carteira">
              <Coins size={18} />
              {user.balance.toLocaleString("pt-BR")} <span>Amazonitos</span>
            </Link>
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="profile">
              <strong>{user.name}</strong>
              <small>
                {user.role === "ADMIN"
                  ? "Administrador"
                  : user.role === "HR"
                    ? "Recursos Humanos"
                    : "Colaborador"}
              </small>
            </div>
            <form action={logout}>
              <button className="icon-button" title="Sair" aria-label="Sair">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main>{children}</main>
        <footer className="page-footer">
          <span>© {new Date().getFullYear()} SSD VBJ2</span>
          <span>
            Amazonitos são moedas fictícias, sem valor monetário real.
          </span>
        </footer>
      </div>
    </div>
  );
}

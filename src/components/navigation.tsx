"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Wallet,
  Sparkles,
  PackageCheck,
  Users,
  Settings,
  Leaf,
  ChartNoAxesCombined,
  Boxes,
} from "lucide-react";
const links = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/loja", label: "SSD VBJ2", icon: ShoppingBag },
  { href: "/carteira", label: "Minha carteira", icon: Wallet },
  { href: "/missoes", label: "Missões e quizzes", icon: Sparkles },
  { href: "/resgates", label: "Meus resgates", icon: PackageCheck },
];
export function Navigation({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <>
      <div className="nav-caption">SEU ESPAÇO</div>
      <nav>
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            className={pathname === href ? "nav-link active" : "nav-link"}
            href={href}
            key={href}
          >
            <Icon size={19} />
            {label}
            {href === "/loja" && <span className="nav-dot" />}
          </Link>
        ))}
      </nav>
      {role !== "EMPLOYEE" && (
        <>
          <div className="nav-caption">GESTÃO</div>
          <nav>
            <Link
              className={`nav-link ${pathname === "/rh" ? "active" : ""}`}
              href="/rh"
            >
              <Users size={19} />
              Pessoas e campanhas
            </Link>
            <Link
              className={`nav-link ${pathname === "/relatorios" ? "active" : ""}`}
              href="/relatorios"
            >
              <ChartNoAxesCombined size={19} />
              Relatórios
            </Link>
            {role === "ADMIN" && (
              <>
                <Link
                  className={`nav-link ${pathname === "/estoque" ? "active" : ""}`}
                  href="/estoque"
                >
                  <Boxes size={19} />
                  Estoque e lotes
                </Link>
                <Link
                  className={`nav-link ${pathname === "/admin" ? "active" : ""}`}
                  href="/admin"
                >
                  <Settings size={19} />
                  Administração
                </Link>
              </>
            )}
          </nav>
        </>
      )}
      <Link
        className={`nav-link ${pathname === "/perfil" ? "active" : ""}`}
        href="/perfil"
      >
        <Settings size={19} />
        Meu acesso
      </Link>
      <div className="sidebar-purpose">
        <Leaf size={24} />
        <strong>
          Pequenas escolhas.
          <br />
          Grandes impactos.
        </strong>
        <p>
          Menos desperdício,
          <br />
          mais possibilidades.
        </p>
      </div>
    </>
  );
}

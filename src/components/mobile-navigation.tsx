"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  X,
  House,
  ShoppingBag,
  Wallet,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Navigation } from "./navigation";
import { InstallApp } from "./pwa-provider";
const tabs = [
  { href: "/", label: "Início", Icon: House },
  { href: "/loja", label: "Loja", Icon: ShoppingBag },
  { href: "/carteira", label: "Carteira", Icon: Wallet },
  { href: "/missoes", label: "Missões", Icon: Sparkles },
  { href: "/perfil", label: "Perfil", Icon: UserRound },
];
export function MobileNavigation({
  role,
  communityAccess = false,
}: {
  role: string;
  communityAccess?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const workspace =
      trigger.current
        ?.closest(".app-shell")
        ?.querySelector<HTMLElement>(":scope > .workspace") ?? null;
    const previousInert = workspace?.inert ?? false;
    if (workspace) workspace.inert = true;
    const panel = drawer.current;
    panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === "Tab" && panel) {
        const elements = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),[tabindex="0"]',
          ),
        ).filter((e) => e.offsetParent !== null);
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onResize = () => {
      if (window.innerWidth > 768) setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (workspace) workspace.inert = previousInert;
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", onResize);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <div className="mobile-controls">
      <button
        ref={trigger}
        className="mobile-menu-toggle"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
      >
        <Menu size={23} />
      </button>
      {open && (
        <div className="mobile-drawer-layer">
          <button
            className="mobile-backdrop"
            type="button"
            aria-label="Fechar menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <aside
            ref={drawer}
            id="mobile-menu"
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
          >
            <div className="mobile-drawer-heading">
              <h2 id="mobile-menu-title">Seu espaço SSD VBJ2</h2>
              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
              >
                <X size={22} />
              </button>
            </div>
            <div
              className="mobile-drawer-content"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a[href]"))
                  setOpen(false);
              }}
            >
              <Navigation role={role} communityAccess={communityAccess} />
            </div>
            <InstallApp />
          </aside>
        </div>
      )}
      <nav className="mobile-bottom-nav" aria-label="Navegação inferior">
        {tabs.map(({ href, label, Icon }) => (
          <Link
            href={href}
            key={href}
            className={pathname === href ? "mobile-tab active" : "mobile-tab"}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon size={21} strokeWidth={pathname === href ? 2.3 : 1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

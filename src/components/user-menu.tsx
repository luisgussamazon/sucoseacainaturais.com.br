"use client";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, UserRound, KeyRound, LogOut } from "lucide-react";
import { logout } from "@/lib/actions";
import { UserAvatar } from "./user-avatar";
import styles from "./profile.module.css";
export function UserMenu({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUpdatedAt: string | null;
  };
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const label =
    user.role === "ADMIN"
      ? "Administrador"
      : user.role === "HR"
        ? "RH"
        : "Colaborador";
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node))
        ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={ref}
      className={styles.menu}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          ref.current?.removeAttribute("open");
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Abrir menu do usuário">
        <UserAvatar {...user} size={38} />
        <span className={styles.triggerName}>
          <strong>{user.name}</strong>
          <small>{label}</small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className={styles.dropdown}>
        <div className={styles.menuIdentity}>
          <UserAvatar {...user} size={58} />
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <small>{label}</small>
          </div>
        </div>
        <Link
          href="/perfil"
          onClick={() => ref.current?.removeAttribute("open")}
        >
          <UserRound size={18} />
          Meu perfil
        </Link>
        <Link
          href="/perfil#alterar-senha"
          onClick={() => ref.current?.removeAttribute("open")}
        >
          <KeyRound size={18} />
          Alterar senha
        </Link>
        <form action={logout}>
          <button>
            <LogOut size={18} />
            Sair da conta
          </button>
        </form>
      </div>
    </details>
  );
}

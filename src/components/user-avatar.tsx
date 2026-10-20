"use client";
import { useEffect, useState } from "react";
export type AvatarIdentity = {
  id?: string;
  name: string;
  avatarUpdatedAt?: string | null;
};
export function UserAvatar({
  id,
  name,
  avatarUpdatedAt,
  size = 40,
  className,
}: {
  id?: string;
  name: string;
  avatarUpdatedAt?: string | null;
  size?: number;
  className?: string;
}) {
  const [override, setOverride] = useState<{ updatedAt: string | null } | null>(
      null,
    ),
    [failed, setFailed] = useState("");
  useEffect(() => {
    setOverride(null);
  }, [id, avatarUpdatedAt]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (
        event as CustomEvent<{ userId: string; avatarUpdatedAt: string | null }>
      ).detail;
      if (detail?.userId === id)
        setOverride({ updatedAt: detail.avatarUpdatedAt });
    };
    window.addEventListener("profile-photo:updated", refresh);
    return () => window.removeEventListener("profile-photo:updated", refresh);
  }, [id]);
  const version = override ? override.updatedAt : avatarUpdatedAt,
    src =
      id && version
        ? "/api/avatars/" +
          encodeURIComponent(id) +
          "?v=" +
          encodeURIComponent(version)
        : "";
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: "50%",
        background: "#ffecd0",
        color: "#97500b",
        fontSize: Math.max(10, size * 0.3),
        fontWeight: 700,
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      {src && failed !== src ? (
        <img
          src={src}
          alt={"Foto de " + name}
          width={size}
          height={size}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-label={"Iniciais de " + name}>
          {name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}

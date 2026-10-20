"use client";
import { useState } from "react";
import { PasswordInput } from "./password-input";
export function InitialPassword() {
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/initial-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: f.get("password"),
              confirmation: f.get("confirmation"),
            }),
            cache: "no-store",
          });
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          location.assign("/login");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha de conexão.");
          setPending(false);
        }
      }}
    >
      <label className="field">
        Nova senha
        <PasswordInput
          name="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label className="field">
        Confirme a nova senha
        <PasswordInput
          name="confirmation"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <button className="button" disabled={pending}>
        {pending ? "Salvando…" : "Salvar senha e entrar novamente"}
      </button>
    </form>
  );
}

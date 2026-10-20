"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csvCell, type EmployeeRow } from "@/lib/employee-csv";
type ReportRow = EmployeeRow & { temporaryPassword?: string };
export function EmployeeImport() {
  const [file, setFile] = useState<File | null>(null),
    [rows, setRows] = useState<ReportRow[]>([]),
    [token, setToken] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [done, setDone] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const clear = () =>
      setRows((rs) => rs.map(({ temporaryPassword, ...row }) => row));
    const navigation = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a[href]:not([download])")
      )
        clear();
    };
    window.addEventListener("pagehide", clear);
    document.addEventListener("submit", clear, true);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("submit", clear, true);
      document.removeEventListener("click", navigation, true);
    };
  }, []);
  async function send(action: string) {
    if (!file || pending) return;
    setPending(true);
    setError("");
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("action", action);
      if (action === "confirm") {
        f.set("token", token);
        f.set("confirmed", String(confirmed));
      }
      const r = await fetch("/api/admin/employee-import", {
        method: "POST",
        body: f,
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRows(d.rows);
      setToken(d.token ?? "");
      setDone(action === "confirm");
      setConfirmed(false);
      if (action === "confirm") router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão.");
    } finally {
      setPending(false);
    }
  }
  function download() {
    const created = rows.filter((r) => r.temporaryPassword);
    const csv =
      "\uFEFFnome,email,senha_temporaria\r\n" +
      created
        .map((r) =>
          [r.name, r.email, r.temporaryPassword!].map(csvCell).join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "SSD-VBJ2-credenciais-privadas.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const counts = {
    created: rows.filter((r) => r.status === "NEW").length,
    existing: rows.filter((r) => r.status === "EXISTS").length,
    invalid: rows.filter((r) => r.status === "INVALID").length,
  };
  return (
    <section className="panel" aria-label="Importação de colaboradores">
      <h2>Importar colaboradores por CSV</h2>
      <p>
        CSV UTF-8 com nome, email e perfil. Todas as novas contas terão perfil
        COLABORADOR, saldo zero e troca obrigatória da senha temporária. Contas
        existentes serão preservadas.
      </p>
      <div className="form-stack">
        <label className="field">
          Arquivo CSV (até 256 KB)
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={pending}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows([]);
              setToken("");
              setDone(false);
              setConfirmed(false);
              setError("");
            }}
          />
        </label>
        <button
          className="button"
          disabled={!file || pending}
          onClick={() => send("preview")}
        >
          {pending ? "Processando…" : "Gerar prévia"}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <h3>
            {done
              ? "Relatório da importação"
              : "Prévia — nenhum cadastro realizado"}
          </h3>
          <p role="status">
            {counts.created} {done ? "criadas" : "novas"} · {counts.existing}{" "}
            {done ? "ignoradas" : "existentes"} · {counts.invalid} inválidas
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      {r.reason ??
                        (r.status === "NEW"
                          ? done
                            ? "Criada como colaborador"
                            : "Novo cadastro"
                          : r.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!done && (
            <div className="form-stack">
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={pending}
                />{" "}
                Conferi a prévia e autorizo criar somente as novas contas
                válidas.
              </label>
              <button
                className="button"
                disabled={!confirmed || !counts.created || pending}
                onClick={() => send("confirm")}
              >
                Confirmar importação de {counts.created} colaboradores
              </button>
            </div>
          )}
          {done && counts.created > 0 && (
            <div className="notice">
              <p>
                As senhas individuais estão disponíveis somente nesta tela.
                Baixe o arquivo privado e distribua cada acesso de forma
                reservada. Não compartilhe a lista completa com os
                colaboradores.
              </p>
              <button
                className="button"
                disabled={!rows.some((r) => r.temporaryPassword)}
                onClick={download}
              >
                Baixar credenciais privadas (.csv)
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  setRows((rs) => rs.map(({ temporaryPassword, ...r }) => r))
                }
              >
                Limpar senhas desta tela
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

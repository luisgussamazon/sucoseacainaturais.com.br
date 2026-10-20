import { z } from "zod";
export const CSV_MAX_BYTES = 256 * 1024;
export type EmployeeRow = {
  line: number;
  name: string;
  email: string;
  status: "NEW" | "EXISTS" | "INVALID";
  reason?: string;
};
export class ImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function parseEmployeeCsv(input: string): EmployeeRow[] {
  if (new TextEncoder().encode(input).length > CSV_MAX_BYTES)
    throw new ImportError("CSV acima de 256 KB.");
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = first.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"') {
      if (field || closed) throw new ImportError("Aspas inválidas no CSV.");
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      field = "";
      closed = false;
      if (rows.length > 501)
        throw new ImportError("Limite de 500 colaboradores por arquivo.");
    } else {
      if (closed) throw new ImportError("Conteúdo após fechamento de aspas.");
      field += c;
    }
  }
  if (quoted) throw new ImportError("Aspas não fechadas no CSV.");
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const header = rows.shift()?.map((h) => h.trim().toLowerCase());
  if (
    !header ||
    new Set(header).size !== header.length ||
    !header.includes("nome") ||
    !header.some((h) => h === "email" || h === "e-mail")
  )
    throw new ImportError(
      "Cabeçalho obrigatório: nome,email,perfil. Perfil é opcional e aceita somente COLABORADOR ou EMPLOYEE.",
    );
  if (!rows.length || rows.length > 500)
    throw new ImportError("Envie entre 1 e 500 colaboradores.");
  const names = header.indexOf("nome"),
    emails = header.findIndex((h) => h === "email" || h === "e-mail"),
    roles = header.indexOf("perfil"),
    seen = new Set<string>();
  return rows.map((values, i) => {
    const name = values[names] ?? "",
      email = values[emails] ?? "",
      role =
        roles < 0 ? "EMPLOYEE" : (values[roles] ?? "").trim().toUpperCase();
    let reason = "";
    if (values.length !== header.length)
      reason = "Quantidade de colunas inválida.";
    else if (
      name.trim().length < 2 ||
      name.length > 150 ||
      /[\x00-\x1f\x7f]/.test(name)
    )
      reason = "Nome inválido.";
    else if (
      email !== email.trim() ||
      email.length > 254 ||
      !z.email().safeParse(email).success
    )
      reason = "E-mail inválido.";
    else if (!["EMPLOYEE", "COLABORADOR"].includes(role))
      reason = "O perfil deve ser COLABORADOR ou EMPLOYEE.";
    const key = email.toLowerCase();
    if (!reason && seen.has(key)) reason = "E-mail repetido no arquivo.";
    if (!reason) seen.add(key);
    return {
      line: i + 2,
      name,
      email,
      status: reason ? "INVALID" : "NEW",
      ...(reason ? { reason } : {}),
    };
  });
}
export const csvCell = (value: string) =>
  '"' +
  (/^[=+@\-\t\r]/.test(value) ? "'" : "") +
  value.replaceAll('"', '""') +
  '"';

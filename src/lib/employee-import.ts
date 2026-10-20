import { createHmac, randomBytes, timingSafeEqual, scrypt } from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt);
import { db } from "./db";
import { digest } from "./security";
import {
  ImportError,
  parseEmployeeCsv,
  type EmployeeRow,
} from "./employee-csv";
export function previewToken(
  csv: string,
  actorId: string,
  sessionKey: string,
  expires = Date.now() + 15 * 60000,
) {
  const payload = expires + ":" + actorId + ":" + digest(csv);
  return (
    expires +
    "." +
    createHmac("sha256", sessionKey).update(payload).digest("hex")
  );
}
export function verifyPreview(
  token: string,
  csv: string,
  actorId: string,
  sessionKey: string,
) {
  const [expiry, signature] = token.split(".");
  const expires = Number(expiry);
  if (
    !Number.isSafeInteger(expires) ||
    expires < Date.now() ||
    expires > Date.now() + 16 * 60000 ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature)
  )
    throw new ImportError("Prévia expirada ou inválida. Gere outra prévia.");
  const expected = previewToken(csv, actorId, sessionKey, expires).split(
    ".",
  )[1];
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    )
  )
    throw new ImportError("O arquivo mudou. Gere outra prévia.");
}
export async function previewEmployees(csv: string) {
  const rows = parseEmployeeCsv(csv),
    emails = rows.filter((r) => r.status === "NEW").map((r) => r.email);
  const existing = emails.length
    ? await db.user.findMany({
        where: {
          OR: emails.map((email) => ({
            email: { equals: email, mode: "insensitive" as const },
          })),
        },
        select: { email: true },
      })
    : [];
  const keys = new Set(existing.map((u) => u.email.toLowerCase()));
  return rows.map((r) =>
    r.status === "NEW" && keys.has(r.email.toLowerCase())
      ? {
          ...r,
          status: "EXISTS" as const,
          reason: "Conta existente; não será alterada.",
        }
      : r,
  );
}
export async function importEmployees(csv: string, actorId: string) {
  const rows = parseEmployeeCsv(csv);
  const prepared = rows.map((r) =>
    r.status === "NEW"
      ? { ...r, password: "Vbj2_" + randomBytes(18).toString("base64url") }
      : r,
  );
  const hashes = new Map(
    await Promise.all(
      prepared
        .filter((r) => "password" in r)
        .map(async (r) => {
          const salt = randomBytes(16).toString("hex"),
            hash = (await scryptAsync(
              (r as EmployeeRow & { password: string }).password,
              salt,
              64,
            )) as Buffer;
          return [r.line, salt + ":" + hash.toString("hex")] as const;
        }),
    ),
  );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2399956543::bigint)`;
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor?.active || actor.role !== "ADMIN" || actor.mustChangePassword)
        throw new ImportError("Acesso exclusivo do administrador.", 403);
      const emails = rows.filter((r) => r.status === "NEW").map((r) => r.email);
      const existing = emails.length
        ? await tx.user.findMany({
            where: {
              OR: emails.map((email) => ({
                email: { equals: email, mode: "insensitive" as const },
              })),
            },
            select: { email: true },
          })
        : [];
      const keys = new Set(existing.map((u) => u.email.toLowerCase()));
      const report: (EmployeeRow & { temporaryPassword?: string })[] = [];
      for (const row of prepared) {
        if (row.status === "INVALID") {
          report.push(row);
          continue;
        }
        if (keys.has(row.email.toLowerCase())) {
          report.push({
            line: row.line,
            name: row.name,
            email: row.email,
            status: "EXISTS",
            reason: "Conta existente; preservada integralmente.",
          });
          continue;
        }
        const created = await tx.user.createManyAndReturn({
          data: [
            {
              name: row.name,
              email: row.email,
              passwordHash: hashes.get(row.line)!,
              role: "EMPLOYEE",
              balance: 0,
              mustChangePassword: true,
            },
          ],
          skipDuplicates: true,
          select: { id: true },
        });
        if (!created.length) {
          report.push({
            line: row.line,
            name: row.name,
            email: row.email,
            status: "EXISTS",
            reason: "Conta já cadastrada durante a confirmação.",
          });
          continue;
        }
        keys.add(row.email.toLowerCase());
        await tx.audit.create({
          data: {
            actorId,
            action: "IMPORT_EMPLOYEE_CSV",
            details: JSON.stringify({
              userId: created[0].id,
              source: "ADMIN_CSV",
              mustChangePassword: true,
            }),
          },
        });
        report.push({
          line: row.line,
          name: row.name,
          email: row.email,
          status: "NEW",
          temporaryPassword: "password" in row ? row.password : undefined,
        });
      }
      await tx.audit.create({
        data: {
          actorId,
          action: "IMPORT_EMPLOYEE_CSV_SUMMARY",
          details: JSON.stringify({
            created: report.filter((r) => r.status === "NEW").length,
            ignored: report.filter((r) => r.status === "EXISTS").length,
            invalid: report.filter((r) => r.status === "INVALID").length,
          }),
        },
      });
      return report;
    },
    { timeout: 30000, maxWait: 15000 },
  );
}

import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function allocateFEFO(
  batches: { id: string; quantity: number }[],
  quantity: number,
) {
  let remaining = quantity;
  const result: { batchId: string; quantity: number }[] = [];
  for (const batch of batches) {
    const take = Math.min(batch.quantity, remaining);
    if (take > 0) result.push({ batchId: batch.id, quantity: take });
    remaining -= take;
    if (!remaining) break;
  }
  if (remaining > 0) throw new Error("Estoque insuficiente.");
  return result;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateFEFO,
  hashPassword,
  verifyPassword,
  digest,
} from "../src/lib/security";
test("FEFO utiliza os lotes na ordem de vencimento recebida", () =>
  assert.deepEqual(
    allocateFEFO(
      [
        { id: "primeiro", quantity: 2 },
        { id: "segundo", quantity: 5 },
      ],
      4,
    ),
    [
      { batchId: "primeiro", quantity: 2 },
      { batchId: "segundo", quantity: 2 },
    ],
  ));
test("estoque insuficiente impede alocação parcial", () =>
  assert.throws(() => allocateFEFO([{ id: "a", quantity: 1 }], 2)));
test("senha usa salt, valida a correta e rejeita senha incorreta", () => {
  const a = hashPassword("uma senha longa");
  assert.ok(verifyPassword("uma senha longa", a));
  assert.equal(verifyPassword("incorreta", a), false);
  assert.notEqual(a, hashPassword("uma senha longa"));
  assert.equal(digest("session").length, 64);
});

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { rights, readable, imageFiles, type Actor } from "../src/lib/community";
const actor = (
  role: "HR" | "EMPLOYEE" | "ADMIN",
  grant: Partial<NonNullable<Actor["communityGrant"]>> = {},
): Actor => ({
  id: "u",
  name: "Usuário",
  email: "qa@example.invalid",
  passwordHash: "unused",
  role,
  active: true,
  balance: 0,
  createdAt: new Date(),
  communityGrant: {
    userId: "u",
    assignedBy: "a",
    updatedAt: new Date(),
    leadership: false,
    publish: false,
    photos: false,
    albums: false,
    events: false,
    missions: false,
    recognize: false,
    review: false,
    moderate: false,
    ...grant,
  },
});
test("permissões individuais funcionam sem perfil RH e sem marcação de liderança", () => {
  for (const role of ["HR", "EMPLOYEE", "ADMIN"] as const) {
    const r = rights(
      actor(role, { publish: true, photos: true, review: true }),
    );
    assert.equal(r.publish, true);
    assert.equal(r.photos, true);
    assert.equal(r.review, true);
    assert.equal(r.albums, false);
  }
  assert.equal(rights(actor("EMPLOYEE", { leadership: true })).publish, false);
});
test("RH e administrador não recebem permissões de publicação automaticamente", () => {
  for (const role of ["HR", "ADMIN"] as const) {
    const r = rights(actor(role));
    assert.equal(r.publish, false);
    assert.equal(r.photos, false);
    assert.equal(r.recognize, false);
    assert.equal(r.review, false);
  }
  assert.equal(rights(actor("ADMIN")).manage, true);
});
test("publicação autenticada tem a mesma visibilidade para todos; rascunhos, agenda e legado privado não vazam", () => {
  for (const role of ["HR", "EMPLOYEE", "ADMIN"] as const) {
    const u = actor(role);
    assert.equal(
      readable(
        {
          status: "PUBLISHED",
          visibility: "INTERNAL",
          publishedAt: new Date(Date.now() - 1000),
        },
        u,
      ),
      true,
    );
    assert.equal(
      readable({ status: "DRAFT", visibility: "INTERNAL" }, u),
      false,
    );
    assert.equal(
      readable({ status: "PUBLISHED", visibility: "MANAGEMENT" }, u),
      false,
    );
    assert.equal(
      readable(
        {
          status: "PUBLISHED",
          visibility: "INTERNAL",
          publishedAt: new Date(Date.now() + 86400000),
        },
        u,
      ),
      false,
    );
  }
});
test("processamento preserva ordem e capa selecionadas sem metadados privados", async () => {
  const bytes = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "red" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const f = new FormData();
  for (let i = 0; i < 2; i++)
    f.append(
      "photos",
      new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" }),
    );
  f.set("coverIndex", "1");
  const result = await imageFiles(f);
  assert.deepEqual(
    result.map((p) => p.position),
    [0, 1],
  );
  assert.deepEqual(
    result.map((p) => p.cover),
    [false, true],
  );
  assert.equal(
    (await sharp(Buffer.from(result[0].bytes)).metadata()).exif,
    undefined,
  );
});
test("arquivo que finge ser imagem é rejeitado no servidor", async () => {
  const f = new FormData();
  f.append(
    "photos",
    new File(["<script>not an image</script>"], "fake.png", {
      type: "image/png",
    }),
  );
  await assert.rejects(() => imageFiles(f), /Foto inválida/);
});

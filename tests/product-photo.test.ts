import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  resolveProductPhoto,
  storedProductPhoto,
  productPhotoSrc,
} from "../src/lib/product-photo";
test("URLs HTTPS e fotos existentes permanecem compatíveis", async () => {
  const f = new FormData();
  f.set("imageUrl", "https://example.com/product.png");
  assert.equal(await resolveProductPhoto(f), "https://example.com/product.png");
  assert.equal(
    await resolveProductPhoto(new FormData(), "https://example.com/old.png"),
    "https://example.com/old.png",
  );
  assert.equal(
    productPhotoSrc({ id: "old", imageUrl: "https://example.com/old.png" }),
    "https://example.com/old.png",
  );
  await assert.rejects(resolveProductPhoto(new FormData()));
  f.set("imageUrl", "javascript:alert(1)");
  await assert.rejects(resolveProductPhoto(f));
});
test("JPG, PNG e WEBP reais são normalizados e persistidos sem metadados", async () => {
  for (const [format, mime] of [
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const) {
    const input = await sharp({
      create: { width: 120, height: 90, channels: 3, background: "#ff9900" },
    })
      [format]()
      .toBuffer();
    const f = new FormData();
    f.set(
      "productPhoto",
      new File([new Uint8Array(input)], "foto." + format, { type: mime }),
    );
    const stored = await resolveProductPhoto(f);
    assert.ok(storedProductPhoto(stored));
    const metadata = await sharp(
      Buffer.from(stored.split(",")[1], "base64"),
    ).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(await resolveProductPhoto(new FormData(), stored), stored);
    assert.match(
      productPhotoSrc({ id: "new", imageUrl: stored }),
      /^\/api\/products\/new\/image\?v=/,
    );
  }
});
test("Arquivos falsos, SVG e arquivos maiores que 4 MB são rejeitados", async () => {
  for (const file of [
    new File(["not an image"], "falso.png", { type: "image/png" }),
    new File(["<svg/>"], "icone.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "grande.jpg", {
      type: "image/jpeg",
    }),
  ]) {
    const f = new FormData();
    f.set("productPhoto", file);
    await assert.rejects(resolveProductPhoto(f));
  }
});

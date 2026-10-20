import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cropProfilePhoto } from "../src/lib/profile-photo";
test("JPG, PNG e WebP viram foto WebP 512 sem metadados", async () => {
  for (const [format, mime] of [
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const) {
    const b = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#ff9900" },
    })
      .toFormat(format)
      .withMetadata()
      .toBuffer();
    const result = await cropProfilePhoto(
      new File([new Uint8Array(b)], "foto", { type: mime }),
      0.5,
      0.5,
      1,
    );
    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
  }
});
test("Reposicionamento seleciona a região correta sem distorção", async () => {
  const raw = Buffer.alloc(200 * 100 * 3);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 200; x++) {
      raw[(y * 200 + x) * 3] = x < 100 ? 255 : 0;
      raw[(y * 200 + x) * 3 + 2] = x >= 100 ? 255 : 0;
    }
  const b = await sharp(raw, { raw: { width: 200, height: 100, channels: 3 } })
      .png()
      .toBuffer(),
    file = new File([new Uint8Array(b)], "foto.png", { type: "image/png" });
  for (const x of [0, 1]) {
    const bytes = await cropProfilePhoto(file, x, 0.5, 1),
      pixel = await sharp(bytes)
        .extract({ left: 256, top: 256, width: 1, height: 1 })
        .raw()
        .toBuffer();
    assert.ok(
      x === 0
        ? pixel[0] > 200 && pixel[2] < 30
        : pixel[2] > 200 && pixel[0] < 30,
    );
  }
});
test("Foto falsa, MIME incorreto, SVG e arquivo acima de 4 MB são recusados", async () => {
  for (const file of [
    new File(["not an image"], "foto.png", { type: "image/png" }),
    new File(["<svg/>"], "foto.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "grande.png", {
      type: "image/png",
    }),
  ])
    await assert.rejects(cropProfilePhoto(file, 0.5, 0.5, 1));
  const b = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    cropProfilePhoto(
      new File([new Uint8Array(b)], "falsa.jpg", { type: "image/jpeg" }),
      0.5,
      0.5,
      1,
    ),
  );
});
test("Recortes inválidos não alcançam o processamento", async () => {
  const file = new File(["fake"], "foto.png", { type: "image/png" });
  for (const [x, y, z] of [
    [-1, 0.5, 1],
    [0.5, 2, 1],
    [0.5, 0.5, 4],
    [NaN, 0.5, 1],
    [0.5, 0.5, 0],
  ])
    await assert.rejects(cropProfilePhoto(file, x, y, z));
});

test("Orientação EXIF do celular é aplicada antes do recorte", async () => {
  const raw = Buffer.alloc(300 * 200 * 3);
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 300; x++)
      raw[(y * 300 + x) * 3 + (x < 150 ? 0 : 2)] = 255;
  const bytes = await sharp(raw, {
      raw: { width: 300, height: 200, channels: 3 },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer(),
    file = new File([new Uint8Array(bytes)], "celular.jpg", {
      type: "image/jpeg",
    });
  for (const y of [0, 1]) {
    const result = await cropProfilePhoto(file, 0.5, y, 1),
      pixel = await sharp(result)
        .extract({ left: 256, top: 256, width: 1, height: 1 })
        .raw()
        .toBuffer();
    assert.ok(
      y === 0
        ? pixel[0] > 200 && pixel[2] < 30
        : pixel[2] > 200 && pixel[0] < 30,
    );
  }
});

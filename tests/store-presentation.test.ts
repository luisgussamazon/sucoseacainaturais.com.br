import test from "node:test";
import assert from "node:assert/strict";
import {
  mysteryTier,
  storePhotoSrc,
  productItemRange,
} from "../src/lib/store-presentation";
test("Apresentação de caixas reconhece apenas a coleção e extrai a faixa da descrição real", () => {
  assert.equal(
    mysteryTier({ name: "CAIXA MISTERIOSA MINI", category: "MINI" }),
    "MINI",
  );
  assert.equal(mysteryTier({ name: "Outro produto", category: "MINI" }), null);
  assert.equal(
    productItemRange(
      "Surpresa! Uma caixa contendo de 1 a 2 produtos alimentícios sortidos. Confira alergênicos.",
    ),
    "1 a 2 produtos alimentícios",
  );
  assert.equal(productItemRange("Produto normal"), undefined);
});
test("Novos uploads e URLs HTTPS permanecem prioritários após troca da foto cadastrada", () => {
  const p = {
    id: "new",
    name: "CAIXA MISTERIOSA MINI",
    category: "MINI",
    imageUrl: "https://example.com/new.png",
  };
  assert.equal(storePhotoSrc(p), p.imageUrl);
  assert.match(
    storePhotoSrc({ ...p, imageUrl: "data:image/webp;base64,bmV3LXBob3Rv" }),
    /^\/api\/products\/new\/image\?v=/,
  );
});

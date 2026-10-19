import { createHash } from "node:crypto";
import { productPhotoSrc } from "./product-photo";
const originalPhotos: Record<string, string> = {
  MINI: "2ba89c37b1c9dbb2dc064a0c7ebae826725c1afaf0b474247d0a5591808fe271",
  BRONZE: "753576ddb262d806a0d1f31b568ca2f11b3fe7d176d320a236f1d3c5bb9b7e06",
  PRATA: "3f7a7a23f92184d193c68cae29b353b93cb06184a3eb15f1194f6fad98a3a711",
  OURO: "a484c58686b1282c09815d64be2ca571f80db0c8b273ff1bde81cd49018a062b",
  PREMIUM: "5207f3a7ffdc98db63c2d43c4a53ee4bf44ac1f8f726d6c063a090825f5ef687",
  MASTER: "cbc517bbc4ca6c490b64a081e879a133ffca602663c365cd1ac6d0d870111741",
};
export const mysteryTiers = [
  "MINI",
  "BRONZE",
  "PRATA",
  "OURO",
  "PREMIUM",
  "MASTER",
] as const;
export function mysteryTier(product: { name: string; category: string }) {
  const category = product.category.toUpperCase();
  return mysteryTiers.includes(category as (typeof mysteryTiers)[number]) &&
    product.name.toUpperCase() === "CAIXA MISTERIOSA " + category
    ? category
    : null;
}
export function storePhotoSrc(product: {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
}) {
  const tier = mysteryTier(product);
  return tier &&
    originalPhotos[tier] ===
      createHash("sha256").update(product.imageUrl).digest("hex")
    ? "/images/store/" + tier.toLowerCase() + ".webp"
    : productPhotoSrc(product);
}
export function productItemRange(description: string) {
  return description.match(/\d+\s+a\s+\d+\s+produtos\s+aliment[íi]cios/i)?.[0];
}
export const storePriceRanges = {
  "up-to-20": { lte: 20 },
  "21-50": { gte: 21, lte: 50 },
  "over-50": { gt: 50 },
} as const;

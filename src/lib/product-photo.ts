import { createHash } from "node:crypto";
import sharp from "sharp";
export const PRODUCT_PHOTO_LIMIT = 4 * 1024 * 1024;
const prefix = "data:image/webp;base64,";
export class ProductPhotoError extends Error {}
export const storedProductPhoto = (value: string) => value.startsWith(prefix);
export function productPhotoSrc(product: { id: string; imageUrl: string }) {
  return storedProductPhoto(product.imageUrl)
    ? "/api/products/" +
        encodeURIComponent(product.id) +
        "/image?v=" +
        createHash("sha256").update(product.imageUrl).digest("hex").slice(0, 16)
    : product.imageUrl;
}
export async function resolveProductPhoto(form: FormData, current?: string) {
  const file = form.get("productPhoto");
  if (file instanceof File && file.size) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > PRODUCT_PHOTO_LIMIT
    )
      throw new ProductPhotoError("Selecione JPG, PNG ou WEBP de até 4 MB.");
    try {
      const input = Buffer.from(await file.arrayBuffer());
      const image = sharp(input, {
        limitInputPixels: 16000000,
        animated: false,
      });
      const meta = await image.metadata();
      const expected: Record<string, string> = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
      };
      if (meta.format !== expected[file.type] || (meta.pages ?? 1) > 1)
        throw new Error("Formato inválido");
      const bytes = await image
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
      if (bytes.length > 1024 * 1024) throw new Error("Imagem muito complexa");
      return prefix + bytes.toString("base64");
    } catch {
      throw new ProductPhotoError(
        "Imagem inválida. Use uma foto JPG, PNG ou WEBP de até 4 MB, sem animação e até 16 megapixels.",
      );
    }
  }
  const url = String(form.get("imageUrl") ?? "").trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        throw new Error();
      return parsed.href;
    } catch {
      throw new ProductPhotoError(
        "Informe uma URL HTTPS válida ou selecione uma imagem.",
      );
    }
  }
  if (current) return current;
  throw new ProductPhotoError("Selecione uma imagem ou informe uma URL HTTPS.");
}

import sharp from "sharp";
export class ProfilePhotoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const PROFILE_PHOTO_MAX = 4 * 1024 * 1024;
export async function cropProfilePhoto(
  file: File,
  x: number,
  y: number,
  zoom: number,
) {
  if (!file.size || file.size > PROFILE_PHOTO_MAX)
    throw new ProfilePhotoError("Selecione uma imagem de até 4 MB.");
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (
    !formats[file.type] ||
    ![x, y, zoom].every(Number.isFinite) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1 ||
    zoom < 1 ||
    zoom > 3
  )
    throw new ProfilePhotoError(
      "Imagem ou recorte inválido. Use JPG, PNG ou WebP.",
    );
  try {
    const bytes = Buffer.from(await file.arrayBuffer()),
      metadata = await sharp(bytes, { limitInputPixels: 20000000 }).metadata();
    if (metadata.format !== formats[file.type] || (metadata.pages ?? 1) > 1)
      throw new ProfilePhotoError(
        "Envie uma fotografia JPG, PNG ou WebP sem animação.",
      );
    const { data, info } = await sharp(bytes, { limitInputPixels: 20000000 })
      .rotate()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const size = Math.max(
        1,
        Math.round(Math.min(info.width, info.height) / zoom),
      ),
      left = Math.round((info.width - size) * x),
      top = Math.round((info.height - size) * y);
    return await sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .extract({ left, top, width: size, height: size })
      .resize(512, 512)
      .webp({ quality: 85 })
      .toBuffer();
  } catch (e) {
    if (e instanceof ProfilePhotoError) throw e;
    throw new ProfilePhotoError(
      "Não foi possível ler a imagem. Escolha um JPG, PNG ou WebP válido.",
    );
  }
}

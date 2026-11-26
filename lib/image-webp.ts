import sharp from "sharp";

/** Сохраняет размеры, прозрачность и анимацию; учитывает EXIF-ориентацию. */
export function convertImageToWebp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { animated: true }).rotate().webp({ quality: 95 }).toBuffer();
}

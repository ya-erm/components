import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { isAllowedImageType, uploadImage } from "@/lib/s3";
import { MAX_FILE_SIZE, MAX_IMAGES } from "@/lib/schema";

export const runtime = "nodejs";
// На Vercel тело serverless-функции ограничено ~4.5 МБ — поэтому льём по одному файлу за запрос.
export const maxDuration = 30;

export async function POST(req: Request) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Нет файлов" }, { status: 400 });
  }
  if (files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `За один раз не более ${MAX_IMAGES} файлов` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!isAllowedImageType(file.type)) {
      return NextResponse.json(
        { error: `Недопустимый тип файла: ${file.name}` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Файл "${file.name}" больше 4.5 МБ` },
        { status: 400 },
      );
    }
  }

  try {
    const urls = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return uploadImage(buffer, file.type, ownerId);
      }),
    );
    return NextResponse.json({ urls });
  } catch (err) {
    console.error("Ошибка загрузки в S3:", err);
    return NextResponse.json(
      { error: "Не удалось загрузить файл в хранилище" },
      { status: 500 },
    );
  }
}

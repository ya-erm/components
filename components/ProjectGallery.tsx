"use client";

import { ImageUploader } from "@/components/ImageUploader";

export function ProjectGallery({ images }: { images: string[] }) {
  return <ImageUploader value={images} onChange={() => {}} readOnly />;
}

import type { NextConfig } from "next";

/**
 * Хосты, с которых разрешено грузить изображения через next/image.
 * Берём из публичного URL S3 (S3_PUBLIC_URL) + локальный MinIO для разработки.
 */
function imageRemotePatterns() {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
    // MinIO в docker-compose
    { protocol: "http", hostname: "localhost", port: "9000" },
    { protocol: "http", hostname: "127.0.0.1", port: "9000" },
  ];

  const publicUrl = process.env.S3_PUBLIC_URL;
  if (publicUrl) {
    try {
      const u = new URL(publicUrl);
      patterns.push({
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        port: u.port || undefined,
      });
    } catch {
      // некорректный S3_PUBLIC_URL — игнорируем, упадём на стадии загрузки
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageRemotePatterns(),
  },
};

export default nextConfig;

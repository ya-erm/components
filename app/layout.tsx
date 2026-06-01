import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мои компоненты",
  description: "Учёт электронных компонентов на складе",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Шапку (AppHeader) и контейнер рендерит каждая страница сама.
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

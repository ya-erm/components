import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мои компоненты",
  description: "Учёт электронных компонентов на складе",
  appleWebApp: {
    capable: true,
    title: "Мои компоненты",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
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

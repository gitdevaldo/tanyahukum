import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TanyaHukum — AI Legal Assistant untuk Indonesia",
  description:
    "Analisis kontrak dan dokumen hukum dengan AI. Pahami risiko, klausul bermasalah, dan dapatkan rekomendasi hukum berdasarkan regulasi Indonesia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

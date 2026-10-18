import type { Metadata } from "next";
import "./globals.css";
import "./redesign.css";
export const metadata: Metadata = {
  title: "AMAZONITOS STORE · Cada conquista vale mais",
  description:
    "Loja interna de colaboradores. Conquiste Amazonitos, resgate produtos e ajude a reduzir o desperdício.",
  icons: { icon: "/brand.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

import { PwaProvider } from "@/components/pwa-provider";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./redesign.css";
import "./mobile.css";
export const metadata: Metadata = {
  title: "AMAZONITOS STORE · Cada conquista vale mais",
  description:
    "Loja interna de colaboradores. Conquiste Amazonitos, resgate produtos e ajude a reduzir o desperdício.",
  icons: { icon: "/brand.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    title: "Amazonitos",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#131921",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}

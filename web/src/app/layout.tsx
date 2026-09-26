import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elisyum Bot - Painel",
  description: "Painel de gerenciamento do Elisyum Bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="dark" suppressHydrationWarning>{children}</body>
    </html>
  );
}

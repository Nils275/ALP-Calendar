import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALP Manager — Agenda commun",
  description:
    "Agenda partagé ALP Racing Suspension : commercial, atelier, livraisons, révisions, projets et rendez-vous de l'équipe.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-alp-black text-white antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALP Manager",
  description: "ALP Manager - outils internes ALP Racing Suspension (agenda, operations).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-alp-ink text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}

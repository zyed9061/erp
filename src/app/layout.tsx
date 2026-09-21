import type { Metadata } from "next";
import "./globals.css";
import { DEMO_BANNER, isDemoMode } from "@/lib/demo/mode";

// Le bandeau de démonstration dépend de l'environnement au démarrage, pas de la compilation : pages toujours dynamiques.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Facturation",
  description: "Système de facturation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {isDemoMode() && (
          <p role="note" className="text-center text-xs font-medium px-3 py-1.5" style={{ background: "#b42318", color: "#fff" }}>
            {DEMO_BANNER}
          </p>
        )}
        {children}
      </body>
    </html>
  );
}

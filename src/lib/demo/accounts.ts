import type { Role } from "@/db/schema";

/** Comptes de DÉMONSTRATION (mots de passe publics, à ne jamais utiliser pour de vraies données). */
export const DEMO_ACCOUNTS: { email: string; name: string; role: Role; password: string }[] = [
  { email: "admin@demo.test", name: "Admin Démo", role: "admin", password: "Demo-Admin-2026" },
  { email: "comptable@demo.test", name: "Comptable Démo", role: "comptable", password: "Demo-Compta-2026" },
  { email: "commercial@demo.test", name: "Commercial Démo", role: "commercial", password: "Demo-Vente-2026" },
  { email: "lecteur@demo.test", name: "Lecteur Démo", role: "lecture_seule", password: "Demo-Lecture-2026" },
];

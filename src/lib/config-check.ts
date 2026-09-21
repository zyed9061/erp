import { eq } from "drizzle-orm";
import type { Db } from "@/db/types";
import { users } from "@/db/schema";
import { verifyPassword } from "./auth/password";
import { getCompany } from "./company";
import { pendingLabels } from "./einvoice/teif-codes";
import { smtpConfigFromEnv } from "./mail/transport";

/**
 * Diagnostic de configuration : dit en français simple ce qui est prêt, ce qui manque et quoi faire. Ne révèle jamais
 * un secret (seulement s'il est présent ou non). Utilisé par `npm run check:config` et par Paramètres > Configuration.
 */

export type CheckStatus = "ok" | "warn" | "error" | "info";
export type ConfigCheck = { id: string; label: string; status: CheckStatus; detail: string; fix?: string };

/** Mots de passe publics (exemples du dépôt, de la documentation et des tests) : jamais acceptables en production. */
export const KNOWN_DEFAULT_PASSWORDS = ["ChangeMe-12345", "Password-12345", "changeme", "password", "admin", "admin123"];

export const MIN_PRODUCTION_PASSWORD_LENGTH = 12;

/** Vrai si le mot de passe est public ou trop court pour une mise en production. */
export function isWeakAdminPassword(password: string): boolean {
  return KNOWN_DEFAULT_PASSWORDS.includes(password) || password.length < MIN_PRODUCTION_PASSWORD_LENGTH;
}

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): ConfigCheck[] {
  const production = env.NODE_ENV === "production";
  const out: ConfigCheck[] = [];

  out.push(env.DATABASE_URL
    ? { id: "database", label: "Base de données", status: "ok", detail: "DATABASE_URL est défini." }
    : { id: "database", label: "Base de données", status: "error", detail: "DATABASE_URL est absent.", fix: "Renseigner DATABASE_URL (voir .env.example), ou utiliser npm run dev:local pour un essai." });

  if (env.COOKIE_SECURE === "false") {
    out.push({
      id: "cookie", label: "Cookie de session", status: production ? "warn" : "info",
      detail: "Le cookie de session n'est pas marqué « Secure » (COOKIE_SECURE=false).",
      fix: production ? "Publier l'application en HTTPS et retirer COOKIE_SECURE=false." : undefined,
    });
  } else {
    out.push({ id: "cookie", label: "Cookie de session", status: "ok", detail: production ? "Cookie « Secure » actif (HTTPS requis)." : "Le cookie sera « Secure » en production." });
  }

  const secret = env.CRON_SECRET ?? "";
  if (!secret) {
    out.push({ id: "cron", label: "Tâches automatiques", status: "warn", detail: "CRON_SECRET est vide : les routes automatiques sont désactivées (relances et factures récurrentes seulement à la demande).",
      fix: "Choisir un long secret aléatoire dans CRON_SECRET et planifier npm run reminders et npm run recurring chaque jour." });
  } else if (secret.length < 24) {
    out.push({ id: "cron", label: "Tâches automatiques", status: "warn", detail: `CRON_SECRET est trop court (${secret.length} caractères).`, fix: "Utiliser au moins 24 caractères aléatoires." });
  } else {
    out.push({ id: "cron", label: "Tâches automatiques", status: "ok", detail: "CRON_SECRET défini." });
  }

  try {
    const smtp = smtpConfigFromEnv(env);
    if (!smtp) {
      out.push({ id: "smtp", label: "E-mail (SMTP)", status: production ? "warn" : "info",
        detail: "SMTP_HOST est vide : mode journal, AUCUN e-mail réel n'est envoyé (un résumé s'affiche dans la console du serveur).",
        fix: "Quand le fournisseur d'e-mail sera choisi : renseigner SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et MAIL_FROM." });
    } else {
      out.push({ id: "smtp", label: "E-mail (SMTP)", status: smtp.options.requireTLS || smtp.options.secure ? "ok" : "warn",
        detail: `Envoi réel via ${smtp.options.host}:${smtp.options.port} (${smtp.options.secure ? "TLS direct" : smtp.options.requireTLS ? "STARTTLS obligatoire" : "SANS chiffrement"}).`,
        fix: smtp.options.requireTLS || smtp.options.secure ? undefined : "Retirer SMTP_ALLOW_INSECURE : le clair ne convient qu'à un serveur de test local." });
    }
  } catch (e) {
    out.push({ id: "smtp", label: "E-mail (SMTP)", status: "error", detail: (e as Error).message, fix: "Corriger les variables SMTP_* / MAIL_FROM." });
  }

  const adminPassword = env.ADMIN_PASSWORD;
  if (adminPassword !== undefined && isWeakAdminPassword(adminPassword)) {
    out.push({ id: "admin-env", label: "Mot de passe administrateur (ADMIN_PASSWORD)", status: production ? "error" : "info",
      detail: "La valeur d'ADMIN_PASSWORD est publique ou trop courte.", fix: `Choisir un mot de passe d'au moins ${MIN_PRODUCTION_PASSWORD_LENGTH} caractères, non copié des exemples.` });
  }
  return out;
}

/** Contrôles qui lisent la base (mots de passe par défaut encore actifs, société incomplète, format TEIF). */
export async function checkData(db: Db): Promise<ConfigCheck[]> {
  const out: ConfigCheck[] = [];

  const admins = await db.select({ id: users.id, email: users.email, hash: users.passwordHash, active: users.isActive }).from(users).where(eq(users.role, "admin"));
  const activeAdmins = admins.filter((a) => a.active);
  if (activeAdmins.length === 0) {
    out.push({ id: "admins", label: "Comptes administrateur", status: "error", detail: "Aucun administrateur actif.", fix: "Lancer npm run db:seed ou réactiver un compte." });
  }
  const weak: string[] = [];
  for (const a of activeAdmins) {
    for (const pwd of KNOWN_DEFAULT_PASSWORDS) {
      if (await verifyPassword(pwd, a.hash)) { weak.push(a.email); break; }
    }
  }
  out.push(weak.length > 0
    ? { id: "default-password", label: "Mots de passe des administrateurs", status: "error",
        detail: `Le compte ${weak.join(", ")} utilise encore un mot de passe public.`, fix: "Paramètres > Utilisateurs : modifier le mot de passe." }
    : { id: "default-password", label: "Mots de passe des administrateurs", status: "ok", detail: "Aucun mot de passe public détecté sur les comptes administrateur." });

  const company = await getCompany(db);
  const missing = [
    !company.legalName?.trim() && "raison sociale", !company.matriculeFiscal?.trim() && "matricule fiscal",
    !company.address?.trim() && "adresse", !company.city?.trim() && "ville",
  ].filter(Boolean);
  out.push(missing.length > 0
    ? { id: "company", label: "Informations de la société", status: "warn",
        detail: `Manque : ${missing.join(", ")}. Ces informations sont figées dans chaque facture à sa validation.`, fix: "Paramètres > Société : compléter AVANT la première facture." }
    : { id: "company", label: "Informations de la société", status: "ok", detail: "Raison sociale, matricule fiscal et adresse renseignés." });

  const pending = pendingLabels();
  out.push({ id: "teif", label: "Facture électronique (TEIF)", status: pending.length > 0 ? "info" : "ok",
    detail: pending.length > 0
      ? `${pending.length} élément(s) de la spécification restent À FOURNIR PAR TTN : le fichier TEIF n'est pas transmissible.`
      : "Spécification TEIF complète.",
    fix: pending.length > 0 ? "Voir docs/a-fournir.md." : undefined });
  return out;
}

export const worstStatus = (checks: ConfigCheck[]): CheckStatus =>
  checks.some((c) => c.status === "error") ? "error" : checks.some((c) => c.status === "warn") ? "warn" : "ok";

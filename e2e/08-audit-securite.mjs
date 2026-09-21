// E2E audit : parcourt toutes les pages avec chaque rôle (aucune erreur 500, pas de « undefined/NaN » affiché,
// accès refusés cohérents), vérifie les en-têtes de sécurité et l'historique des opérations d'une facture.
// À lancer après e2e … e2e-phase8.
import { BASE, Session, check, failures } from "./session.mjs";

const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const BAD = [/\bNaN\b/, /\bundefined\b/, /\[object Object\]/, /Application error/i, /Internal Server Error/i];

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });

// Rôles supplémentaires
for (const [name, email, role] of [["Comptable", "comptable@example.tn", "comptable"], ["Lecteur", "lecteur@example.tn", "lecture_seule"]]) {
  const r = await admin.submit("/utilisateurs", "password", { name, email, role, password: "Password-12345" });
  check(`utilisateur ${role} créé`, !(r.location ?? "").includes("error="), r.location ?? "");
}
const sessions = { admin };
for (const [role, email] of [["comptable", "comptable@example.tn"], ["lecture_seule", "lecteur@example.tn"], ["commercial", "vendeur@example.tn"]]) {
  const s = new Session();
  await s.submit("/login", "email", { email, password: "Password-12345" });
  sessions[role] = s;
  check(`connexion ${role}`, s.cookie !== "");
}

// Identifiants réels pour les pages de détail
const firstHref = async (list, re) => re.exec((await admin.get(list)).html)?.[1];
const ids = {
  facture: await firstHref("/factures", /href="(\/factures\/[0-9a-f-]{36})"/),
  devis: await firstHref("/devis", /href="(\/devis\/[0-9a-f-]{36})"/),
  client: await firstHref("/clients", /href="(\/clients\/[0-9a-f-]{36})"/),
  produit: await firstHref("/produits", /href="(\/produits\/[0-9a-f-]{36})"/),
  paiement: await firstHref("/paiements", /href="(\/paiements\/[0-9a-f-]{36})"/),
  livraison: await firstHref("/livraisons", /href="(\/livraisons\/[0-9a-f-]{36})"/),
  chantier: await firstHref("/chantiers", /href="(\/chantiers\/[0-9a-f-]{36})"/),
  stock: await firstHref("/stock", /href="(\/stock\/[0-9a-f-]{36})"/),
  recurrente: await firstHref("/recurrentes", /href="(\/recurrentes\/[0-9a-f-]{36})"/),
};
check("identifiants de détail trouvés", Object.values(ids).every(Boolean), JSON.stringify(Object.entries(ids).filter(([, v]) => !v).map(([k]) => k)));

const pages = [
  "/", "/devis", "/devis/nouveau", "/factures", "/factures/nouveau", "/livraisons", "/livraisons/nouveau", "/stock", "/chantiers", "/chantiers/nouveau",
  "/recurrentes", "/recurrentes/nouveau", "/paiements", "/paiements/nouveau", "/relances", "/clients", "/clients/nouveau", "/produits", "/produits/nouveau",
  "/rapports", "/rapports?tab=balance", "/rapports?tab=tva", "/rapports?tab=retenues", "/rapports?tab=encaissements",
  "/parametres", "/parametres/taxes", "/parametres/conditions", "/parametres/numerotation", "/parametres/relances", "/utilisateurs", "/audit", "/acces-refuse",
  ...Object.values(ids).filter(Boolean),
];

const stats = { ok: 0, refused: 0 };
for (const [role, s] of Object.entries(sessions)) {
  const problems = [];
  for (const path of pages) {
    const res = await s.get(path);
    if (res.status === 200) {
      stats.ok++;
      const html = visible(res.html);
      if (!/<html[^>]*lang="fr"/.test(res.html)) problems.push(`${path}: lang="fr" absent`);
      if (!/<h1[\s>]/.test(html)) problems.push(`${path}: pas de <h1>`);
      for (const re of BAD) if (re.test(html.replace(/<[^>]+>/g, " "))) problems.push(`${path}: motif ${re}`);
    } else if (res.status === 307 || res.status === 303) {
      stats.refused++;
      if (res.location !== "/acces-refuse") problems.push(`${path}: redirection inattendue vers ${res.location}`);
    } else problems.push(`${path}: HTTP ${res.status}`);
  }
  check(`parcours de ${pages.length} pages en tant que ${role}`, problems.length === 0, problems.slice(0, 4).join(" | "));
}
console.log(`  (${stats.ok} pages affichées, ${stats.refused} accès refusés)`);

// Contrôles d'accès attendus par rôle
const denied = async (role, path) => (await sessions[role].get(path)).location === "/acces-refuse";
check("lecture seule : pas de rapports ni d'audit ni de création", (await denied("lecture_seule", "/rapports")) && (await denied("lecture_seule", "/audit")) && (await denied("lecture_seule", "/factures/nouveau")) && (await denied("lecture_seule", "/clients/nouveau")));
check("commercial : pas d'audit, pas d'utilisateurs, pas de rapports", (await denied("commercial", "/audit")) && (await denied("commercial", "/utilisateurs")) && (await denied("commercial", "/rapports")));
check("comptable : rapports et audit oui, gestion des utilisateurs non", (await sessions.comptable.get("/rapports")).status === 200 && (await sessions.comptable.get("/audit")).status === 200 && (await denied("comptable", "/utilisateurs")));
check("non connecté : toutes les pages redirigent vers /login", (await Promise.all(pages.slice(0, 12).map((p) => fetch(BASE + p, { redirect: "manual" })))).every((r) => r.status === 307 && (r.headers.get("location") ?? "").endsWith("/login")));

// En-têtes de sécurité
const h = (await fetch(BASE + "/login", { redirect: "manual" })).headers;
check("en-têtes de sécurité présents", h.get("x-content-type-options") === "nosniff" && h.get("x-frame-options") === "DENY"
  && (h.get("content-security-policy") ?? "").includes("frame-ancestors 'none'") && !!h.get("referrer-policy") && !!h.get("permissions-policy"), "");
check("l'en-tête X-Powered-By est retiré", !h.get("x-powered-by"));
const cookie = (await fetch(BASE + "/login", { method: "POST", redirect: "manual" })).headers.get("set-cookie") ?? "";
check("aucun cookie de session émis sans connexion", !cookie.includes("erp_session"));

// Historique des opérations sur une facture
const inv = await admin.get(ids.facture);
check("facture : historique des opérations affiché à l'administrateur", inv.html.includes("Historique des opérations") && inv.html.includes("Facture validée et numérotée"));
check("commercial : pas d'historique d'audit sur la facture", !(await sessions.commercial.get(ids.facture)).html.includes("Historique des opérations"));

// Robustesse des entrées : identifiants et paramètres hostiles
const hostile = ["/factures/%00", "/factures/..%2F..%2Fetc", "/clients/1%27%20OR%201=1", "/rapports?tab=%3Cscript%3E&from=%27&to=%22", "/factures?q=%25%27%3B%20DROP%20TABLE%20invoices%3B--&page=-5", "/audit?page=abc", "/factures?status=zzz&kind=zzz&payment=zzz"];
const codes = [];
for (const p of hostile) codes.push(`${p} -> ${(await admin.get(p)).status}`);
check("entrées hostiles : jamais de 500", codes.every((c) => !/-> 5\d\d$/.test(c)), codes.filter((c) => /-> 5\d\d$/.test(c)).join(" | "));
const listAfter = await admin.get("/factures");
check("l'injection SQL simulée n'a rien cassé", listAfter.status === 200);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES D'AUDIT PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

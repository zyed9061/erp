// E2E phase 7 : factures récurrentes, rapports, exports CSV, tableau de bord.
// À lancer après e2e.mjs, e2e-invoices, e2e-phase4/5/6 (société, client « Beta SARL », vendeur) ; serveur lancé avec CRON_SECRET=secret-e2e.
import { BASE, Session, check, failures } from "./session.mjs";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
const year = today.slice(0, 4);
const monthsAgo = (n) => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
const inMonths = (n) => monthsAgo(-n);
const pathOf = (loc) => loc?.split("?")[0];
const dec = (s) => { try { return decodeURIComponent(s ?? ""); } catch { return s ?? ""; } };
const cron = (path, auth) => fetch(BASE + path, { headers: auth ? { authorization: auth } : {}, redirect: "manual" });

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", admin.cookie !== "");

// --- Éditeur de modèle -------------------------------------------------------------------------------------
let g = await admin.get("/recurrentes/nouveau");
const beta = /<option value="([0-9a-f-]{36})">CLI-\d+ · Beta SARL/.exec(g.html)?.[1];
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
check("éditeur : champs du modèle et première échéance", g.status === 200 && g.html.includes('name="frequency"') && g.html.includes("Première échéance") && g.html.includes("Valider et numéroter automatiquement"));
check("éditeur : pas de date d'échéance de paiement", !g.html.includes("Échéance de paiement"));
check("client et TVA proposés", !!beta && !!tva19);

const line = (over = {}) => ({ productId: "", description: "Maintenance mensuelle", quantity: "1", unit: "mois", unitPrice: "100", discountPercent: "0", tvaRateId: tva19, fodecApplicable: false, ...over });
const payload = (over = {}) => JSON.stringify({ customerId: beta, issueDate: monthsAgo(2), dueDate: "", paymentTermId: "", reference: "ABO-1", notes: "", lines: [line()], ...over });
const base = { name: "Abonnement E2E", frequency: "monthly", endDate: "" };

let r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload(), ...base, name: "" });
check("nom obligatoire", dec(r.location).toLowerCase().includes("nom"), r.location ?? "");
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload(), ...base, autoSend: "on" });
check("envoi automatique sans validation automatique refusé", dec(r.location).includes("validation"), r.location ?? "");
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload({ lines: [] }), ...base });
check("modèle sans ligne refusé", dec(r.location).includes("au moins une ligne"), r.location ?? "");
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload(), ...base, endDate: monthsAgo(5) });
check("fin avant le début refusée", r.location?.includes("error="), r.location ?? "");
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: "{pas du json", ...base });
check("payload invalide refusé", r.location?.includes("error="), r.location ?? "");

// --- Modèle A : brouillons, 3 périodes échues (il y a 2 mois, 1 mois, ce mois-ci) -----------------------------------
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload(), ...base });
const aPath = pathOf(r.location);
check("modèle A créé", /^\/recurrentes\/[0-9a-f-]{36}$/.test(aPath ?? "") && r.location.includes("ok="), r.location ?? "");
g = await admin.get(aPath);
check("détail : prochaines échéances, mode brouillon, éditeur pré-rempli",
  g.html.includes("Prochaines échéances") && g.html.includes(monthsAgo(2)) && g.html.includes("créées en brouillon") && g.html.includes('value="Abonnement E2E"'));
g = await admin.get("/recurrentes");
check("liste : modèle A avec échéance due", g.html.includes("Abonnement E2E") && g.html.includes("Chaque mois") && g.html.includes("Générer les échéances dues"));

r = await admin.submit("/recurrentes", "text:Générer les échéances dues", {});
check("génération manuelle : 3 factures", dec(r.location).includes("3 facture(s) générée(s)"), r.location ?? "");
g = await admin.get(aPath);
const generated = g.html.match(/>Générée</g)?.length ?? 0;
check("historique : 3 générations, factures en brouillon liées", generated === 3 && (g.html.match(/href="\/factures\/[0-9a-f-]{36}"/g)?.length ?? 0) >= 3 && g.html.includes("Brouillon"), `${generated}`);
check("prochaine échéance avancée d'un mois", g.html.includes(inMonths(1)));
check("plus d'échéance due : bouton de génération masqué", !(await admin.get("/recurrentes")).html.includes("Générer les échéances dues"));
const draftHref = /href="(\/factures\/[0-9a-f-]{36})"/.exec(g.html)?.[1];
const inv = await admin.get(draftHref);
check("facture générée : brouillon du bon client avec la ligne du modèle", inv.status === 200 && inv.html.includes("Beta SARL") && inv.html.includes("Maintenance mensuelle"));

// --- Cron : authentification et idempotence ------------------------------------------------------------------
check("cron sans jeton : 401", (await cron("/api/cron/recurring")).status === 401);
check("cron avec mauvais jeton : 401", (await cron("/api/cron/recurring", "Bearer nope")).status === 401);
let cr = await cron("/api/cron/recurring", "Bearer secret-e2e");
let body = await cr.json();
check("cron : rien à générer (idempotent)", cr.status === 200 && body.generated === 0 && body.failed === 0, JSON.stringify(body));

// --- Pause / reprise / fin ---------------------------------------------------------------------------------------
r = await admin.submit(aPath, "text:Mettre en pause", {});
check("pause", r.location?.includes("ok=") && (await admin.get(aPath)).html.includes("En pause"), r.location ?? "");
r = await admin.submit(aPath, "text:Reprendre", {});
check("reprise", (await admin.get(aPath)).html.includes("Actif"), r.location ?? "");
check("modèle avec historique : suppression non proposée", !(await admin.get(aPath)).html.includes(">Supprimer<"));

// --- Modèle B : validation + numérotation automatiques, lancé par le cron ---------------------------------------------
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload({ issueDate: monthsAgo(1), reference: "ABO-2" }), name: "Abonnement validé E2E", frequency: "monthly", endDate: "", autoValidate: "on" });
const bPath = pathOf(r.location);
check("modèle B (validation automatique) créé", /^\/recurrentes\/[0-9a-f-]{36}$/.test(bPath ?? ""), r.location ?? "");
cr = await cron("/api/cron/recurring", "Bearer secret-e2e");
body = await cr.json();
check("cron : 2 factures générées pour B", cr.status === 200 && body.generated === 2 && body.failed === 0, JSON.stringify(body));
g = await admin.get(bPath);
check("B : factures validées et numérotées, pas de brouillon", !g.html.includes("Brouillon") && /class="p-3 font-mono"><a[^>]*>[A-Z]+[-A-Z]*\d+/.test(g.html));
cr = await cron("/api/cron/recurring", "Bearer secret-e2e");
check("cron rejoué : 0", (await cr.json()).generated === 0);

// --- Modèle C : jamais lancé, supprimable ------------------------------------------------------------------------
r = await admin.submit("/recurrentes/nouveau", "payload", { payload: payload({ issueDate: inMonths(3), reference: "ABO-3" }), name: "Futur E2E", frequency: "yearly", endDate: "" });
const cPath = pathOf(r.location);
g = await admin.get("/recurrentes");
check("modèle futur : échéance non due", g.html.includes("Futur E2E") && !g.html.includes("Générer les échéances dues"));
check("modèle sans historique : suppression proposée", (await admin.get(cPath)).html.includes("Supprimer"));
r = await admin.submit(cPath, "text:>Supprimer<", {});
check("modèle C supprimé", r.location?.startsWith("/recurrentes?") && !(await admin.get("/recurrentes")).html.includes("Futur E2E"), r.location ?? "");

// --- Rapports -------------------------------------------------------------------------------------------------------
const tabs = [
  ["ca", "Par mois", "Par client"], ["balance", "Situation au", "Total"], ["tva", "TVA collectée", "Timbre fiscal"],
  ["retenues", "Retenues à la source", "Reste à justifier"], ["encaissements", "Total encaissé", "Par mode"],
];
for (const [tab, a, b] of tabs) {
  g = await admin.get(`/rapports?tab=${tab}&from=${year}-01-01&to=${year}-12-31`);
  check(`rapport ${tab}`, g.status === 200 && g.html.includes(a) && g.html.includes(b), `${g.status}`);
}
g = await admin.get("/rapports?tab=ca&from=pas-une-date&to=2020-01-01");
check("période invalide : année en cours, sans erreur", g.status === 200 && g.html.includes(`value="${year}-01-01"`));
g = await admin.get("/rapports?tab=inconnu");
check("onglet inconnu : chiffre d'affaires par défaut", g.status === 200 && g.html.includes("Par mois"));
g = await admin.get(`/rapports?tab=ca&from=${year}-01-01&to=${year}-12-31`);
check("CA : le client Beta SARL apparaît", g.html.includes("Beta SARL"));

// --- Exports CSV ---------------------------------------------------------------------------------------------------------
for (const [t, header] of [["ca-mensuel", "Mois;Documents"], ["ca-clients", "Client;Documents"], ["balance-agee", "Client;Non échu"], ["tva", "Type;Taux"], ["retenues", "Facture;Date"], ["encaissements", "Rubrique;Paiements"]]) {
  const res = await fetch(`${BASE}/rapports/export/${t}?from=${year}-01-01&to=${year}-12-31`, { headers: { cookie: admin.cookie }, redirect: "manual" });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  check(`export ${t}`, res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("text/csv") && buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) && text.includes(header)
    && /attachment; filename="[a-z0-9_.-]+\.csv"/.test(res.headers.get("content-disposition") ?? "") && text.includes("\r\n"), `${res.status}`);
}
check("export inconnu : 404", (await fetch(`${BASE}/rapports/export/nimporte-quoi`, { headers: { cookie: admin.cookie }, redirect: "manual" })).status === 404);
check("export : pas de traversée de chemin", (await fetch(`${BASE}/rapports/export/..%2F..%2Fetc`, { headers: { cookie: admin.cookie }, redirect: "manual" })).status === 404);

// --- Tableau de bord ---------------------------------------------------------------------------------------------------------
g = await admin.get("/");
check("tableau de bord : indicateurs", g.status === 200 && ["CA HT du mois", "Créances ouvertes", "Récurrentes à générer", "Produits en stock bas", "Chantiers actifs"].every((t) => g.html.includes(t)));
check("tableau de bord : graphique accessible avec tableau équivalent", g.html.includes('role="img"') && g.html.includes("12 derniers mois") && g.html.includes("Voir le tableau") && g.html.includes("var(--chart-1)"));
check("tableau de bord : 12 mois dans le tableau", (g.html.match(/<td class="py-1">/g)?.length ?? 0) === 12, `${g.html.match(/<td class="py-1">/g)?.length}`);

// --- Droits -------------------------------------------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
check("commercial : pas de rapports", (await seller.get("/rapports")).location === "/acces-refuse");
check("commercial : pas d'export", (await seller.get("/rapports/export/tva")).location === "/acces-refuse");
g = await seller.get("/");
check("commercial : tableau de bord sans chiffres", g.status === 200 && !g.html.includes("CA HT du mois"));
check("commercial : modèles récurrents en lecture", (await seller.get("/recurrentes")).status === 200 && (await seller.get(aPath)).status === 200);
check("commercial : édition refusée", (await seller.get("/recurrentes/nouveau")).location === "/acces-refuse" && !(await seller.get(aPath)).html.includes('name="frequency"'));
check("commercial : menu sans « Rapports »", !g.html.includes('href="/rapports"'));

// Action forgée : pause soumise avec le cookie du commercial, avec le formulaire de l'admin
const formHtml = (await admin.get(aPath)).html.split("<form").slice(1).find((f) => f.includes("Mettre en pause"));
const fd = new FormData();
for (const m of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
const forged = await fetch(BASE + aPath, { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
const after = (await admin.get(aPath)).html;
check("pause forgée par un commercial refusée côté serveur", after.includes("Actif") && !after.includes("En pause"), `HTTP ${forged.status} ${forged.headers.get("location") ?? ""}`);

check("non connecté : /rapports redirigé", (await fetch(BASE + "/rapports", { redirect: "manual" })).status === 307);
check("non connecté : export redirigé", (await fetch(BASE + "/rapports/export/tva", { redirect: "manual" })).status === 307);
check("non connecté : /recurrentes redirigé", (await fetch(BASE + "/recurrentes", { redirect: "manual" })).status === 307);
check("identifiants invalides : 404", (await admin.get("/recurrentes/pas-un-uuid")).status === 404);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES PHASE 7 PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

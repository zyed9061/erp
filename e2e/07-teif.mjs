// E2E phase 8 : préparation TEIF (fichier XML non signé, conservé, en ajout seul).
// À lancer après e2e.mjs … e2e-phase7 : la société n'a alors PAS d'adresse (cas d'erreur voulu).
import { BASE, Session, check, failures } from "./session.mjs";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
const id = (path) => path.split("?")[0].split("/").pop();
const pathOf = (loc) => loc?.split("?")[0];
const dec = (s) => { try { return decodeURIComponent(s ?? ""); } catch { return s ?? ""; } };
const raw = (path, cookie) => fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", admin.cookie !== "");

// --- Facture validée pour un client complet ---------------------------------------------------------------------------
let r = await admin.submit("/clients/nouveau", "name", {
  name: "Gamma & Fils SARL", type: "entreprise", taxStatus: "assujetti", matriculeFiscal: "4444444/A/M/000",
  address: "12 rue de Marseille", city: "Tunis", postalCode: "1000",
});
check("client Gamma créé", r.location?.includes("ok=") || /^\/clients\/[0-9a-f-]{36}/.test(r.location ?? ""), r.location ?? "");
let g = await admin.get("/factures/nouveau");
const gamma = /<option value="([0-9a-f-]{36})">CLI-\d+ · Gamma/.exec(g.html)?.[1];
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
check("client et TVA proposés", !!gamma && !!tva19);
const line = (over = {}) => ({ productId: "", description: "Audit <sécurité> & conseil", quantity: "2", unit: "h", unitPrice: "150", discountPercent: "0", tvaRateId: tva19, fodecApplicable: false, ...over });
const payload = (over = {}) => JSON.stringify({ customerId: gamma, issueDate: today, dueDate: "", paymentTermId: "", reference: "BC-TEIF", notes: "", lines: [line()], ...over });

r = await admin.submit("/factures/nouveau", "payload", { payload: payload() });
const draftPath = pathOf(r.location);
const draftId = id(draftPath);
g = await admin.get(draftPath);
check("brouillon : pas de carte TEIF", !g.html.includes("Facture électronique (TEIF)"));
r = await admin.submit(draftPath, "text:Valider et numéroter", { id: draftId });
check("facture validée", /Document valid/.test(dec(r.location)), r.location ?? "");
const invPath = draftPath;

// --- Société sans adresse : préparation refusée avec explication -----------------------------------------------------
g = await admin.get(invPath);
check("facture validée : carte TEIF avec avertissement de non-validation", g.html.includes("Facture électronique (TEIF)") && g.html.includes("ni signé ni transmis"));
check("adresse de la société manquante signalée", g.html.includes("Adresse de la société absente"));
check("bouton de préparation masqué tant qu'il y a des erreurs", !g.html.includes("Préparer le fichier TEIF") && g.html.includes("Corrigez les points"));
check("téléchargement : 404 tant que rien n'est préparé", (await raw(`${invPath}/teif`, admin.cookie)).status === 404);

// --- Renseigner l'adresse de la société : la facture déjà validée reste bloquée (données figées) --------------------------
r = await admin.submit("/parametres", "legalName", {
  legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", address: "1 rue de l'Industrie", city: "Tunis", postalCode: "1002",
  taxRegime: "reel", vatRegistered: "on", stampDutyEnabled: "on", stampDutyAmount: "1", capital: "10 000", withholdingBase: "ttc", withholdingThreshold: "0",
});
check("société mise à jour avec l'adresse", r.location?.includes("ok="), r.location ?? "");
g = await admin.get(invPath);
check("facture déjà validée : toujours bloquée, avec l'explication des données figées", g.html.includes("Adresse de la société absente") && g.html.includes("figées à sa validation") && !g.html.includes("Préparer le fichier TEIF"));

// Nouvelle facture, validée après la mise à jour de la société
r = await admin.submit("/factures/nouveau", "payload", { payload: payload({ reference: "BC-OK" }) });
const okPath = pathOf(r.location);
await admin.submit(okPath, "text:Valider et numéroter", { id: id(okPath) });
g = await admin.get(okPath);
check("nouvelle facture : plus d'erreur, bouton de préparation proposé", g.html.includes("Préparer le fichier TEIF") && !g.html.includes("Adresse de la société absente"));
check("points d'attention listés", g.html.includes("Points d&#x27;attention") || g.html.includes("Points d'attention"));
const invPathOk = okPath;

// --- Préparation ---------------------------------------------------------------------------------------------------------------
r = await admin.submit(invPathOk, "text:Préparer le fichier TEIF", {});
check("préparation réussie", dec(r.location).includes("Fichier TEIF préparé"), r.location ?? "");
g = await admin.get(invPathOk);
check("carte : téléchargement et empreinte, bouton de préparation retiré", g.html.includes("Télécharger le XML") && g.html.includes("empreinte") && !g.html.includes("Préparer le fichier TEIF"));

const dl = await raw(`${invPathOk}/teif`, admin.cookie);
const xml = await dl.text();
check("téléchargement : XML avec en-têtes adaptés", dl.status === 200 && (dl.headers.get("content-type") ?? "").startsWith("application/xml")
  && /attachment; filename="[A-Za-z0-9._-]+\.teif-preparation\.xml"/.test(dl.headers.get("content-disposition") ?? ""), `${dl.status}`);
check("XML : racine TEIF, mention « non signé », identifiants des parties", xml.includes("<TEIF ") && xml.includes("non signé et non validé") && xml.includes("7654321B/A/M/000") && xml.includes("4444444/A/M/000"));
check("XML : caractères spéciaux échappés", xml.includes("Audit &lt;sécurité&gt; &amp; conseil") && xml.includes("Gamma &amp; Fils SARL") && !xml.includes("<sécurité>"));
check("XML : montants à 3 décimales (HT 300, TVA 57, TTC 357, net 358 avec timbre)", ["300.000", "57.000", "357.000", "358.000"].every((a) => xml.includes(`>${a}<`)), "");
check("XML : codes inconnus marqués", xml.includes("A-FOURNIR-PAR-TTN"));
check("XML : encodage et entête", xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));

// --- Le fichier conservé ne change plus (même si la fiche client change) ------------------------------------------------
const clientPath = `/clients/${gamma}`;
r = await admin.submit(clientPath, "name", { name: "Gamma RENOMMÉE", type: "entreprise", taxStatus: "assujetti", matriculeFiscal: "4444444/A/M/000", address: "Autre adresse", city: "Sousse" });
const xml2 = await (await raw(`${invPathOk}/teif`, admin.cookie)).text();
check("fichier conservé identique après modification du client", xml2 === xml && !xml2.includes("RENOMMÉE"), r.location ?? "");

// --- Droits ---------------------------------------------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
g = await seller.get(invPathOk);
check("commercial : voit la carte et peut télécharger, sans bouton de préparation", g.status === 200 && g.html.includes("Télécharger le XML") && !g.html.includes("Préparer le fichier TEIF"));
check("commercial : téléchargement autorisé", (await raw(`${invPathOk}/teif`, seller.cookie)).status === 200);

// Action forgée : préparation d'une 2e facture avec le formulaire de l'admin et le cookie du commercial
r = await admin.submit("/factures/nouveau", "payload", { payload: payload({ reference: "BC-2" }) });
const path2 = pathOf(r.location);
await admin.submit(path2, "text:Valider et numéroter", { id: id(path2) });
const formHtml = (await admin.get(path2)).html.split("<form").slice(1).find((f) => f.includes("Préparer le fichier TEIF"));
const fd = new FormData();
for (const m of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
const forged = await fetch(BASE + path2, { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
check("préparation forgée par un commercial refusée côté serveur", (await raw(`${path2}/teif`, admin.cookie)).status === 404, `HTTP ${forged.status} ${forged.headers.get("location") ?? ""}`);

check("non connecté : téléchargement redirigé", (await fetch(BASE + `${invPathOk}/teif`, { redirect: "manual" })).status === 307);
check("identifiant invalide : 404", (await admin.get("/factures/pas-un-uuid/teif")).status === 404);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES PHASE 8 PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

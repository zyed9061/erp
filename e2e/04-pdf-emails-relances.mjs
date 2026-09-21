// E2E phase 5 : PDF, e-mail (transport « journal »), relances, route cron.
// À lancer après e2e.mjs (société, client « Société Alpha » avec contact de facturation karim@alpha.tn, vendeur). Serveur démarré avec CRON_SECRET=secret-e2e.
import { BASE, Session, check, failures } from "./session.mjs";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
const id = (path) => path.split("?")[0].split("/").pop();
const pathOf = (loc) => loc?.split("?")[0];
const dec = (s) => decodeURIComponent(s ?? "");

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", admin.cookie !== "");

// --- Facture validée + PDF ------------------------------------------------------------------------
let g = await admin.get("/factures/nouveau");
const alpha = /<option value="([0-9a-f-]{36})">CLI-\d+ · Société Alpha/.exec(g.html)?.[1];
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
check("client Alpha et taux de TVA trouvés", !!alpha && !!tva19);
const line = (over) => ({ productId: "", description: "Prestation", quantity: "1", unit: "unité", unitPrice: "1000", discountPercent: "0", tvaRateId: tva19, fodecApplicable: false, ...over });
const payload = (over = {}) => JSON.stringify({ customerId: alpha, issueDate: today, dueDate: "", paymentTermId: "", reference: "", notes: "", lines: [line()], ...over });

let r = await admin.submit("/factures/nouveau", "payload", { payload: payload() });
const invPath = pathOf(r.location);
r = await admin.submit(invPath, "text:Valider et numéroter", { id: id(invPath) });
const number = /(FA-\d{4}-\d{6})/.exec(dec(r.location))?.[1];
check("facture validée", !!number, r.location ?? "");

const raw = async (session, path) => {
  const res = await fetch(BASE + path, { headers: { cookie: session.cookie }, redirect: "manual" });
  return { status: res.status, type: res.headers.get("content-type"), disp: res.headers.get("content-disposition"), loc: res.headers.get("location"), bytes: new Uint8Array(await res.arrayBuffer()) };
};
const magic = (b) => Buffer.from(b.slice(0, 5)).toString();

let pdf = await raw(admin, `${invPath}/pdf`);
check("PDF de la facture : 200, application/pdf, en-tête %PDF", pdf.status === 200 && pdf.type === "application/pdf" && magic(pdf.bytes) === "%PDF-", `${pdf.status} ${pdf.type}`);
check("PDF : affiché dans le navigateur, nom = numéro", pdf.disp === `inline; filename="${number}.pdf"`, pdf.disp ?? "");
check("PDF : contenu non trivial", pdf.bytes.length > 1500, String(pdf.bytes.length));
pdf = await raw(admin, `${invPath}/pdf?download=1`);
check("PDF : téléchargement forcé", pdf.disp === `attachment; filename="${number}.pdf"`, pdf.disp ?? "");

r = await admin.submit("/factures/nouveau", "payload", { payload: payload({ reference: "BROUILLON-TEST" }) });
const draftPath = pathOf(r.location);
pdf = await raw(admin, `${draftPath}/pdf`);
check("PDF d'un brouillon (avec filigrane)", pdf.status === 200 && magic(pdf.bytes) === "%PDF-" && /brouillon-/.test(pdf.disp ?? ""), pdf.disp ?? "");
check("PDF : identifiant invalide -> 404", (await raw(admin, "/factures/pas-un-uuid/pdf")).status === 404);
check("PDF : facture inconnue -> 404", (await raw(admin, "/factures/00000000-0000-0000-0000-000000000000/pdf")).status === 404);
check("PDF : non connecté -> redirigé", (await fetch(BASE + `${invPath}/pdf`, { redirect: "manual" })).status === 307);

// --- Envoi par e-mail ----------------------------------------------------------------------------------
g = await admin.get(invPath);
check("panneau PDF et envoi, destinataire par défaut", g.html.includes("PDF et envoi par e-mail") && g.html.includes("Par défaut : karim@alpha.tn"));
r = await admin.submit(invPath, "message", { id: id(invPath), to: "", message: "Merci de votre confiance" });
check("e-mail (simulé en mode test) au destinataire par défaut", /e-mail (envoyé )?à karim@alpha\.tn/i.test(dec(r.location)), r.location ?? "");
g = await admin.get(invPath);
check("historique : envoi journalisé", g.html.includes("Envoi à karim@alpha.tn") && g.html.includes("envoyé"));
r = await admin.submit(invPath, "message", { id: id(invPath), to: "", message: "" });
check("second envoi immédiat refusé", dec(r.location).includes("vient d'être envoyé"), r.location ?? "");
r = await admin.submit(invPath, "message", { id: id(invPath), to: "pas-un-mail", message: "" });
check("adresse invalide refusée", dec(r.location).includes("Adresse e-mail invalide"), r.location ?? "");
r = await admin.submit(invPath, "message", { id: id(invPath), to: "autre@alpha.tn", message: "" });
check("autre destinataire accepté", /e-mail (envoyé )?à autre@alpha\.tn/i.test(dec(r.location)), r.location ?? "");

g = await admin.get(draftPath);
check("brouillon : aperçu PDF, pas d'envoi possible", g.html.includes("Aperçu PDF (brouillon)") && !g.html.includes("Envoyer par e-mail avec le PDF"));

// --- Devis : PDF et envoi --------------------------------------------------------------------------------
r = await admin.submit("/devis/nouveau", "payload", { payload: payload({ dueDate: "2099-12-31", reference: "AO-1" }) });
const quotePath = pathOf(r.location);
check("devis brouillon créé", /^\/devis\/[0-9a-f-]{36}$/.test(quotePath ?? ""), r.location ?? "");
check("devis brouillon : PDF", (await raw(admin, `${quotePath}/pdf`)).status === 200);
r = await admin.submit(quotePath, "text:Envoyer et numéroter", { id: id(quotePath) });
const quoteNumber = /(DEV-\d{4}-\d{5})/.exec(dec(r.location))?.[1];
check("devis numéroté", !!quoteNumber, r.location ?? "");
pdf = await raw(admin, `${quotePath}/pdf`);
check("PDF du devis nommé d'après son numéro", pdf.disp === `inline; filename="${quoteNumber}.pdf"`, pdf.disp ?? "");
r = await admin.submit(quotePath, "message", { id: id(quotePath), to: "", message: "" });
check("devis envoyé par e-mail", /e-mail (envoyé )?à karim@alpha\.tn/i.test(dec(r.location)), r.location ?? "");

// --- Relances -----------------------------------------------------------------------------------------------
g = await admin.get("/relances");
check("page des relances", g.status === 200 && g.html.includes("Relances des impayés") && g.html.includes("facture(s) échue(s)"));
g = await admin.get("/parametres/relances");
check("modèles de relance : trois niveaux", g.status === 200 && ["Niveau 1", "Niveau 2", "Niveau 3"].every((l) => g.html.includes(l)) && g.html.includes("{{numero}}"));
r = await admin.submit("/parametres/relances", "daysAfterDue", { level: "1", daysAfterDue: "20", subject: "Rappel {{numero}}", body: "Bonjour {{client}}", isActive: "on" });
check("délais non croissants refusés", dec(r.location).includes("délais doivent augmenter"), r.location ?? "");
r = await admin.submit("/parametres/relances", "daysAfterDue", { level: "1", daysAfterDue: "5", subject: "Rappel modifié {{numero}}", body: "Bonjour {{client}}, solde {{reste_du}}", isActive: "on" });
check("modèle de relance enregistré", dec(r.location).includes("Modèle de relance enregistré"), r.location ?? "");
g = await admin.get("/parametres/relances");
check("modèle relu", g.html.includes("Rappel modifié {{numero}}") && g.html.includes('value="5"'));
await admin.submit("/parametres/relances", "daysAfterDue", { level: "1", daysAfterDue: "7", subject: "Rappel : facture {{numero}} échue", body: "Bonjour {{client}}", isActive: "on" });

// --- Route cron ----------------------------------------------------------------------------------------------
const cron = (headers = {}, method = "POST") => fetch(BASE + "/api/cron/reminders", { method, headers, redirect: "manual" });
check("cron : sans jeton -> 401", (await cron()).status === 401);
check("cron : mauvais jeton -> 401", (await cron({ authorization: "Bearer mauvais" })).status === 401);
const ok = await cron({ authorization: "Bearer secret-e2e" });
const body = await ok.json();
check("cron : bon jeton -> 200 et résumé", ok.status === 200 && body.sent === 0 && body.failed === 0 && "details" in body, JSON.stringify(body).slice(0, 120));
check("cron : accessible sans session, en GET aussi", (await cron({ authorization: "Bearer secret-e2e" }, "GET")).status === 200);

// --- Droits -----------------------------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
g = await seller.get(invPath);
check("commercial : voit le PDF mais aucun formulaire d'envoi", g.html.includes("Ouvrir le PDF") && !g.html.includes('name="to"'));
check("commercial : peut ouvrir le PDF", (await raw(seller, `${invPath}/pdf`)).status === 200);
g = await seller.get("/relances");
check("commercial : relances en lecture seule", g.status === 200 && !g.html.includes("relance(s) dues") && !g.html.includes(">Relancer<"));
check("commercial : modèles de relance en lecture seule", !(await seller.get("/parametres/relances")).html.includes("Enregistrer le niveau"));

const historyCount = async () => ((await admin.get(invPath)).html.match(/ à [\w.@-]+ · envoyé/g) ?? []).length;
const before = await historyCount();
const formHtml = (await admin.get(invPath)).html.split("<form").slice(1).find((f) => f.includes('name="to"'));
const fd = new FormData();
for (const m of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
fd.set("to", "pirate@x.tn");
const forged = await fetch(BASE + invPath, { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
check("envoi forgé par un commercial refusé côté serveur", (await historyCount()) === before, `HTTP ${forged.status} ${forged.headers.get("location") ?? ""}`);

// --- Journal d'audit ----------------------------------------------------------------------------------------------
const audit = await admin.get("/audit");
check("audit : envois d'e-mails tracés", audit.html.includes("email.sent"));

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES PHASE 5 PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

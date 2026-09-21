// E2E phase 4 : à lancer après e2e.mjs et e2e-invoices.mjs (société renseignée, client « Société Alpha » avec retenue, vendeur).
import { BASE, Session, check, failures } from "./session.mjs";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
const year = today.slice(0, 4);
const id = (path) => path.split("?")[0].split("/").pop();
const pathOf = (loc) => loc?.split("?")[0];

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", admin.cookie !== "");

// --- Client sans retenue ------------------------------------------------------------------------
let r = await admin.submit("/clients/nouveau", "name", { name: "Beta SARL", type: "entreprise", taxStatus: "assujetti", matriculeFiscal: "2222222/A/M/000" });
check("client Beta créé", /^\/clients\/[0-9a-f-]{36}/.test(r.location ?? ""), r.location ?? "");

// --- Devis --------------------------------------------------------------------------------------
let g = await admin.get("/devis/nouveau");
check("GET /devis/nouveau", g.status === 200);
const beta = /<option value="([0-9a-f-]{36})">CLI-\d+ · Beta SARL/.exec(g.html)?.[1];
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
const tva7 = /<option value="([0-9a-f-]{36})"[^>]*>7 %</.exec(g.html)?.[1];
check("client et taux proposés dans l'éditeur de devis", !!beta && !!tva19 && !!tva7);

const line = (over) => ({ productId: "", description: "Prestation", quantity: "1", unit: "unité", unitPrice: "100", discountPercent: "0", tvaRateId: tva19, fodecApplicable: false, ...over });
const quotePayload = (over = {}) => JSON.stringify({
  customerId: beta, issueDate: today, dueDate: "2099-12-31", paymentTermId: "", reference: "AO-7", notes: "",
  lines: [line({ description: "Développement", unitPrice: "1000" }), line({ description: "Formation", unitPrice: "500", tvaRateId: tva7 })], ...over,
});

r = await admin.submit("/devis/nouveau", "payload", { payload: quotePayload({ lines: [] }) });
check("devis sans ligne refusé", r.location?.includes("error=Ajoutez au moins une ligne"), r.location ?? "");
r = await admin.submit("/devis/nouveau", "payload", { payload: quotePayload({ dueDate: "2000-01-01" }) });
check("validité avant émission refusée", r.location?.includes("error=La validit"), r.location ?? "");

r = await admin.submit("/devis/nouveau", "payload", { payload: quotePayload() });
const quotePath = pathOf(r.location);
check("brouillon de devis créé", /^\/devis\/[0-9a-f-]{36}$/.test(quotePath ?? ""), r.location ?? "");
const quoteId = id(quotePath);
g = await admin.get(quotePath);
check("devis brouillon : éditeur, total TTC 1 725,000", g.html.includes("Envoyer et numéroter") && g.html.includes("1 725,000"));

r = await admin.submit(quotePath, "text:Envoyer et numéroter", { id: quoteId });
check("devis envoyé avec son numéro", r.location?.includes(`Devis envoy%C3%A9 : DEV-${year}-00001`) || r.location?.includes(`DEV-${year}-00001`), r.location ?? "");
g = await admin.get(quotePath);
check("devis envoyé : lecture seule, décision possible", !g.html.includes("Enregistrer le brouillon") && g.html.includes("Marquer comme accepté"));
r = await admin.submit(quotePath, "text:Marquer comme accepté", { id: quoteId, decision: "accepted" });
check("devis accepté", r.location?.includes("Devis accept"), r.location ?? "");

// --- Acomptes -----------------------------------------------------------------------------------
r = await admin.submit(quotePath, "percent", { id: quoteId, percent: "30" });
const dep1Path = pathOf(r.location);
check("acompte de 30 % créé en brouillon", /^\/factures\/[0-9a-f-]{36}$/.test(dep1Path ?? ""), r.location ?? "");
g = await admin.get(dep1Path);
check("acompte : titre, lien vers le devis, total 517,500", g.html.includes("Facture d'acompte") && g.html.includes(`DEV-${year}-00001`) && g.html.includes("517,500"));
check("acompte : pas de timbre", !g.html.includes("Timbre fiscal") || g.html.includes("0,000"));
r = await admin.submit(dep1Path, "text:Valider et numéroter", { id: id(dep1Path) });
check("acompte validé : série ACO", r.location?.includes(`ACO-${year}-00001`), r.location ?? "");

r = await admin.submit(quotePath, "percent", { id: quoteId, percent: "80" });
check("acomptes > 100 % refusés", r.location?.includes("error=") && r.location.includes("100"), r.location ?? "");
r = await admin.submit(quotePath, "percent", { id: quoteId, percent: "20" });
const dep2Path = pathOf(r.location);
await admin.submit(dep2Path, "text:Valider et numéroter", { id: id(dep2Path) });

// Un acompte en brouillon empêche la facture finale
r = await admin.submit(quotePath, "percent", { id: quoteId, percent: "10" });
const dep3Path = pathOf(r.location);
r = await admin.submit(quotePath, "text:Créer la facture finale", { id: quoteId });
check("facture finale refusée avec un acompte en brouillon", r.location?.includes("error=Validez%20ou%20supprimez") || decodeURIComponent(r.location ?? "").includes("acomptes en brouillon"), r.location ?? "");
r = await admin.submit(dep3Path, "text:Supprimer le brouillon", { id: id(dep3Path) });
check("acompte brouillon supprimé", r.location?.startsWith("/factures?ok=Brouillon supprim"), r.location ?? "");

// --- Facture finale -----------------------------------------------------------------------------
r = await admin.submit(quotePath, "text:Créer la facture finale", { id: quoteId });
const finalPath = pathOf(r.location);
check("facture finale créée en brouillon", /^\/factures\/[0-9a-f-]{36}$/.test(finalPath ?? ""), r.location ?? "");
g = await admin.get(finalPath);
check("finale : lignes de déduction des acomptes", g.html.includes("Acompte déjà facturé ACO-"));
check("finale : total TTC 862,500 (acomptes déduits)", g.html.includes("862,500"));
r = await admin.submit(finalPath, "text:Valider et numéroter", { id: id(finalPath) });
check("facture finale validée", /Document valid%C3%A9 : FA-\d{4}-\d{6}|Document validé : FA-/.test(r.location ?? "") || r.location?.includes("FA-"), r.location ?? "");
g = await admin.get(finalPath);
check("finale validée : net à payer 863,500 (timbre inclus), non payée", g.html.includes("863,500") && g.html.includes("Non payée"));
r = await admin.submit(quotePath, "text:Créer la facture finale", { id: quoteId }).catch(() => ({ location: "no-form" }));
check("plus de seconde facture finale ni d'acompte", r.location === "no-form", r.location ?? "");

// --- Encaissements --------------------------------------------------------------------------------
const field = (invPath) => "alloc_" + id(invPath);
r = await admin.submit(finalPath, "next", { [field(finalPath)]: "9999", paymentDate: today, method: "cheque" });
check("encaissement supérieur au reste dû refusé", decodeURIComponent(r.location ?? "").includes("dépasse le reste dû"), r.location ?? "");
r = await admin.submit(finalPath, "next", { [field(finalPath)]: "300", paymentDate: today, method: "cheque", reference: "CH-77" });
check("encaissement partiel enregistré", r.location?.includes("ok=Paiement"), r.location ?? "");
g = await admin.get(finalPath);
check("finale : partiellement payée, reste dû 563,500", g.html.includes("Partiellement payée") && g.html.includes("563,500") && g.html.includes("CH-77"));
const payment1 = /href="\/paiements\/([0-9a-f-]{36})"/.exec(g.html)?.[1];
check("lien vers le paiement", !!payment1);

r = await admin.submit(finalPath, "next", { [field(finalPath)]: "563.5", paymentDate: today, method: "virement", reference: "VIR-9" });
g = await admin.get(finalPath);
check("finale : soldée après le second encaissement", g.html.includes("Soldée") && g.html.includes("Reste dû : 0,000"));
check("plus de formulaire d'encaissement sur une facture soldée", !g.html.includes("Enregistrer l&#x27;encaissement") && !g.html.includes("Enregistrer l'encaissement"));

// Annulation d'un paiement
g = await admin.get(`/paiements/${payment1}`);
check("détail du paiement : imputation vers la facture", g.status === 200 && g.html.includes("Imputations") && g.html.includes("FA-"));
r = await admin.submit(`/paiements/${payment1}`, "reason", { id: payment1, reason: "" });
check("annulation sans motif refusée", r.location?.includes("error="), r.location ?? "");
r = await admin.submit(`/paiements/${payment1}`, "reason", { id: payment1, reason: "Chèque impayé" });
check("paiement annulé", r.location?.includes("ok=Paiement%20annul") || decodeURIComponent(r.location ?? "").includes("Paiement annulé"), r.location ?? "");
g = await admin.get(finalPath);
check("annulation : la facture redevient partiellement payée (reste dû 300,000)", g.html.includes("Partiellement payée") && g.html.includes("300,000") && g.html.includes("annulé"));
check("paiement annulé : plus de bouton d'annulation", !(await admin.get(`/paiements/${payment1}`)).html.includes("Annuler le paiement"));

// Saisie depuis /paiements/nouveau, avec imputation sur les acomptes
g = await admin.get(`/paiements/nouveau?client=${beta}`);
const dep1Id = id(dep1Path);
check("factures ouvertes proposées (acompte 1 non payé, finale partielle)", g.html.includes(`name="alloc_${dep1Id}"`) && g.html.includes(`name="alloc_${id(finalPath)}"`));
r = await admin.submit(`/paiements/nouveau?client=${beta}`, "paymentDate", { customerId: beta, amount: "600", method: "virement", paymentDate: today, [`alloc_${dep1Id}`]: "517.5", [`alloc_${id(finalPath)}`]: "300" });
check("paiement de 600 refusé : imputations 817,5 > 600", decodeURIComponent(r.location ?? "").includes("dépassent le montant du paiement"), r.location ?? "");
r = await admin.submit(`/paiements/nouveau?client=${beta}`, "paymentDate", { customerId: beta, amount: "900", method: "virement", paymentDate: today, [`alloc_${dep1Id}`]: "517.5", [`alloc_${id(finalPath)}`]: "300" });
const payment2Path = pathOf(r.location);
check("paiement multi-factures enregistré", /^\/paiements\/[0-9a-f-]{36}$/.test(payment2Path ?? ""), r.location ?? "");
g = await admin.get(payment2Path);
check("paiement : 817,500 imputés, 82,500 d'avance à imputer", g.html.includes("817,500") && g.html.includes("82,500"));
check("liste des paiements", (await admin.get("/paiements")).html.includes("Beta SARL"));

// Filtres de la liste des factures
check("filtre « soldées » : la finale y figure", (await admin.get("/factures?payment=paid")).html.includes("Soldée"));
const open = await admin.get("/factures?payment=open");
check("filtre « à encaisser » : l'acompte 2 y figure, l'acompte 1 payé non", open.html.includes(`ACO-${year}-00002`) && !open.html.includes(`ACO-${year}-00001`));
check("filtre « en retard » répond", (await admin.get("/factures?payment=overdue")).status === 200);

// --- Retenue à la source : certificats ---------------------------------------------------------------
g = await admin.get("/factures/nouveau");
const alpha = /<option value="([0-9a-f-]{36})">CLI-\d+ · Société Alpha/.exec(g.html)?.[1];
r = await admin.submit("/factures/nouveau", "payload", { payload: JSON.stringify({ customerId: alpha, issueDate: today, dueDate: "", paymentTermId: "", reference: "", notes: "", lines: [line({ unitPrice: "1000" })] }) });
const alphaPath = pathOf(r.location);
await admin.submit(alphaPath, "text:Valider et numéroter", { id: id(alphaPath) });
g = await admin.get(alphaPath);
check("facture avec retenue : section certificats (17,850)", g.html.includes("Retenue à la source") && g.html.includes("17,850"));
r = await admin.submit(alphaPath, "number", { invoiceId: id(alphaPath), number: "RAS-1", certificateDate: today, amount: "10" });
check("certificat enregistré", r.location?.includes("ok=Certificat"), r.location ?? "");
r = await admin.submit(alphaPath, "number", { invoiceId: id(alphaPath), number: "RAS-2", certificateDate: today, amount: "10" });
check("certificats supérieurs à la retenue refusés", decodeURIComponent(r.location ?? "").includes("dépasseraient la retenue"), r.location ?? "");
check("certificat affiché", (await admin.get(alphaPath)).html.includes("RAS-1"));

// --- Droits ---------------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
check("commercial : peut créer un devis", (await seller.get("/devis/nouveau")).status === 200);
check("commercial : liste des paiements en lecture", (await seller.get("/paiements")).status === 200);
check("commercial : /paiements/nouveau refusé", (await seller.get("/paiements/nouveau")).location === "/acces-refuse");
g = await seller.get(quotePath);
check("commercial : voit le devis accepté mais ne facture pas", g.status === 200 && !g.html.includes("Créer la facture finale") && !g.html.includes("Créer l&#x27;acompte"));
g = await seller.get(finalPath);
check("commercial : voit le statut de paiement, sans formulaire d encaissement", g.html.includes("Soldée") && !g.html.includes('name="paymentDate"'));

// Action forgée : le formulaire de l'admin soumis avec le cookie du commercial
const before = (await admin.get("/paiements")).html.match(/Beta SARL/g)?.length ?? 0;
const formHtml = (await admin.get(`/paiements/nouveau?client=${beta}`)).html.replaceAll("<!-- -->", "").split("<form").slice(1).find((f) => f.includes('name="paymentDate"'));
const fd = new FormData();
for (const m of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
Object.entries({ customerId: beta, amount: "5", method: "especes", paymentDate: today }).forEach(([k, v]) => fd.set(k, v));
const forged = await fetch(BASE + `/paiements/nouveau?client=${beta}`, { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
const after = (await admin.get("/paiements")).html.match(/Beta SARL/g)?.length ?? 0;
check("paiement forgé par un commercial refusé côté serveur", after === before, `HTTP ${forged.status} ${forged.headers.get("location") ?? ""}`);
check("non connecté : /devis redirigé", (await fetch(BASE + "/devis", { redirect: "manual" })).status === 307);
check("identifiants invalides : 404", (await admin.get("/devis/pas-un-uuid")).status === 404 && (await admin.get("/paiements/pas-un-uuid")).status === 404);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES PHASE 4 PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

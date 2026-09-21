// NB : e2e.mjs a configuré la série des factures en préfixe FA / 6 chiffres (test du format de numérotation).
// E2E factures : à lancer après e2e.mjs (réutilise société, client « Société Alpha » avec retenue, utilisateur vendeur).
import { BASE, Session, check, failures } from "./session.mjs";

const today = new Date().toISOString().slice(0, 10);
const year = today.slice(0, 4);
const id = (path) => path.split("?")[0].split("/").pop();

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", admin.cookie !== "");

// --- Nouvelle facture ---------------------------------------------------------------------------
let g = await admin.get("/factures/nouveau");
check("GET /factures/nouveau", g.status === 200);
const customerId = new RegExp(`<option value="([0-9a-f-]{36})">CLI-00001 · Société Alpha`).exec(g.html)?.[1];
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
check("client et taux de TVA proposés dans l'éditeur", !!customerId && !!tva19);

const line = (over) => ({ productId: "", description: "Prestation", quantity: "1", unit: "unité", unitPrice: "100", discountPercent: "0", tvaRateId: tva19, fodecApplicable: false, ...over });
const payload = (lines, over = {}) => JSON.stringify({ customerId, issueDate: today, dueDate: "", paymentTermId: "", reference: "BC-42", notes: "Merci", lines, ...over });

let r = await admin.submit("/factures/nouveau", "payload", { payload: payload([]) });
check("facture sans ligne refusée", r.location?.includes("error=Ajoutez au moins une ligne"), r.location ?? "");
r = await admin.submit("/factures/nouveau", "payload", { payload: payload([line({ quantity: "0" })]) });
check("quantité nulle refusée", r.location?.includes("error="), r.location ?? "");
r = await admin.submit("/factures/nouveau", "payload", { payload: "{pas du json" });
check("charge utile invalide refusée proprement", r.location?.includes("error=Formulaire"), r.location ?? "");

r = await admin.submit("/factures/nouveau", "payload", { payload: payload([line({ quantity: "2", unitPrice: "100" }), line({ description: "Marchandise", quantity: "10", unitPrice: "12,5" })]) });
const draftPath = r.location?.split("?")[0];
check("brouillon créé et redirigé vers sa fiche", /^\/factures\/[0-9a-f-]{36}$/.test(draftPath ?? ""), r.location ?? "");
const draftId = id(draftPath);

g = await admin.get(draftPath);
check("brouillon : éditeur, bouton de validation, aperçu des totaux", g.html.includes("Valider et numéroter") && g.html.includes("Brouillon"));
check("brouillon : aperçu des totaux (325 HT + 19 % = 386,750 TTC)", g.html.includes("386,750"));

// --- Modification du brouillon (verrou optimiste) --------------------------------------------------
const version = g.html.match(/name="version" value="(\d+)"/)?.[1];
r = await admin.submit(draftPath, "payload", { id: draftId, version, payload: payload([line({ quantity: "2", unitPrice: "100" }), line({ description: "Marchandise", quantity: "10", unitPrice: "12.5", fodecApplicable: true })]) });
check("brouillon modifié (avec FODEC)", r.location?.includes("ok=Brouillon"), r.location ?? "");
r = await admin.submit(draftPath, "payload", { id: draftId, version, payload: payload([line()]) });
check("modification avec une version périmée refusée", r.location?.includes("error=Ce brouillon a été modifié"), r.location ?? "");

// --- Validation ----------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
r = await seller.submit(draftPath, "text:Valider et numéroter", {}).catch((e) => ({ location: "no-form", err: String(e) }));
check("commercial : pas de bouton de validation sur un brouillon", r.location === "no-form", r.err ?? r.location ?? "");
check("commercial : /factures/nouveau refusé", (await seller.get("/factures/nouveau")).location === "/acces-refuse");
check("commercial : liste des factures accessible", (await seller.get("/factures")).status === 200);

r = await admin.submit(draftPath, "text:Valider et numéroter", { id: draftId });
const numberMatch = /Document validé : (FA-\d{4}-\d{6})/.exec(r.location ?? "");
check("validation : numéro attribué", !!numberMatch, r.location ?? "");
const number = numberMatch?.[1];
check("premier numéro de la série", number === `FA-${year}-000001`, number ?? "");

g = await admin.get(draftPath);
check("facture validée : numéro, intègre, totaux figés", g.html.includes(number) && g.html.includes("(intègre)") && g.html.includes("388,238") && g.html.includes("383,414"));
check("facture validée : plus d'éditeur, avoir proposé", !g.html.includes("Enregistrer le brouillon") && g.html.includes("Créer un avoir"));
check("timbre et retenue affichés", g.html.includes("Timbre fiscal") && g.html.includes("Retenue à la source"));

// --- Une facture validée ne peut plus être modifiée, même par une requête forgée ----------------
const other = await admin.submit("/factures/nouveau", "payload", { payload: payload([line()]) });
const otherPath = other.location.split("?")[0];
r = await admin.submit(otherPath, "payload", { id: draftId, payload: payload([line({ unitPrice: "1" })]) }); // formulaire d'un autre brouillon, id de la facture validée
check("modification forgée d'une facture validée refusée", r.location?.includes("error=Ce document est validé"), r.location ?? "");
r = await admin.submit(otherPath, "text:Supprimer le brouillon", { id: draftId });
check("suppression forgée d'une facture validée refusée", r.location?.includes("error=Un document validé"), r.location ?? "");
r = await admin.submit(otherPath, "text:Valider et numéroter", { id: draftId });
check("double validation refusée", r.location?.includes("error=Ce document est déjà validé"), r.location ?? "");

// --- Numérotation continue : la 2e facture prend le numéro suivant ------------------------------
r = await admin.submit(otherPath, "text:Valider et numéroter", { id: id(otherPath) });
check("deuxième facture : numéro suivant, sans trou", r.location?.includes(`FA-${year}-000002`), r.location ?? "");

// --- Avoir --------------------------------------------------------------------------------------
r = await admin.submit(draftPath, "reason", { id: draftId, reason: "" });
check("avoir sans motif refusé", r.location?.includes("error="), r.location ?? "");
r = await admin.submit(draftPath, "reason", { id: draftId, reason: "Retour de marchandise" });
const creditPath = r.location?.split("?")[0];
check("avoir créé en brouillon", /^\/factures\/[0-9a-f-]{36}$/.test(creditPath ?? ""), r.location ?? "");
g = await admin.get(creditPath);
check("avoir brouillon : titre, lien vers la facture, sans timbre", g.html.includes("Avoir") && g.html.includes(number) && g.html.includes("Retour de marchandise"));
r = await admin.submit(creditPath, "text:Valider et numéroter", { id: id(creditPath) });
check("avoir validé avec sa propre série", r.location?.includes(`AV-${year}-00001`), r.location ?? "");
g = await admin.get(draftPath);
check("facture d'origine : avoir listé, reste à créditer à 0", g.html.includes(`AV-${year}-00001`) && g.html.includes("reste à créditer : 0,000"));
check("plus d'avoir possible sur une facture entièrement créditée", !g.html.includes("Créer un avoir") || !g.html.includes('name="reason"'));

// --- Liste ----------------------------------------------------------------------------------------
const list = await admin.get("/factures");
check("liste : factures, avoir et statuts", list.html.includes(`FA-${year}-000001`) && list.html.includes(`AV-${year}-00001`) && list.html.includes("Avoir"));
check("liste : filtre par type", !(await admin.get("/factures?kind=credit_note")).html.includes(`FA-${year}-000001`));
check("liste : recherche par numéro", (await admin.get(`/factures?q=FA-${year}-000002`)).html.includes(`FA-${year}-000002`));

// --- Suppression d'un brouillon ------------------------------------------------------------------
const tmp = await admin.submit("/factures/nouveau", "payload", { payload: payload([line()]) });
const tmpPath = tmp.location.split("?")[0];
r = await admin.submit(tmpPath, "text:Supprimer le brouillon", { id: id(tmpPath) });
check("brouillon supprimé", r.location?.startsWith("/factures?ok=Brouillon supprim"), r.location ?? "");
check("brouillon supprimé introuvable", (await admin.get(tmpPath)).status === 404);

// --- Accès --------------------------------------------------------------------------------------
check("commercial : peut consulter une facture validée, sans bouton d'avoir", await (async () => {
  const p = await seller.get(draftPath);
  return p.status === 200 && p.html.includes(number) && !p.html.includes('name="reason"');
})());
check("non connecté : redirigé", (await fetch(BASE + draftPath, { redirect: "manual" })).status === 307);
check("identifiant invalide : 404", (await admin.get("/factures/pas-un-uuid")).status === 404);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES FACTURES PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

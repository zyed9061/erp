// E2E phase 6 : stock, bons de livraison, chantiers (situations, retenue de garantie).
// À lancer après e2e.mjs et e2e-phase4.mjs (société, client « Beta SARL », vendeur).
import { BASE, Session, check, failures } from "./session.mjs";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
const year = today.slice(0, 4);
const id = (path) => path.split("?")[0].split("/").pop();
const pathOf = (loc) => loc?.split("?")[0];
const dec = (s) => { try { return decodeURIComponent(s ?? ""); } catch { return s ?? ""; } }; // submit() a déjà décodé : un « % » littéral ne doit pas planter
const nbsp = " ";

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", admin.cookie !== "");

// --- Produit suivi en stock ----------------------------------------------------------------------------
let g = await admin.get("/produits/nouveau");
const tva19p = /<option value="([0-9a-f-]{36})"[^>]*>TVA 19 %/.exec(g.html)?.[1];
check("formulaire produit : suivi de stock proposé", g.html.includes("Suivre le stock") && g.html.includes("Seuil d"));
let r = await admin.submit("/produits/nouveau", "unitPrice", { name: "Ciment E2E", type: "bien", unit: "sac", unitPrice: "12,5", tvaRateId: tva19p, trackStock: "on", minStock: "5" });
const productPath = pathOf(r.location);
check("article suivi en stock créé", /^\/produits\/[0-9a-f-]{36}$/.test(productPath ?? ""), r.location ?? "");
const productId = id(productPath);
r = await admin.submit("/produits/nouveau", "unitPrice", { name: "Conseil E2E", type: "service", unit: "h", unitPrice: "100", tvaRateId: tva19p, trackStock: "on" });
check("un service ne peut pas être suivi en stock", dec(r.location).includes("Seuls les biens"), r.location ?? "");
check("fiche article : lien vers le stock", (await admin.get(productPath)).html.includes("Voir le stock et les mouvements"));

// --- Stock ----------------------------------------------------------------------------------------------------
g = await admin.get("/stock");
check("liste du stock : article épuisé", g.status === 200 && g.html.includes("Ciment E2E") && g.html.includes("Épuisé"));
const stockPath = `/stock/${productId}`;
r = await admin.submit(stockPath, "quantity", { productId, type: "entry", quantity: "50", reference: "BR-1" });
check("entrée de stock", r.location?.includes("ok=Mouvement"), r.location ?? "");
check("stock affiché : 50", (await admin.get(stockPath)).html.includes(`50,000`));
r = await admin.submit(stockPath, "quantity", { productId, type: "exit", quantity: "100" });
check("sortie supérieure au stock refusée", dec(r.location).includes("Stock insuffisant"), r.location ?? "");
r = await admin.submit(stockPath, "quantity", { productId, type: "adjustment", quantity: "-2", notes: "" });
check("ajustement sans motif refusé", dec(r.location).includes("motif"), r.location ?? "");
r = await admin.submit(stockPath, "quantity", { productId, type: "adjustment", quantity: "-2", notes: "Inventaire" });
check("ajustement motivé accepté", r.location?.includes("ok=Mouvement"), r.location ?? "");
check("stock : 48 après ajustement", (await admin.get(stockPath)).html.includes("48,000"));

// --- Bon de livraison --------------------------------------------------------------------------------------
g = await admin.get("/livraisons/nouveau");
const beta = /<option value="([0-9a-f-]{36})">CLI-\d+ · Beta SARL/.exec(g.html)?.[1];
check("éditeur de bon : client et article (avec stock) proposés", !!beta && g.html.includes("Ciment E2E") && g.html.includes("stock : 48,000"));
const pid = /<option value="([0-9a-f-]{36})">ART-\d+ · Ciment E2E/.exec(g.html)?.[1];
const bl = (qty, over = {}) => JSON.stringify({ customerId: beta, issueDate: today, reference: "BC-9", notes: "", lines: [{ productId: pid, quantity: qty, description: "", unitPrice: "" }], ...over });

r = await admin.submit("/livraisons/nouveau", "payload", { payload: bl("20", { lines: [] }) });
check("bon sans ligne refusé", dec(r.location).includes("Ajoutez au moins une ligne"), r.location ?? "");
r = await admin.submit("/livraisons/nouveau", "payload", { payload: bl("20") });
const blPath = pathOf(r.location);
check("bon de livraison brouillon créé", /^\/livraisons\/[0-9a-f-]{36}$/.test(blPath ?? ""), r.location ?? "");
g = await admin.get(blPath);
check("brouillon : éditeur, validation, aperçu PDF", g.html.includes("Valider et sortir du stock") && g.html.includes("Aperçu PDF"));

let pdf = await fetch(BASE + `${blPath}/pdf`, { headers: { cookie: admin.cookie }, redirect: "manual" });
const bytes = new Uint8Array(await pdf.arrayBuffer());
check("PDF du brouillon de bon", pdf.status === 200 && Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-" && /bl-brouillon/.test(pdf.headers.get("content-disposition") ?? ""));

r = await admin.submit(blPath, "text:Valider et sortir du stock", { id: id(blPath) });
const blNumber = /(BL-\d{4}-\d{5})/.exec(dec(r.location))?.[1];
check("bon validé et numéroté", blNumber === `BL-${year}-00001`, r.location ?? "");
check("stock : 28 après livraison de 20", (await admin.get(stockPath)).html.includes("28,000"));
g = await admin.get(blPath);
check("bon validé : lecture seule, prix figés, annulation possible", !g.html.includes("Enregistrer le brouillon") && g.html.includes("12,500") && g.html.includes("Annuler le bon"));
pdf = await fetch(BASE + `${blPath}/pdf`, { headers: { cookie: admin.cookie }, redirect: "manual" });
check("PDF du bon nommé d'après son numéro", pdf.headers.get("content-disposition") === `inline; filename="${blNumber}.pdf"`, pdf.headers.get("content-disposition") ?? "");

// Stock insuffisant : aucun numéro consommé
r = await admin.submit("/livraisons/nouveau", "payload", { payload: bl("100") });
const bigPath = pathOf(r.location);
r = await admin.submit(bigPath, "text:Valider et sortir du stock", { id: id(bigPath) });
check("stock insuffisant : validation refusée", dec(r.location).includes("Stock insuffisant"), r.location ?? "");
check("le bon reste en brouillon, stock inchangé", (await admin.get(bigPath)).html.includes("Valider et sortir du stock") && (await admin.get(stockPath)).html.includes("28,000"));
r = await admin.submit(bigPath, "text:Supprimer le brouillon", { id: id(bigPath) });
check("brouillon supprimé", r.location?.startsWith("/livraisons?ok=Brouillon"), r.location ?? "");

// Deuxième bon : numéro suivant, puis annulation avec remise en stock
r = await admin.submit("/livraisons/nouveau", "payload", { payload: bl("10") });
const bl2Path = pathOf(r.location);
r = await admin.submit(bl2Path, "text:Valider et sortir du stock", { id: id(bl2Path) });
check("second bon : numéro suivant, sans trou", dec(r.location).includes(`BL-${year}-00002`), r.location ?? "");
check("stock : 18", (await admin.get(stockPath)).html.includes("18,000"));
r = await admin.submit(bl2Path, "reason", { id: id(bl2Path), reason: "" });
check("annulation sans motif refusée", r.location?.includes("error="), r.location ?? "");
r = await admin.submit(bl2Path, "reason", { id: id(bl2Path), reason: "Client absent" });
check("bon annulé", dec(r.location).includes("Bon annulé"), r.location ?? "");
check("stock : 28 après annulation", (await admin.get(stockPath)).html.includes("28,000"));
check("bon annulé : PDF marqué, plus d'annulation", !(await admin.get(bl2Path)).html.includes("Annuler le bon"));

// Facturation du bon
g = await admin.get("/livraisons?toInvoice=1");
check("liste : bon à facturer avec case à cocher", g.html.includes(blNumber) && g.html.includes('name="noteId"'));
const noteId = new RegExp(`name="noteId" value="([0-9a-f-]{36})"`).exec(g.html)?.[1];
r = await admin.submit("/livraisons?toInvoice=1", "noteId", { noteId });
const invPath = pathOf(r.location);
check("facture brouillon créée depuis le bon", /^\/factures\/[0-9a-f-]{36}$/.test(invPath ?? ""), r.location ?? "");
g = await admin.get(invPath);
check("facture : ligne reprise avec la référence du bon", g.html.includes(`(BL ${blNumber})`));
r = await admin.submit(invPath, "text:Valider et numéroter", { id: id(invPath) });
check("facture des livraisons validée", /FA-\d{4}-\d{6}/.test(dec(r.location)), r.location ?? "");
g = await admin.get(blPath);
check("bon facturé : lien vers la facture, plus d'annulation", g.html.includes("Repris dans la") && !g.html.includes("Annuler le bon"));
check("liste : le bon n'est plus à facturer", !(await admin.get("/livraisons?toInvoice=1")).html.includes(blNumber));

// --- Chantier BTP -------------------------------------------------------------------------------------------
g = await admin.get("/chantiers/nouveau");
const betaP = /<option value="([0-9a-f-]{36})">CLI-\d+ · Beta SARL/.exec(g.html)?.[1];
const t19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
const t7 = /<option value="([0-9a-f-]{36})"[^>]*>7 %</.exec(g.html)?.[1];
check("éditeur de chantier", g.status === 200 && !!betaP && !!t19 && !!t7);
const project = (over = {}) => JSON.stringify({
  name: "Villa E2E", description: "", customerId: betaP, holdbackPercent: "10",
  lines: [
    { description: "Maçonnerie", unit: "m²", quantity: "100", unitPrice: "50", tvaRateId: t19 },
    { description: "Toiture", unit: "u", quantity: "1", unitPrice: "10000", tvaRateId: t7 },
  ], ...over,
});
r = await admin.submit("/chantiers/nouveau", "payload", { payload: project({ lines: [] }) });
check("chantier sans poste refusé", dec(r.location).includes("au moins un poste"), r.location ?? "");
r = await admin.submit("/chantiers/nouveau", "payload", { payload: project({ holdbackPercent: "150" }) });
check("retenue > 100 % refusée", r.location?.includes("error="), r.location ?? "");
r = await admin.submit("/chantiers/nouveau", "payload", { payload: project() });
const projPath = pathOf(r.location);
check("chantier créé", /^\/chantiers\/[0-9a-f-]{36}$/.test(projPath ?? ""), r.location ?? "");
g = await admin.get(projPath);
check("marché : 15 000 HT, 16 650 TTC, éditeur du bordereau", g.html.includes(`15${nbsp}000,000`) && g.html.includes(`16${nbsp}650,000`) && g.html.includes("Enregistrer le chantier"));

const lineIds = [...g.html.matchAll(/name="pct_([0-9a-f-]{36})"/g)].map((m) => m[1]);
check("formulaire de situation : un champ par poste", lineIds.length === 2);
r = await admin.submit(projPath, "text:Créer la situation", { id: id(projPath), [`pct_${lineIds[0]}`]: "30", [`pct_${lineIds[1]}`]: "20", issueDate: today });
const sitPath = pathOf(r.location);
check("situation n° 1 : brouillon de facture créé", /^\/factures\/[0-9a-f-]{36}$/.test(sitPath ?? ""), r.location ?? "");
g = await admin.get(sitPath);
check("brouillon : lignes de situation et retenue de garantie dans l'aperçu",
  g.html.includes("Situation n° 1 — Maçonnerie") && g.html.includes("Retenue de garantie (10 %)") && g.html.includes(`3${nbsp}533,500`));
r = await admin.submit(sitPath, "text:Valider et numéroter", { id: id(sitPath) });
check("situation validée", /FA-\d{4}-\d{6}/.test(dec(r.location)), r.location ?? "");
g = await admin.get(sitPath);
check("facture de situation : retenue de garantie 392,500 et net à payer 3 533,500",
  g.html.includes("Retenue de garantie (10 %)") && g.html.includes("392,500") && g.html.includes(`3${nbsp}533,500`) && g.html.includes("voir le chantier"));
const sitPdf = await fetch(BASE + `${sitPath}/pdf`, { headers: { cookie: admin.cookie }, redirect: "manual" });
check("PDF de la situation", sitPdf.status === 200);

g = await admin.get(projPath);
check("chantier : bordereau verrouillé (plus d'éditeur), situation listée, retenue 392,500",
  !g.html.includes("Enregistrer le chantier") && g.html.includes("Situations facturées") && g.html.includes("392,500") && g.html.includes("Paramètres du chantier"));
check("avancement facturé", g.html.includes("Avancement facturé"));

r = await admin.submit(projPath, "text:Créer la situation", { id: id(projPath), [`pct_${lineIds[0]}`]: "10", issueDate: today });
check("avancement inférieur au précédent refusé", dec(r.location).includes("inférieur au précédent"), r.location ?? "");
r = await admin.submit(projPath, "text:Créer la situation", { id: id(projPath), issueDate: today });
check("situation sans avancement refusée", r.location?.includes("error="), r.location ?? "");
r = await admin.submit(projPath, "text:Créer la situation", { id: id(projPath), [`pct_${lineIds[0]}`]: "50", issueDate: today });
const sit2Path = pathOf(r.location);
check("situation n° 2 créée (20 m² de plus)", /^\/factures\//.test(sit2Path ?? ""), r.location ?? "");
check("situation n° 2 : quantité facturée = 20 (champ de l'éditeur)", (await admin.get(sit2Path)).html.includes('value="20.000"'));
g = await admin.get(projPath);
check("pas de nouvelle situation tant que la précédente est en brouillon", g.html.includes("est encore en brouillon") && !g.html.includes(`name="pct_${lineIds[0]}"`));
r = await admin.submit(sit2Path, "text:Supprimer le brouillon", { id: id(sit2Path) });
check("brouillon de situation supprimé", r.location?.startsWith("/factures?ok=Brouillon supprim"), r.location ?? "");
g = await admin.get(projPath);
check("situation supprimée : le formulaire réapparaît", g.html.includes(`name="pct_${lineIds[0]}"`) && g.html.includes("Situation n° 2"));

r = await admin.submit(projPath, "text:Enregistrer la libération", { id: id(projPath), amount: "1000" });
check("libération supérieure à la retenue refusée", dec(r.location).includes("dépasse la retenue restante"), r.location ?? "");
r = await admin.submit(projPath, "text:Enregistrer la libération", { id: id(projPath), amount: "100", reference: "PV-1" });
check("libération enregistrée", dec(r.location).includes("Libération de retenue enregistrée"), r.location ?? "");
g = await admin.get(projPath);
check("retenue : libérée 100, restante 292,500", g.html.includes("100,000") && g.html.includes("292,500"));
r = await admin.submit(projPath, "text:Marquer comme terminé", { id: id(projPath), status: "completed" });
check("chantier terminé", dec(r.location).includes("Statut du chantier mis à jour"), r.location ?? "");
check("chantier terminé : plus de situation", !(await admin.get(projPath)).html.includes(`name="pct_${lineIds[0]}"`));
check("liste des chantiers", (await admin.get("/chantiers")).html.includes("Villa E2E"));

// --- Droits ---------------------------------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
check("commercial : stock en lecture, sans formulaire de mouvement", (await seller.get(stockPath)).status === 200 && !(await seller.get(stockPath)).html.includes('name="quantity"'));
check("commercial : peut créer un bon de livraison", (await seller.get("/livraisons/nouveau")).status === 200);
r = await seller.submit("/livraisons/nouveau", "payload", { payload: bl("1") });
const sellerBl = pathOf(r.location);
g = await seller.get(sellerBl);
check("commercial : peut préparer un bon mais pas le valider", g.status === 200 && !g.html.includes("Valider et sortir du stock"));
check("commercial : chantiers en lecture seule", (await seller.get("/chantiers")).status === 200 && (await seller.get("/chantiers/nouveau")).location === "/acces-refuse");
check("commercial : fiche chantier sans formulaire de situation", !(await seller.get(projPath)).html.includes("Créer la situation"));

const before = ((await admin.get(stockPath)).html.match(/Inventaire/g) ?? []).length;
const formHtml = (await admin.get(stockPath)).html.split("<form").slice(1).find((f) => f.includes('name="quantity"'));
const fd = new FormData();
for (const m of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
Object.entries({ type: "adjustment", quantity: "1000", notes: "Piratage" }).forEach(([k, v]) => fd.set(k, v));
const forged = await fetch(BASE + stockPath, { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
check("mouvement de stock forgé par un commercial refusé côté serveur", !(await admin.get(stockPath)).html.includes("Piratage") && before >= 1, `HTTP ${forged.status} ${forged.headers.get("location") ?? ""}`);
check("non connecté : /stock redirigé", (await fetch(BASE + "/stock", { redirect: "manual" })).status === 307);
check("identifiants invalides : 404", (await admin.get("/livraisons/pas-un-uuid")).status === 404 && (await admin.get("/chantiers/pas-un-uuid")).status === 404 && (await admin.get("/stock/pas-un-uuid")).status === 404);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES PHASE 6 PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

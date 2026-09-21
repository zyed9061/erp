// Parcours complet en MODE DÉMONSTRATION (données fictives, TTN / signature / QR simulés) contre un vrai serveur.
// Lancé par `npm run e2e:demo` (base neuve + données de démonstration installées).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { BASE, Session, check, failures } from "../e2e/session.mjs";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
const id = (path) => path.split("?")[0].split("/").pop();
const pathOf = (loc) => loc?.split("?")[0];
const dec = (s) => { try { return decodeURIComponent(s ?? ""); } catch { return s ?? ""; } };
const raw = async (session, path) => {
  const res = await fetch(BASE + path, { headers: { cookie: session.cookie }, redirect: "manual" });
  return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
};
async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((it) => it.str ?? "").join(" ") + "\n";
  return text;
}

// --- Page de connexion ------------------------------------------------------------------------------------------------
const login = await (await fetch(BASE + "/login")).text();
check("connexion : bandeau de démonstration et comptes fictifs affichés", login.includes("MODE DÉMONSTRATION") && login.includes("admin@demo.test") && login.includes("Demo-Admin-2026"));

const admin = new Session();
await admin.submit("/login", "email", { email: "admin@demo.test", password: "Demo-Admin-2026" });
check("connexion avec le compte de démonstration", admin.cookie !== "");
let g = await admin.get("/");
check("tableau de bord de démonstration", g.status === 200 && g.html.includes("MODE DÉMONSTRATION") && g.html.includes("CA HT du mois"));

// --- Données de démonstration ------------------------------------------------------------------------------------------------
g = await admin.get("/factures");
check("factures de démonstration présentes", g.html.includes("Client Démo Alpha SARL") && g.html.includes("Client Démo Beta SA"));
g = await admin.get("/clients");
check("clients fictifs uniquement", g.html.includes("Client Démo Alpha SARL") && g.html.includes("REJET-DEMO") && !g.html.includes("Société Alpha"));
g = await admin.get("/parametres");
check("société fictive", g.html.includes("ACME DEMO SARL (données fictives)") && g.html.includes("0000000A/A/M/000"));

// --- Facture déjà acceptée par la TTN simulée : QR code sur le PDF -------------------------------------------------
const links = [...(await admin.get("/factures")).html.matchAll(/href="(\/factures\/[0-9a-f-]{36})"/g)].map((m) => m[1]);
let acceptedPath = null;
let rejectedPath = null;
for (const p of [...new Set(links)]) {
  const html = (await admin.get(p)).html;
  if (html.includes("Accepté par la TTN simulée") && !acceptedPath) acceptedPath = p;
  if (html.includes("Rejeté") && html.includes("REJET-DEMO") && !rejectedPath) rejectedPath = p;
}
check("une facture acceptée par la TTN simulée existe", !!acceptedPath);
check("une facture rejetée (client REJET-DEMO) existe", !!rejectedPath);
g = await admin.get(acceptedPath);
check("fiche : section SIMULATION, référence MOCK-TTN, XML signé téléchargeable", g.html.includes("SIMULATION") && /MOCK-TTN-[0-9A-F]{10}/.test(g.html) && g.html.includes("Télécharger le XML signé"));
let pdf = await raw(admin, `${acceptedPath}/pdf`);
const txt = await pdfText(pdf.bytes);
check("PDF de la facture acceptée : QR de démonstration et mention sans valeur", pdf.status === 200 && txt.includes("DÉMONSTRATION") && txt.includes("MOCK-TTN-") && txt.includes("aucune valeur"), `${pdf.status}`);
const signed = await raw(admin, `${acceptedPath}/teif?signed=1`);
const signedText = Buffer.from(signed.bytes).toString("utf8");
check("XML signé de démonstration : élément DemoSignature déclaré simulé", signed.status === 200 && signedText.includes('<DemoSignature mode="SIMULATION" official="false"') && /DEMO-signe\.xml/.test(signed.headers.get("content-disposition") ?? ""));
g = await admin.get(rejectedPath);
check("fiche de la facture rejetée : motif de rejet simulé", g.html.includes("Rejeté") && g.html.includes("[SIMULATION]"));
let r = await admin.submit(rejectedPath, "text:Préparer, signer et envoyer", {});
check("nouvel essai sur le client REJET-DEMO : rejeté à nouveau, historique conservé", dec(r.location).includes("Rejeté") && ((await admin.get(rejectedPath)).html.match(/Rejeté ·/g)?.length ?? 0) >= 2, r.location ?? "");

// --- Parcours complet d'une nouvelle facture -------------------------------------------------------------------------------
g = await admin.get("/factures/nouveau");
const alpha = /<option value="([0-9a-f-]{36})">CLI-\d+ · Client Démo Alpha SARL/.exec(g.html)?.[1];
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>19 %</.exec(g.html)?.[1];
check("éditeur : client fictif et TVA proposés", !!alpha && !!tva19);
const line = { productId: "", description: "Prestation de démonstration", quantity: "3", unit: "h", unitPrice: "100", discountPercent: "0", tvaRateId: tva19, fodecApplicable: false };
r = await admin.submit("/factures/nouveau", "payload", { payload: JSON.stringify({ customerId: alpha, issueDate: today, dueDate: "", paymentTermId: "", reference: "DEMO-PARCOURS", notes: "", lines: [line] }) });
const draftPath = pathOf(r.location);
check("1. brouillon créé", /^\/factures\/[0-9a-f-]{36}$/.test(draftPath ?? ""), r.location ?? "");
r = await admin.submit(draftPath, "text:Valider et numéroter", { id: id(draftPath) });
check("2. facture validée et numérotée", /Document valid/.test(dec(r.location)), r.location ?? "");
g = await admin.get(draftPath);
check("3. avant l'envoi : pas de QR, bouton de simulation proposé", g.html.includes("Préparer, signer et envoyer (SIMULATION)") && !g.html.includes("Accepté par la TTN simulée"));
pdf = await raw(admin, `${draftPath}/pdf`);
check("3b. PDF sans QR de démonstration avant l'envoi", !(await pdfText(pdf.bytes)).includes("MOCK-TTN-"));
r = await admin.submit(draftPath, "text:Préparer, signer et envoyer", {});
check("4. préparé, signé (simulé) et accepté par la TTN simulée", dec(r.location).includes("Accepté par la TTN SIMULÉE"), r.location ?? "");
g = await admin.get(draftPath);
check("5. fiche : accepté, référence, XML signé, carte TEIF avec le fichier préparé", /MOCK-TTN-[0-9A-F]{10}/.test(g.html) && g.html.includes("Télécharger le XML signé") && g.html.includes("Télécharger le XML"));
pdf = await raw(admin, `${draftPath}/pdf`);
check("6. PDF avec le QR de démonstration", (await pdfText(pdf.bytes)).includes("MOCK-TTN-"));
r = await admin.submit(draftPath, "text:Préparer, signer et envoyer", {}).catch(() => ({ location: "no-form" }));
check("7. impossible d'envoyer deux fois une facture acceptée", r.location === "no-form");
r = await admin.submit(draftPath, "message", { id: id(draftPath), to: "compta@alpha-demo.test", message: "Facture de démonstration" });
check("8. e-mail en mode test : annoncé comme simulé, rien n'est parti", dec(r.location).includes("Mode TEST") && dec(r.location).includes("simulé"), r.location ?? "");
r = await admin.submit(draftPath, "reason", { id: id(draftPath), reason: "Avoir de démonstration" });
const creditPath = pathOf(r.location);
check("9. avoir créé et rattaché", /^\/factures\/[0-9a-f-]{36}$/.test(creditPath ?? ""), r.location ?? "");
r = await admin.submit(creditPath, "text:Valider et numéroter", { id: id(creditPath) });
check("10. avoir validé", /Document valid/.test(dec(r.location)), r.location ?? "");
g = await admin.get(draftPath);
check("11. historique : création, validation, TEIF, TTN simulée, e-mail", ["Facture créée", "Facture validée et numérotée", "Fichier TEIF préparé", "Envoi à la TTN (SIMULATION)", "Envoyée par e-mail"].every((t) => g.html.includes(t)));
check("12. la facture validée reste non modifiable", !g.html.includes("Enregistrer le brouillon"));

// --- Rôles, sécurité et configuration ---------------------------------------------------------------------------------------
const seller = new Session();
await seller.submit("/login", "email", { email: "commercial@demo.test", password: "Demo-Vente-2026" });
g = await seller.get(draftPath);
check("commercial : voit l'état de la simulation sans pouvoir envoyer", g.status === 200 && !g.html.includes("Préparer, signer et envoyer"));
const formHtml = (await admin.get(rejectedPath)).html.split("<form").slice(1).find((f) => f.includes("Préparer, signer et envoyer"));
const fd = new FormData();
for (const m of formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
const before = (await admin.get(rejectedPath)).html.match(/Rejeté ·/g)?.length ?? 0;
await fetch(BASE + rejectedPath, { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
check("envoi TTN forgé par un commercial refusé côté serveur", ((await admin.get(rejectedPath)).html.match(/Rejeté ·/g)?.length ?? 0) === before);
check("XML signé non accessible sans connexion", (await fetch(BASE + `${acceptedPath}/teif?signed=1`, { redirect: "manual" })).status === 307);
g = await admin.get("/parametres/configuration");
check("configuration : mode démonstration signalé, aucun secret", g.html.includes("Mode démonstration") && g.html.includes("SIMULÉS") && !g.html.includes("Demo-Admin-2026"));
for (const p of ["/rapports", "/rapports?tab=balance", "/rapports?tab=tva", "/devis", "/paiements", "/stock", "/relances", "/audit"]) {
  const res = await admin.get(p);
  check(`page ${p} sans erreur avec les données de démonstration`, res.status === 200 && !/\bNaN\b|\[object Object\]/.test(res.html.replace(/<script[\s\S]*?<\/script>/g, "")));
}

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES DU PARCOURS DE DÉMONSTRATION PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

// Test de bout en bout : soumet les vrais formulaires (Server Actions) contre le serveur Next.js.
const BASE = "http://127.0.0.1:3100";
let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};

class Session {
  cookie = "";
  async get(path) {
    const res = await fetch(BASE + path, { headers: { cookie: this.cookie }, redirect: "manual" });
    return { status: res.status, location: res.headers.get("location"), html: await res.text() };
  }
  /** Soumet le formulaire de `path` qui contient le champ `anchor`, avec `fields`. */
  async submit(path, anchor, fields) {
    const { html } = await this.get(path);
    const form = html.split("<form").slice(1).find((f) => anchor.startsWith("text:") ? f.includes(anchor.slice(5)) : f.includes(`name="${anchor}"`));
    if (!form) throw new Error(`formulaire introuvable sur ${path} (champ ${anchor})`);
    const fd = new FormData();
    for (const m of form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) {
      fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    }
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    const res = await fetch(BASE + path, { method: "POST", body: fd, headers: { cookie: this.cookie, origin: BASE }, redirect: "manual" });
    const setCookie = res.headers.getSetCookie?.().find((c) => c.startsWith("erp_session="));
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const location = res.headers.get("location");
    return { status: res.status, location: location ? decodeURIComponent(location) : null };
  }
}

const admin = new Session();
let r = await admin.submit("/login", "email", { email: "admin@example.tn", password: "ChangeMe-12345" });
check("connexion administrateur", r.status === 303 && admin.cookie !== "");

for (const p of ["/parametres", "/parametres/taxes", "/parametres/conditions", "/parametres/numerotation", "/clients", "/produits", "/clients/nouveau", "/produits/nouveau"]) {
  const g = await admin.get(p);
  check(`GET ${p}`, g.status === 200, String(g.status));
}

let g = await admin.get("/parametres/taxes");
check("taux TVA/FODEC initiaux affichés", ["TVA19", "TVA13", "TVA7", "TVA0", "FODEC1"].every((c) => g.html.includes(c)));

r = await admin.submit("/parametres/taxes", "rate", { code: "RAS15", label: "Retenue 1,5 %", kind: "retenue", rate: "1,5" });
check("création d'un taux de retenue", r.location?.includes("ok=Taux cr"), r.location ?? "");
g = await admin.get("/parametres/taxes");
check("taux visible avec format français", g.html.includes("RAS15") && g.html.includes("1,5"));

r = await admin.submit("/parametres/taxes", "rate", { code: "ras15", label: "Doublon", kind: "retenue", rate: "2" });
check("code de taux en double refusé", r.location?.includes("error=Ce code"), r.location ?? "");
r = await admin.submit("/parametres/taxes", "rate", { code: "BAD", label: "Trop grand", kind: "tva", rate: "150" });
check("taux > 100 refusé", r.location?.includes("error="), r.location ?? "");

r = await admin.submit("/parametres", "legalName", {
  legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", taxRegime: "reel", vatRegistered: "on",
  stampDutyEnabled: "on", stampDutyAmount: "1", capital: "10 000", withholdingBase: "ttc", withholdingThreshold: "0",
});
check("enregistrement de la société", r.location?.includes("ok=Soci"), r.location ?? "");
g = await admin.get("/parametres");
check("société relue", g.html.includes("ACME SARL") && g.html.includes("1.000"));

// Clients
r = await admin.submit("/clients/nouveau", "name", { name: "Sans MF", type: "entreprise", taxStatus: "assujetti", matriculeFiscal: "" });
check("entreprise assujettie sans matricule refusée", r.location?.includes("error=Le matricule"), r.location ?? "");

r = await admin.submit("/clients/nouveau", "name", {
  name: "Société Alpha", type: "entreprise", taxStatus: "assujetti", matriculeFiscal: "1234567/A/M/000",
  email: "compta@alpha.tn", withholdingApplies: "on", withholdingRateId: "", city: "Tunis", country: "tn",
});
check("retenue sans taux refusée", r.location?.includes("error=Choisissez"), r.location ?? "");

const rasId = /<option value="([0-9a-f-]{36})">Retenue 1,5 %/.exec((await admin.get("/clients/nouveau")).html)?.[1];
check("taux de retenue proposé dans le formulaire", !!rasId);
r = await admin.submit("/clients/nouveau", "name", {
  name: "Société Alpha", type: "entreprise", taxStatus: "assujetti", matriculeFiscal: "1234567/A/M/000",
  email: "compta@alpha.tn", withholdingApplies: "on", withholdingRateId: rasId, city: "Tunis", country: "tn",
});
const customerPath = r.location?.split("?")[0];
check("client créé, redirigé vers sa fiche", /^\/clients\/[0-9a-f-]{36}$/.test(customerPath ?? ""), r.location ?? "");
g = await admin.get(customerPath);
check("code CLI-00001 attribué, pays en majuscules", g.html.includes("CLI-00001") && g.html.includes('value="TN"'));

r = await admin.submit(customerPath, "isBilling", { customerId: g.html.match(/name="customerId" value="([^"]+)"/)[1], name: "Karim", email: "karim@alpha.tn", isBilling: "on" });
check("contact ajouté", r.location?.includes("ok=Contact"), r.location ?? "");
g = await admin.get(customerPath);
check("contact affiché", g.html.includes("Karim") && g.html.includes("facturation"));

let l = await admin.get("/clients?q=alpha");
check("recherche client", l.html.includes("Société Alpha") && l.html.includes("CLI-00001"));
l = await admin.get("/clients?q=zzz");
check("recherche sans résultat", l.html.includes("Aucun client"));

// Articles
const tva19 = /<option value="([0-9a-f-]{36})"[^>]*>TVA 19 %/.exec((await admin.get("/produits/nouveau")).html)?.[1];
r = await admin.submit("/produits/nouveau", "unitPrice", { name: "Ciment 50 kg", type: "bien", unit: "sac", unitPrice: "12,5", tvaRateId: tva19, fodecApplicable: "on" });
check("article créé", /^\/produits\/[0-9a-f-]{36}/.test(r.location ?? ""), r.location ?? "");
r = await admin.submit("/produits/nouveau", "unitPrice", { name: "Prix faux", type: "bien", unit: "sac", unitPrice: "1.2345", tvaRateId: tva19 });
check("prix à 4 décimales refusé", r.location?.includes("error="), r.location ?? "");
l = await admin.get("/produits");
check("liste articles : code, prix et TVA formatés", l.html.includes("ART-00001") && l.html.includes("12,500") && l.html.includes("19 %"));

// Numérotation
r = await admin.submit("/parametres/numerotation", "prefix", { docType: "invoice", prefix: "fa", padLength: "6", resetYearly: "on" });
check("format de numérotation modifiable avant usage", r.location?.includes("ok="), r.location ?? "");
g = await admin.get("/parametres/numerotation");
check("exemple de numéro recalculé", g.html.includes("FA-" + new Date().getFullYear() + "-000001"));

// Rôle commercial : créer via l'interface admin, puis se connecter
r = await admin.submit("/utilisateurs", "password", { name: "Vendeur", email: "vendeur@example.tn", role: "commercial", password: "Password-12345" });
check("utilisateur commercial créé", r.location?.includes("ok="), r.location ?? "");
const seller = new Session();
await seller.submit("/login", "email", { email: "vendeur@example.tn", password: "Password-12345" });
check("connexion commercial", seller.cookie !== "");
check("commercial : /clients/nouveau autorisé", (await seller.get("/clients/nouveau")).status === 200);
check("commercial : /produits/nouveau refusé", (await seller.get("/produits/nouveau")).location === "/acces-refuse");
g = await seller.get("/parametres");
check("commercial : paramètres en lecture seule (pas de bouton)", g.status === 200 && !g.html.includes("Enregistrer"));
g = await seller.get("/parametres/taxes");
check("commercial : pas de formulaire de taxe", g.status === 200 && !g.html.includes('name="rate"'));
// Une action appelée directement sans droit doit être refusée côté serveur, même sans bouton.
const forged = await admin.get("/parametres/taxes");
const fd = new FormData();
for (const m of forged.html.split("<form").slice(1).find((f) => f.includes('name="rate"')).matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fd.set(m[1], (m[2] ?? "").replaceAll("&quot;", '"'));
Object.entries({ code: "HACK", label: "Hack", kind: "tva", rate: "0" }).forEach(([k, v]) => fd.set(k, v));
const res = await fetch(BASE + "/parametres/taxes", { method: "POST", body: fd, headers: { cookie: seller.cookie, origin: BASE }, redirect: "manual" });
const after = await admin.get("/parametres/taxes");
check("action forgée par un commercial refusée côté serveur", !after.html.includes("HACK"), `HTTP ${res.status} ${res.headers.get("location") ?? ""}`);

console.log(failures === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${failures} ÉCHEC(S)`);
process.exit(failures ? 1 : 0);

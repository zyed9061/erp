// Test de bout en bout : soumet les vrais formulaires (Server Actions) contre le serveur Next.js.
export const BASE = "http://127.0.0.1:3100";
export let failures = 0;
export const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};

export class Session {
  cookie = "";
  async get(path) {
    const res = await fetch(BASE + path, { headers: { cookie: this.cookie }, redirect: "manual" });
    return { status: res.status, location: res.headers.get("location"), html: (await res.text()).replaceAll("<!-- -->", "") };
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


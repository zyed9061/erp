import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les réponses. La CSP se limite volontairement aux directives qui ne dépendent pas
// des scripts inline de Next.js (anti-clickjacking, base, formulaires, objets) : une CSP stricte sur les scripts demandera des
// nonces et sera ajoutée séparément.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  ...(process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"
    ? [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }]
    : []),
];

const config: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // Next.js 16 génère sinon des fichiers AGENTS.md/CLAUDE.md dans le projet au premier `next dev`.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;

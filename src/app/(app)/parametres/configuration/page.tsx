import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { checkData, checkEnvironment, type CheckStatus } from "@/lib/config-check";
import { Badge, Flash, type Tone } from "@/components/ui";
import { sendTestEmailAction } from "../actions";

export const dynamic = "force-dynamic";

const BADGE: Record<CheckStatus, { label: string; tone: Tone }> = {
  ok: { label: "Prêt", tone: "ok" },
  info: { label: "Info", tone: "info" },
  warn: { label: "À faire", tone: "warn" },
  error: { label: "Erreur", tone: "bad" },
};

export default async function ConfigurationPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePermission("settings:manage");
  const { ok, error } = await searchParams;
  const checks = [...checkEnvironment(), ...(await checkData(db))];

  return (
    <div className="space-y-4">
      <Flash ok={ok} error={error} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        État de la configuration du serveur. Aucun secret n&apos;est affiché : seulement s&apos;il est renseigné ou non.
        Les variables se modifient dans le fichier <code>.env</code> (ou l&apos;environnement de l&apos;hébergeur), puis on redémarre l&apos;application.
      </p>
      <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
        {checks.map((c) => (
          <div key={c.id} className="p-4 space-y-1" style={{ borderColor: "var(--border)" }}>
            <p className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{c.label}</span>
              <Badge tone={BADGE[c.status].tone}>{BADGE[c.status].label}</Badge>
            </p>
            <p className="text-sm">{c.detail}</p>
            {c.fix && <p className="text-sm" style={{ color: "var(--muted)" }}>À faire : {c.fix}</p>}
          </div>
        ))}
      </div>
      <form action={sendTestEmailAction} className="card p-4 flex items-center gap-3 flex-wrap">
        <button className="btn btn-ghost">Envoyer un e-mail de test à mon adresse</button>
        <span className="text-sm" style={{ color: "var(--muted)" }}>Sans SMTP configuré, rien ne part : le message est seulement écrit dans la console du serveur.</span>
      </form>
    </div>
  );
}

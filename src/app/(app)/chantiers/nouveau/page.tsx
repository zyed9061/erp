import { requirePermission } from "@/lib/auth/session";
import { Flash, PageHeader } from "@/components/ui";
import { saveProjectAction } from "../actions";
import { loadProjectEditorData } from "../editor-data";
import { ProjectEditor } from "../project-editor";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("projects:write");
  const { error } = await searchParams;
  const data = await loadProjectEditorData();
  const tva19 = data.tvaRates.find((t) => t.code === "TVA19")?.id ?? data.tvaRates[0]?.id ?? "";
  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader title="Nouveau chantier" />
      <Flash error={error} />
      <ProjectEditor
        action={saveProjectAction} customers={data.customers} tvaRates={data.tvaRates} submitLabel="Créer le chantier"
        initial={{ name: "", description: "", customerId: "", holdbackPercent: "0", lines: [{ description: "", unit: "u", quantity: "1", unitPrice: "0", tvaRateId: tva19 }] }}
      />
    </div>
  );
}

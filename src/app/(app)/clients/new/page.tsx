import { ClientForm } from "@/components/ClientForm";
import { createClient } from "@/lib/actions/clients";

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nouveau client</h1>
      <ClientForm action={createClient} />
    </div>
  );
}

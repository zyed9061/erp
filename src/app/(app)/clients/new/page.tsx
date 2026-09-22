import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ClientForm } from "@/components/ClientForm";
import { createClient } from "@/lib/actions/clients";

export default function NewClientPage() {
  return (
    <div className="space-y-3">
      <Breadcrumbs />
      <ClientForm action={createClient} />
    </div>
  );
}

"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { deactivateProduit, activateProduit } from "@/lib/actions/produits";

export type ProduitActionRow = { id: string; designation: string; actif: boolean };

/** Actions de ligne du catalogue (menu "...") et confirmation d'activation / desactivation. */
export function useProduitRowActions() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [toggleTarget, setToggleTarget] = useState<ProduitActionRow | null>(null);

  function handleToggle() {
    if (!toggleTarget) return;
    const target = toggleTarget;
    startTransition(async () => {
      try {
        if (target.actif) {
          await deactivateProduit(target.id);
          showSuccess(`${target.designation} a ete desactive.`);
        } else {
          await activateProduit(target.id);
          showSuccess(`${target.designation} a ete active.`);
        }
        setToggleTarget(null);
        router.refresh();
      } catch {
        showError("Une erreur est survenue.");
      }
    });
  }

  const actionsFor = useCallback(
    (row: ProduitActionRow): RowAction[] => [
      { label: "Modifier", onSelect: () => router.push(`/produits/${row.id}`) },
      {
        label: row.actif ? "Desactiver" : "Activer",
        destructive: row.actif,
        onSelect: () => setToggleTarget(row),
      },
    ],
    [router],
  );

  const dialogs = (
    <ConfirmDialog
      open={Boolean(toggleTarget)}
      title={toggleTarget?.actif ? "Desactiver cet element ?" : "Activer cet element ?"}
      description={
        toggleTarget?.actif
          ? `${toggleTarget?.designation} ne sera plus propose dans les devis et factures.`
          : `${toggleTarget?.designation} sera de nouveau disponible.`
      }
      destructive={Boolean(toggleTarget?.actif)}
      pending={isPending}
      confirmLabel={toggleTarget?.actif ? "Desactiver" : "Activer"}
      onConfirm={handleToggle}
      onCancel={() => setToggleTarget(null)}
    />
  );

  return { actionsFor, dialogs };
}

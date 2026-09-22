"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { deactivateProduit, activateProduit } from "@/lib/actions/produits";

export type ProduitActionRow = { id: string; designation: string; actif: boolean };

/** Actions de ligne du catalogue (menu "...") et confirmation d'activation / desactivation. */
export function useProduitRowActions() {
  const router = useRouter();
  const { t } = useLocale();
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
          showSuccess(t("products.toastDeactivated", { name: target.designation }));
        } else {
          await activateProduit(target.id);
          showSuccess(t("products.toastActivated", { name: target.designation }));
        }
        setToggleTarget(null);
        router.refresh();
      } catch {
        showError(t("common.error"));
      }
    });
  }

  const actionsFor = useCallback(
    (row: ProduitActionRow): RowAction[] => [
      { label: t("common.edit"), onSelect: () => router.push(`/produits/${row.id}`) },
      {
        label: t(row.actif ? "common.deactivate" : "common.activate"),
        destructive: row.actif,
        onSelect: () => setToggleTarget(row),
      },
    ],
    [router, t],
  );

  const name = toggleTarget?.designation ?? "";
  const dialogs = (
    <ConfirmDialog
      open={Boolean(toggleTarget)}
      title={t(toggleTarget?.actif ? "products.deactivateConfirmTitle" : "products.activateConfirmTitle")}
      description={t(
        toggleTarget?.actif
          ? "products.deactivateConfirmDescription"
          : "products.activateConfirmDescription",
        { name },
      )}
      destructive={Boolean(toggleTarget?.actif)}
      pending={isPending}
      confirmLabel={t(toggleTarget?.actif ? "common.deactivate" : "common.activate")}
      onConfirm={handleToggle}
      onCancel={() => setToggleTarget(null)}
    />
  );

  return { actionsFor, dialogs };
}

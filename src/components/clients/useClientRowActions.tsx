"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RowAction } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { useLocale } from "@/i18n/client";
import { deactivateClient, activateClient } from "@/lib/actions/clients";

export type ClientActionRow = { id: string; nom: string; actif: boolean };

/** Actions de ligne des clients (menu "...") et confirmation d'archivage / reactivation. */
export function useClientRowActions() {
  const router = useRouter();
  const { t } = useLocale();
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [archiveTarget, setArchiveTarget] = useState<ClientActionRow | null>(null);

  function handleArchive() {
    if (!archiveTarget) return;
    const target = archiveTarget;
    startTransition(async () => {
      try {
        if (target.actif) {
          await deactivateClient(target.id);
          showSuccess(t("clients.toastArchived", { name: target.nom }));
        } else {
          await activateClient(target.id);
          showSuccess(t("clients.toastReactivated", { name: target.nom }));
        }
        setArchiveTarget(null);
        router.refresh();
      } catch {
        showError(t("common.error"));
      }
    });
  }

  const actionsFor = useCallback(
    (row: ClientActionRow): RowAction[] => [
      { label: t("clients.actionViewProfile"), onSelect: () => router.push(`/clients/${row.id}`) },
      { label: t("common.edit"), onSelect: () => router.push(`/clients/${row.id}`) },
      {
        label: t("clients.actionCreateQuote"),
        onSelect: () => router.push(`/devis/new?clientId=${row.id}`),
      },
      {
        label: t("clients.actionCreateInvoice"),
        onSelect: () => router.push(`/factures/new?clientId=${row.id}`),
      },
      {
        label: t(row.actif ? "common.archive" : "common.reactivate"),
        destructive: row.actif,
        onSelect: () => setArchiveTarget(row),
      },
    ],
    [router, t],
  );

  const dialogs = (
    <ConfirmDialog
      open={Boolean(archiveTarget)}
      title={t(archiveTarget?.actif ? "clients.archiveConfirmTitle" : "clients.reactivateConfirmTitle")}
      description={t(
        archiveTarget?.actif ? "clients.archiveConfirmDescription" : "clients.reactivateConfirmDescription",
        { name: archiveTarget?.nom ?? "" },
      )}
      destructive={Boolean(archiveTarget?.actif)}
      pending={isPending}
      confirmLabel={t(archiveTarget?.actif ? "common.archive" : "common.reactivate")}
      onConfirm={handleArchive}
      onCancel={() => setArchiveTarget(null)}
    />
  );

  return { actionsFor, dialogs };
}

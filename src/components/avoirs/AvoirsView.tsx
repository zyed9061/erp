"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { formatMontant } from "@/lib/format";
import { gridVariants } from "@/components/ui/motion";
import { ENTITY } from "@/components/ui/entity-theme";
import { PageHero } from "@/components/ui/PageHero";
import { StatCard } from "@/components/ui/StatCard";
import { FilterBar } from "@/components/ui/Filters";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Card,
  CardField,
  ActionsCell,
  CardSection,
  Cell,
  CellLink,
  ListFooter,
  Row,
  TableSection,
} from "@/components/ui/ListShell";
import { IconChart, IconRefund, IconUsers, IconReceipt } from "@/components/ui/icons";
import { StatutPill } from "@/components/ui/StatutPill";
import { useAvoirRowActions } from "./useAvoirRowActions";
import { useLocale } from "@/i18n/client";
import { tp } from "@/i18n/plural";

export type AvoirRow = {
  id: string;
  numero: string;
  clientNom: string;
  factureId: string;
  factureNumero: string;
  dateEmission: string;
  motif: string | null;
  totalTTC: number;
  statut: string;
};

const T = ENTITY.avoirs;

export function AvoirsView({ avoirs }: { avoirs: AvoirRow[] }) {
  const [query, setQuery] = useState("");
  const { actionsFor } = useAvoirRowActions();
  const { t, locale } = useLocale();
  const fmt = (n: number) => formatMontant(n, "TND", locale);

  const stats = useMemo(() => {
    const total = avoirs.reduce((s, a) => s + a.totalTTC, 0);
    return {
      nb: avoirs.length,
      total,
      clients: new Set(avoirs.map((a) => a.clientNom)).size,
      moyenne: avoirs.length > 0 ? total / avoirs.length : 0,
    };
  }, [avoirs]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return avoirs;
    return avoirs.filter((a) =>
      [a.numero, a.clientNom, a.factureNumero, a.motif]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [avoirs, query]);

  const filtresActifs = Boolean(query.trim());

  const vide = visibles.length === 0 && (
    <EmptyState
      filtre={filtresActifs}
      onReset={() => setQuery("")}
      titre={t("views.creditNotes.emptyTitle")}
      message={t("views.creditNotes.emptyMessage")}
      accent={T.emptyAccent}
      link={T.emptyLink}
      icon={<IconRefund className="h-7 w-7" />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={t("views.creditNotes.eyebrow")}
        title={t("creditNotes.title")}
        subtitle={
          stats.nb === 0
            ? t("views.creditNotes.subtitleEmpty")
            : tp(t, "views.creditNotes.subtitle", stats.nb, { amount: fmt(stats.total) })
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label={t("views.creditNotes.statIssued")}
          value={stats.nb}
          format={(n) => String(Math.round(n))}
          hint={t("views.creditNotes.statIssuedHint")}
          accent="from-rose-500 to-pink-500"
          glow="hover:shadow-rose-500/10"
          icon={<IconRefund className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label={t("views.creditNotes.statAmount")}
          value={stats.total}
          format={(n) => fmt(n)}
          hint={t("views.creditNotes.statAmountHint")}
          accent="from-violet-500 to-purple-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconReceipt className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label={t("views.creditNotes.statClients")}
          value={stats.clients}
          format={(n) => String(Math.round(n))}
          hint={t("views.creditNotes.statClientsHint")}
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconUsers className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label={t("views.creditNotes.statAverage")}
          value={stats.moyenne}
          format={(n) => fmt(n)}
          hint={t("views.creditNotes.statAverageHint")}
          accent="from-amber-400 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconChart className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder={t("views.creditNotes.searchPlaceholder")}
        focus={T.focus}
      >
        <p className="px-2 text-xs text-neutral-500">
          {t("views.creditNotes.filterHint")}
        </p>
      </FilterBar>

      <TableSection
        headers={[
          t("documents.columnNumber"),
          t("documents.columnClient"),
          t("creditNotes.originInvoice"),
          t("creditNotes.columnReason"),
          t("documents.columnDate"),
          t("documents.totalTTC"),
          t("documents.columnStatus"),
          "",
        ]}
        empty={vide || undefined}
      >
        {visibles.map((a) => (
          <Row key={a.id} hover={T.rowHover}>
            <CellLink
              href={`/avoirs/${a.id}`}
              label={a.numero}
              accent={T.accent}
              hoverText={T.linkHover}
            />
            <Cell>{a.clientNom}</Cell>
            <Cell>
              <Link
                href={`/factures/${a.factureId}`}
                className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200 transition-colors hover:bg-violet-100"
              >
                {a.factureNumero}
              </Link>
            </Cell>
            <Cell className="max-w-[220px] truncate text-neutral-600">{a.motif || "—"}</Cell>
            <Cell className="text-neutral-500">{a.dateEmission}</Cell>
            <Cell className="font-medium tabular-nums text-rose-600">
              -{fmt(a.totalTTC)}
            </Cell>
            <Cell>
              <StatutPill statut={a.statut} />
            </Cell>
            <ActionsCell actions={actionsFor(a)} label={t("common.actionsFor", { name: a.numero })} />
          </Row>
        ))}
      </TableSection>

      <CardSection empty={vide || undefined}>
        {visibles.map((a) => (
          <Card key={a.id} href={`/avoirs/${a.id}`} accent={T.accent}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{a.numero}</p>
                <p className="truncate text-sm text-neutral-600">{a.clientNom}</p>
              </div>
              <span className="shrink-0 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                {a.factureNumero}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <CardField
                label={t("documents.totalTTC")}
                value={`-${fmt(a.totalTTC)}`}
                className="text-rose-600"
              />
              <CardField
                label={t("documents.columnDate")}
                value={a.dateEmission}
                align="right"
                className="text-sm text-neutral-700"
              />
            </div>
          </Card>
        ))}
      </CardSection>

      {visibles.length > 0 && (
        <ListFooter>
          {tp(t, "views.creditNotes.footer", visibles.length)}
        </ListFooter>
      )}
    </div>
  );
}

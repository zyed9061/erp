"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { formatMontant } from "@/lib/format";
import { gridVariants } from "@/components/ui/motion";
import { ENTITY } from "@/components/ui/entity-theme";
import { DEVIS_STATUTS, themeFor } from "@/components/ui/statut";
import { PageHero } from "@/components/ui/PageHero";
import { StatCard } from "@/components/ui/StatCard";
import { StatutPill } from "@/components/ui/StatutPill";
import { FilterBar, FilterChip } from "@/components/ui/Filters";
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
import {
  IconCheckCircle,
  IconFileText,
  IconHourglass,
  IconPercent,
} from "@/components/ui/icons";
import { useDevisRowActions } from "./useDevisRowActions";
import { useLocale } from "@/i18n/client";
import { tp } from "@/i18n/plural";

export type DevisRow = {
  id: string;
  numero: string;
  clientNom: string;
  clientEmail: string | null;
  dateEmission: string;
  dateValidite: string | null;
  totalTTC: number;
  statut: string;
  hasFacture: boolean;
};

const T = ENTITY.devis;
const EN_ATTENTE = new Set(["BROUILLON", "ENVOYE"]);
const GAGNES = new Set(["ACCEPTE", "CONVERTI"]);

export function DevisView({ devis }: { devis: DevisRow[] }) {
  const [query, setQuery] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const { actionsFor } = useDevisRowActions();
  const { t, locale } = useLocale();
  const fmt = (n: number) => formatMontant(n, "TND", locale);

  const stats = useMemo(() => {
    const enAttente = devis.filter((d) => EN_ATTENTE.has(d.statut));
    const gagnes = devis.filter((d) => GAGNES.has(d.statut));
    // Taux d'acceptation : sur les devis tranches uniquement (hors brouillons/envoyes).
    const tranches = devis.filter((d) => !EN_ATTENTE.has(d.statut));
    return {
      montantTotal: devis.reduce((s, d) => s + d.totalTTC, 0),
      montantEnAttente: enAttente.reduce((s, d) => s + d.totalTTC, 0),
      nbEnAttente: enAttente.length,
      montantGagne: gagnes.reduce((s, d) => s + d.totalTTC, 0),
      nbGagnes: gagnes.length,
      taux: tranches.length > 0 ? (gagnes.length / tranches.length) * 100 : 0,
      nbTranches: tranches.length,
      nbTotal: devis.length,
    };
  }, [devis]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of devis) map[d.statut] = (map[d.statut] ?? 0) + 1;
    return map;
  }, [devis]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devis.filter((d) => {
      if (statut && d.statut !== statut) return false;
      if (!q) return true;
      return d.numero.toLowerCase().includes(q) || d.clientNom.toLowerCase().includes(q);
    });
  }, [devis, query, statut]);

  const filtresActifs = Boolean(query.trim() || statut);
  const reinitialiser = () => {
    setQuery("");
    setStatut(null);
  };

  const vide = visibles.length === 0 && (
    <EmptyState
      filtre={filtresActifs}
      onReset={reinitialiser}
      titre={t("views.quotes.emptyTitle")}
      message={t("views.quotes.emptyMessage")}
      action={{ href: "/devis/new", label: t("quotes.newQuote") }}
      accent={T.emptyAccent}
      link={T.emptyLink}
      icon={<IconFileText className="h-7 w-7" />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={t("views.quotes.eyebrow")}
        title={t("quotes.title")}
        subtitle={
          stats.nbTotal === 0
            ? t("views.quotes.subtitleEmpty")
            : tp(t, "views.quotes.subtitle", stats.nbTotal, {
                amount: fmt(stats.montantEnAttente),
              })
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
        action={{ href: "/devis/new", label: t("quotes.newQuote") }}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label={t("views.quotes.statTotal")}
          value={stats.montantTotal}
          format={(n) => fmt(n)}
          hint={t("views.quotes.statTotalHint")}
          accent="from-amber-500 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconFileText className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label={t("views.quotes.statPending")}
          value={stats.montantEnAttente}
          format={(n) => fmt(n)}
          hint={
            stats.nbEnAttente > 0
              ? tp(t, "views.quotes.statPendingHint", stats.nbEnAttente)
              : t("views.quotes.statPendingNone")
          }
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconHourglass className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label={t("views.quotes.statWon")}
          value={stats.montantGagne}
          format={(n) => fmt(n)}
          hint={
            stats.nbGagnes > 0
              ? tp(t, "views.quotes.statWonHint", stats.nbGagnes)
              : t("views.quotes.statWonNone")
          }
          accent="from-emerald-500 to-teal-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconCheckCircle className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label={t("views.quotes.statRate")}
          value={stats.taux}
          format={(n) => `${Math.round(n)}%`}
          hint={
            stats.nbTranches > 0
              ? tp(t, "views.quotes.statRateHint", stats.nbTranches)
              : t("views.quotes.statRateNone")
          }
          accent="from-violet-500 to-purple-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconPercent className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder={t("views.quotes.searchPlaceholder")}
        focus={T.focus}
      >
        <FilterChip
          label={t("views.common.all")}
          count={devis.length}
          actif={statut === null}
          onClick={() => setStatut(null)}
          classesActif="bg-neutral-900 text-white"
          classesInactif="text-neutral-600 hover:bg-neutral-100"
        />
        {DEVIS_STATUTS.filter((s) => counts[s]).map((s) => {
          const theme = themeFor(s);
          return (
            <FilterChip
              key={s}
              label={t(`status.${s}`)}
              count={counts[s]}
              actif={statut === s}
              onClick={() => setStatut(statut === s ? null : s)}
              classesActif={theme.chipActive}
              classesInactif={theme.chip}
            />
          );
        })}
      </FilterBar>

      <TableSection
        headers={[
          t("documents.columnNumber"),
          t("documents.columnClient"),
          t("documents.columnDate"),
          t("views.quotes.columnValidity"),
          t("documents.totalTTC"),
          t("documents.columnStatus"),
          "",
        ]}
        empty={vide || undefined}
      >
        {visibles.map((d) => (
          <Row key={d.id} hover={T.rowHover}>
            <CellLink
              href={`/devis/${d.id}`}
              label={d.numero}
              accent={themeFor(d.statut).accent}
              hoverText={T.linkHover}
            />
            <Cell>{d.clientNom}</Cell>
            <Cell className="text-neutral-500">{d.dateEmission}</Cell>
            <Cell className="text-neutral-500">{d.dateValidite || "—"}</Cell>
            <Cell className="font-medium tabular-nums text-neutral-900">
              {fmt(d.totalTTC)}
            </Cell>
            <Cell>
              <StatutPill statut={d.statut} />
            </Cell>
            <ActionsCell actions={actionsFor(d)} label={t("common.actionsFor", { name: d.numero })} />
          </Row>
        ))}
      </TableSection>

      <CardSection empty={vide || undefined}>
        {visibles.map((d) => (
          <Card key={d.id} href={`/devis/${d.id}`} accent={themeFor(d.statut).accent}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{d.numero}</p>
                <p className="truncate text-sm text-neutral-600">{d.clientNom}</p>
              </div>
              <StatutPill statut={d.statut} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <CardField label={t("documents.totalTTC")} value={fmt(d.totalTTC)} />
              <CardField
                label={t("views.quotes.columnValidity")}
                value={d.dateValidite || "—"}
                align="right"
                className="text-sm text-neutral-700"
              />
            </div>
          </Card>
        ))}
      </CardSection>

      {visibles.length > 0 && (
        <ListFooter>
          {tp(t, "views.quotes.footer", visibles.length)}
        </ListFooter>
      )}
    </div>
  );
}

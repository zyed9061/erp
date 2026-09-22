"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatMontant } from "@/lib/format";
import { EASE, gridVariants } from "@/components/ui/motion";
import { ENTITY } from "@/components/ui/entity-theme";
import { FACTURE_STATUTS, themeFor } from "@/components/ui/statut";
import { PageHero } from "@/components/ui/PageHero";
import { StatCard } from "@/components/ui/StatCard";
import { StatutPill } from "@/components/ui/StatutPill";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
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
  IconAlert,
  IconHourglass,
  IconReceipt,
  IconWallet,
} from "@/components/ui/icons";
import { useFactureRowActions } from "./useFactureRowActions";

export type FactureRow = {
  id: string;
  numero: string;
  clientNom: string;
  clientEmail: string | null;
  dateEmission: string;
  dateEcheance: string | null;
  totalTTC: number;
  montantPaye: number;
  reste: number;
  statut: string;
};

const T = ENTITY.factures;

/** Barre de progression de l'encaissement d'une facture. */
function ProgressBar({ paye, total, statut }: { paye: number; total: number; statut: string }) {
  const reduceMotion = useReducedMotion();
  const pct = total > 0 ? Math.min(100, Math.max(0, (paye / total) * 100)) : 0;
  const theme = themeFor(statut);

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-neutral-100">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`}
          // `initial` doit etre identique serveur/client : on ne branche pas sur
          // reduceMotion ici (cf. AnimatedNumber), seulement sur la duree.
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.9, ease: EASE, delay: 0.25 }
          }
        />
      </div>
      <span className="w-9 shrink-0 text-[11px] font-medium tabular-nums text-neutral-500">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export function FacturesView({ factures }: { factures: FactureRow[] }) {
  const [query, setQuery] = useState("");
  const [statut, setStatut] = useState<string | null>(null);
  const { actionsFor, dialogs } = useFactureRowActions();

  const stats = useMemo(() => {
    const vivantes = factures.filter((f) => f.statut !== "ANNULEE");
    return {
      totalFacture: vivantes.reduce((s, f) => s + f.totalTTC, 0),
      encaisse: vivantes.reduce((s, f) => s + f.montantPaye, 0),
      reste: vivantes.reduce((s, f) => s + f.reste, 0),
      enRetard: factures
        .filter((f) => f.statut === "EN_RETARD")
        .reduce((s, f) => s + f.reste, 0),
      nbEnRetard: factures.filter((f) => f.statut === "EN_RETARD").length,
      nbTotal: factures.length,
    };
  }, [factures]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of factures) map[f.statut] = (map[f.statut] ?? 0) + 1;
    return map;
  }, [factures]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return factures.filter((f) => {
      if (statut && f.statut !== statut) return false;
      if (!q) return true;
      return f.numero.toLowerCase().includes(q) || f.clientNom.toLowerCase().includes(q);
    });
  }, [factures, query, statut]);

  const filtresActifs = Boolean(query.trim() || statut);
  const reinitialiser = () => {
    setQuery("");
    setStatut(null);
  };

  const vide = visibles.length === 0 && (
    <EmptyState
      filtre={filtresActifs}
      onReset={reinitialiser}
      titre="Aucune facture pour le moment"
      message="Creez votre premiere facture : elle apparaitra ici avec son suivi d'encaissement."
      action={{ href: "/factures/new", label: "Nouvelle facture" }}
      accent={T.emptyAccent}
      link={T.emptyLink}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Facturation"
        title="Factures"
        subtitle={
          stats.nbTotal === 0
            ? "Aucun document pour le moment."
            : `${stats.nbTotal} document${stats.nbTotal > 1 ? "s" : ""} - ${formatMontant(stats.reste)} encore a encaisser.`
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
        action={{ href: "/factures/new", label: "Nouvelle facture" }}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label="Total facture"
          value={stats.totalFacture}
          format={(n) => formatMontant(n)}
          hint="Hors factures annulees"
          accent="from-indigo-500 to-violet-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconReceipt className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label="Encaisse"
          value={stats.encaisse}
          format={(n) => formatMontant(n)}
          hint={
            stats.totalFacture > 0
              ? `${Math.round((stats.encaisse / stats.totalFacture) * 100)}% du total`
              : "Aucun paiement"
          }
          accent="from-emerald-500 to-teal-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconWallet className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label="Reste a encaisser"
          value={stats.reste}
          format={(n) => formatMontant(n)}
          hint="Toutes factures ouvertes"
          accent="from-amber-400 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconHourglass className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label="En retard"
          value={stats.enRetard}
          format={(n) => formatMontant(n)}
          hint={
            stats.nbEnRetard > 0
              ? `${stats.nbEnRetard} facture${stats.nbEnRetard > 1 ? "s" : ""} concernee${stats.nbEnRetard > 1 ? "s" : ""}`
              : "Rien en souffrance"
          }
          accent="from-rose-500 to-red-500"
          glow="hover:shadow-rose-500/10"
          icon={<IconAlert className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Rechercher un numero, un client..."
        focus={T.focus}
      >
        <FilterChip
          label="Toutes"
          count={factures.length}
          actif={statut === null}
          onClick={() => setStatut(null)}
          classesActif="bg-neutral-900 text-white"
          classesInactif="text-neutral-600 hover:bg-neutral-100"
        />
        {FACTURE_STATUTS.filter((s) => counts[s]).map((s) => {
          const theme = themeFor(s);
          return (
            <FilterChip
              key={s}
              label={theme.label}
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
          "Numero",
          "Client",
          "Date",
          "Total TTC",
          "Encaissement",
          "Reste a payer",
          "Statut",
          "",
        ]}
        empty={vide || undefined}
      >
        {visibles.map((f) => (
          <Row key={f.id} hover={T.rowHover}>
            <CellLink
              href={`/factures/${f.id}`}
              label={f.numero}
              accent={themeFor(f.statut).accent}
              hoverText={T.linkHover}
            />
            <Cell>{f.clientNom}</Cell>
            <Cell className="text-neutral-500">{f.dateEmission}</Cell>
            <Cell className="font-medium tabular-nums text-neutral-900">
              {formatMontant(f.totalTTC)}
            </Cell>
            <Cell>
              <ProgressBar paye={f.montantPaye} total={f.totalTTC} statut={f.statut} />
            </Cell>
            <Cell
              className={`font-medium tabular-nums ${f.reste > 0 ? "text-neutral-900" : "text-emerald-600"}`}
            >
              {formatMontant(f.reste)}
            </Cell>
            <Cell>
              <StatutPill statut={f.statut} />
            </Cell>
            <ActionsCell actions={actionsFor(f)} label={`Actions pour ${f.numero}`} />
          </Row>
        ))}
      </TableSection>

      <CardSection empty={vide || undefined}>
        {visibles.map((f) => (
          <Card key={f.id} href={`/factures/${f.id}`} accent={themeFor(f.statut).accent}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{f.numero}</p>
                <p className="truncate text-sm text-neutral-600">{f.clientNom}</p>
              </div>
              <StatutPill statut={f.statut} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <CardField label="Total TTC" value={formatMontant(f.totalTTC)} />
              <CardField
                label="Reste"
                value={formatMontant(f.reste)}
                align="right"
                className={f.reste > 0 ? "text-neutral-900" : "text-emerald-600"}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <ProgressBar paye={f.montantPaye} total={f.totalTTC} statut={f.statut} />
              <span className="shrink-0 text-xs text-neutral-400">{f.dateEmission}</span>
            </div>
          </Card>
        ))}
      </CardSection>

      {visibles.length > 0 && (
        <ListFooter>
          {visibles.length} facture{visibles.length > 1 ? "s" : ""} affichee
          {visibles.length > 1 ? "s" : ""} - total{" "}
          <span className="font-medium text-neutral-700">
            <AnimatedNumber
              value={visibles.reduce((s, f) => s + f.totalTTC, 0)}
              format={(n) => formatMontant(n)}
              duration={0.6}
            />
          </span>
        </ListFooter>
      )}

      {dialogs}
    </div>
  );
}

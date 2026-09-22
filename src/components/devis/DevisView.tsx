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
      titre="Aucun devis pour le moment"
      message="Etablissez un premier devis : une fois accepte, il se convertit en facture."
      action={{ href: "/devis/new", label: "Nouveau devis" }}
      accent={T.emptyAccent}
      link={T.emptyLink}
      icon={<IconFileText className="h-7 w-7" />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Avant-vente"
        title="Devis"
        subtitle={
          stats.nbTotal === 0
            ? "Aucun devis pour le moment."
            : `${stats.nbTotal} devis - ${formatMontant(stats.montantEnAttente)} en attente de reponse.`
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
        action={{ href: "/devis/new", label: "Nouveau devis" }}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label="Montant total"
          value={stats.montantTotal}
          format={(n) => formatMontant(n)}
          hint="Tous devis confondus"
          accent="from-amber-500 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconFileText className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label="En attente"
          value={stats.montantEnAttente}
          format={(n) => formatMontant(n)}
          hint={
            stats.nbEnAttente > 0
              ? `${stats.nbEnAttente} devis sans reponse`
              : "Aucun devis en suspens"
          }
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconHourglass className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label="Acceptes"
          value={stats.montantGagne}
          format={(n) => formatMontant(n)}
          hint={
            stats.nbGagnes > 0 ? `${stats.nbGagnes} devis remporte${stats.nbGagnes > 1 ? "s" : ""}` : "Rien de signe"
          }
          accent="from-emerald-500 to-teal-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconCheckCircle className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label="Taux d'acceptation"
          value={stats.taux}
          format={(n) => `${Math.round(n)}%`}
          hint={
            stats.nbTranches > 0
              ? `Sur ${stats.nbTranches} devis tranche${stats.nbTranches > 1 ? "s" : ""}`
              : "Pas encore de verdict"
          }
          accent="from-violet-500 to-purple-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconPercent className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Rechercher un numero, un client..."
        focus={T.focus}
      >
        <FilterChip
          label="Tous"
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
        headers={["Numero", "Client", "Date", "Validite", "Total TTC", "Statut", ""]}
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
              {formatMontant(d.totalTTC)}
            </Cell>
            <Cell>
              <StatutPill statut={d.statut} />
            </Cell>
            <ActionsCell actions={actionsFor(d)} label={`Actions pour ${d.numero}`} />
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
              <CardField label="Total TTC" value={formatMontant(d.totalTTC)} />
              <CardField
                label="Validite"
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
          {visibles.length} devis affiche{visibles.length > 1 ? "s" : ""}
        </ListFooter>
      )}
    </div>
  );
}

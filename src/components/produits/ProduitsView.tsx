"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { formatMontant } from "@/lib/format";
import { gridVariants } from "@/components/ui/motion";
import { ENTITY } from "@/components/ui/entity-theme";
import { PageHero } from "@/components/ui/PageHero";
import { StatCard } from "@/components/ui/StatCard";
import { FilterBar, FilterChip } from "@/components/ui/Filters";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Card,
  CardField,
  CardSection,
  Cell,
  CellLink,
  ListFooter,
  Row,
  TableSection,
} from "@/components/ui/ListShell";
import { IconBox, IconChart, IconTag, IconWrench } from "@/components/ui/icons";

export type ProduitRow = {
  id: string;
  reference: string | null;
  designation: string;
  type: "PRODUIT" | "SERVICE";
  prixUnitaireHT: number;
  tauxTva: number;
};

const T = ENTITY.produits;
const TYPES = [
  { key: "PRODUIT", label: "Produits" },
  { key: "SERVICE", label: "Services" },
] as const;

export function ProduitsView({ produits }: { produits: ProduitRow[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);

  const stats = useMemo(() => {
    const services = produits.filter((p) => p.type === "SERVICE").length;
    const total = produits.length;
    const prixMoyen =
      total > 0 ? produits.reduce((s, p) => s + p.prixUnitaireHT, 0) / total : 0;
    return { total, services, produits: total - services, prixMoyen };
  }, [produits]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of produits) map[p.type] = (map[p.type] ?? 0) + 1;
    return map;
  }, [produits]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return produits.filter((p) => {
      if (type && p.type !== type) return false;
      if (!q) return true;
      return [p.designation, p.reference]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [produits, query, type]);

  const filtresActifs = Boolean(query.trim() || type);
  const reinitialiser = () => {
    setQuery("");
    setType(null);
  };

  const vide = visibles.length === 0 && (
    <EmptyState
      filtre={filtresActifs}
      onReset={reinitialiser}
      titre="Aucun produit pour le moment"
      message="Creez un produit ou un service : il sera proposé a la saisie de vos lignes de facture."
      action={{ href: "/produits/new", label: "Nouveau produit" }}
      accent={T.emptyAccent}
      link={T.emptyLink}
      icon={<IconBox className="h-7 w-7" />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Catalogue"
        title="Produits & Services"
        subtitle={
          stats.total === 0
            ? "Votre catalogue est encore vide."
            : `${stats.total} reference${stats.total > 1 ? "s" : ""} - prix moyen ${formatMontant(stats.prixMoyen)} HT.`
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
        action={{ href: "/produits/new", label: "Nouveau produit" }}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label="References"
          value={stats.total}
          format={(n) => String(Math.round(n))}
          hint="Catalogue actif"
          accent="from-teal-500 to-emerald-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconTag className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label="Produits"
          value={stats.produits}
          format={(n) => String(Math.round(n))}
          hint="Biens physiques"
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconBox className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label="Services"
          value={stats.services}
          format={(n) => String(Math.round(n))}
          hint="Prestations"
          accent="from-violet-500 to-purple-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconWrench className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label="Prix moyen HT"
          value={stats.prixMoyen}
          format={(n) => formatMontant(n)}
          hint="Toutes references"
          accent="from-amber-400 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconChart className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Rechercher une designation, une reference..."
        focus={T.focus}
      >
        <FilterChip
          label="Tous"
          count={produits.length}
          actif={type === null}
          onClick={() => setType(null)}
          classesActif="bg-neutral-900 text-white"
          classesInactif="text-neutral-600 hover:bg-neutral-100"
        />
        {TYPES.filter((t) => counts[t.key]).map((t) => (
          <FilterChip
            key={t.key}
            label={t.label}
            count={counts[t.key]}
            actif={type === t.key}
            onClick={() => setType(type === t.key ? null : t.key)}
            classesActif={T.chipActive}
            classesInactif={T.chipInactive}
          />
        ))}
      </FilterBar>

      <TableSection
        headers={["Reference", "Designation", "Type", "Prix HT", "TVA"]}
        empty={vide || undefined}
      >
        {visibles.map((p) => (
          <Row key={p.id} hover={T.rowHover}>
            <Cell className="font-mono text-xs text-neutral-500">{p.reference || "—"}</Cell>
            <CellLink
              href={`/produits/${p.id}`}
              label={p.designation}
              accent={T.accent}
              hoverText={T.linkHover}
            />
            <Cell>
              <TypePill type={p.type} />
            </Cell>
            <Cell className="font-medium tabular-nums text-neutral-900">
              {formatMontant(p.prixUnitaireHT)}
            </Cell>
            <Cell className="tabular-nums text-neutral-600">{p.tauxTva}%</Cell>
          </Row>
        ))}
      </TableSection>

      <CardSection empty={vide || undefined}>
        {visibles.map((p) => (
          <Card key={p.id} href={`/produits/${p.id}`} accent={T.accent}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{p.designation}</p>
                <p className="truncate font-mono text-xs text-neutral-500">
                  {p.reference || "Sans reference"}
                </p>
              </div>
              <TypePill type={p.type} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <CardField label="Prix HT" value={formatMontant(p.prixUnitaireHT)} />
              <CardField label="TVA" value={`${p.tauxTva}%`} align="right" />
            </div>
          </Card>
        ))}
      </CardSection>

      {visibles.length > 0 && (
        <ListFooter>
          {visibles.length} reference{visibles.length > 1 ? "s" : ""} affichee
          {visibles.length > 1 ? "s" : ""}
        </ListFooter>
      )}
    </div>
  );
}

function TypePill({ type }: { type: ProduitRow["type"] }) {
  const service = type === "SERVICE";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        service
          ? "bg-violet-50 text-violet-700 ring-violet-200"
          : "bg-sky-50 text-sky-700 ring-sky-200"
      }`}
    >
      {service ? <IconWrench className="h-3.5 w-3.5" /> : <IconBox className="h-3.5 w-3.5" />}
      {service ? "Service" : "Produit"}
    </span>
  );
}

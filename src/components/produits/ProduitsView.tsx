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
  ActionsCell,
  CardSection,
  Cell,
  CellLink,
  ListFooter,
  Row,
  TableSection,
} from "@/components/ui/ListShell";
import { IconBox, IconChart, IconTag, IconWrench } from "@/components/ui/icons";
import { useProduitRowActions } from "./useProduitRowActions";
import { useLocale } from "@/i18n/client";
import { tp } from "@/i18n/plural";

export type ProduitRow = {
  id: string;
  reference: string | null;
  designation: string;
  type: "PRODUIT" | "SERVICE";
  prixUnitaireHT: number;
  tauxTva: number;
  categorie: string | null;
  actif: boolean;
};

const T = ENTITY.produits;
const TYPES = [
  { key: "PRODUIT", labelKey: "views.products.statProducts" },
  { key: "SERVICE", labelKey: "views.products.statServices" },
] as const;

export function ProduitsView({
  produits,
  archives = [],
}: {
  /** Catalogue actif (statistiques et liste par defaut). */
  produits: ProduitRow[];
  /** References desactivees, consultables pour les reactiver. */
  archives?: ProduitRow[];
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [voirArchives, setVoirArchives] = useState(false);
  const liste = voirArchives ? archives : produits;
  const { actionsFor, dialogs } = useProduitRowActions();
  const { t, locale } = useLocale();
  const fmt = (n: number) => formatMontant(n, "TND", locale);

  const stats = useMemo(() => {
    const services = produits.filter((p) => p.type === "SERVICE").length;
    const total = produits.length;
    const prixMoyen =
      total > 0 ? produits.reduce((s, p) => s + p.prixUnitaireHT, 0) / total : 0;
    return { total, services, produits: total - services, prixMoyen };
  }, [produits]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of liste) map[p.type] = (map[p.type] ?? 0) + 1;
    return map;
  }, [liste]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liste.filter((p) => {
      if (type && p.type !== type) return false;
      if (!q) return true;
      return [p.designation, p.reference, p.categorie]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [liste, query, type]);

  const filtresActifs = Boolean(query.trim() || type);
  const reinitialiser = () => {
    setQuery("");
    setType(null);
  };

  const vide = visibles.length === 0 && (
    <EmptyState
      filtre={filtresActifs}
      onReset={reinitialiser}
      titre={t("views.products.emptyTitle")}
      message={t("views.products.emptyMessage")}
      action={{ href: "/produits/new", label: t("products.newProduct") }}
      accent={T.emptyAccent}
      link={T.emptyLink}
      icon={<IconBox className="h-7 w-7" />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={t("views.products.eyebrow")}
        title={t("products.title")}
        subtitle={
          stats.total === 0
            ? t("views.products.subtitleEmpty")
            : tp(t, "views.products.subtitle", stats.total, { amount: fmt(stats.prixMoyen) })
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
        action={{ href: "/produits/new", label: t("products.newProduct") }}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label={t("views.products.statReferences")}
          value={stats.total}
          format={(n) => String(Math.round(n))}
          hint={t("views.products.statReferencesHint")}
          accent="from-teal-500 to-emerald-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconTag className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label={t("views.products.statProducts")}
          value={stats.produits}
          format={(n) => String(Math.round(n))}
          hint={t("views.products.statProductsHint")}
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconBox className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label={t("views.products.statServices")}
          value={stats.services}
          format={(n) => String(Math.round(n))}
          hint={t("views.products.statServicesHint")}
          accent="from-violet-500 to-purple-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconWrench className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label={t("views.products.statAvgPrice")}
          value={stats.prixMoyen}
          format={(n) => fmt(n)}
          hint={t("views.products.statAvgPriceHint")}
          accent="from-amber-400 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconChart className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder={t("views.products.searchPlaceholder")}
        focus={T.focus}
      >
        <FilterChip
          label={t("views.common.all")}
          count={liste.length}
          actif={type === null}
          onClick={() => setType(null)}
          classesActif="bg-neutral-900 text-white"
          classesInactif="text-neutral-600 hover:bg-neutral-100"
        />
        {TYPES.filter((ty) => counts[ty.key]).map((ty) => (
          <FilterChip
            key={ty.key}
            label={t(ty.labelKey)}
            count={counts[ty.key]}
            actif={type === ty.key}
            onClick={() => setType(type === ty.key ? null : ty.key)}
            classesActif={T.chipActive}
            classesInactif={T.chipInactive}
          />
        ))}
        {archives.length > 0 && (
          <FilterChip
            label={t("views.products.deactivatedChip")}
            count={archives.length}
            actif={voirArchives}
            onClick={() => {
              setVoirArchives(!voirArchives);
              setType(null);
            }}
            classesActif="bg-neutral-700 text-white"
            classesInactif="text-neutral-500 hover:bg-neutral-100"
          />
        )}
      </FilterBar>

      <TableSection
        headers={[
          t("products.columnReference"),
          t("products.fieldDesignation"),
          t("products.columnType"),
          t("products.columnPriceHT"),
          t("documents.vat"),
          "",
        ]}
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
              {fmt(p.prixUnitaireHT)}
            </Cell>
            <Cell className="tabular-nums text-neutral-600">{p.tauxTva}%</Cell>
            <ActionsCell actions={actionsFor(p)} label={t("common.actionsFor", { name: p.designation })} />
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
                  {p.reference || t("views.products.noReference")}
                </p>
              </div>
              <TypePill type={p.type} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <CardField label={t("products.columnPriceHT")} value={fmt(p.prixUnitaireHT)} />
              <CardField label={t("documents.vat")} value={`${p.tauxTva}%`} align="right" />
            </div>
          </Card>
        ))}
      </CardSection>

      {visibles.length > 0 && (
        <ListFooter>
          {tp(t, "views.products.footer", visibles.length)}
        </ListFooter>
      )}

      {dialogs}
    </div>
  );
}

function TypePill({ type }: { type: ProduitRow["type"] }) {
  const { t } = useLocale();
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
      {service ? t("products.typeService") : t("products.typeProduct")}
    </span>
  );
}

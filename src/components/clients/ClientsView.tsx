"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
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
import { IconBuilding, IconUser, IconUsers, IconTag } from "@/components/ui/icons";
import { useLocale } from "@/i18n/client";
import { useClientRowActions } from "./useClientRowActions";

export type ClientRow = {
  id: string;
  nom: string;
  type: "ENTREPRISE" | "PARTICULIER";
  email: string | null;
  telephone: string | null;
  ville: string | null;
  actif: boolean;
};

const T = ENTITY.clients;
const TYPES = [
  { key: "ENTREPRISE", label: "Entreprises" },
  { key: "PARTICULIER", label: "Particuliers" },
] as const;

export function ClientsView({
  clients,
  archives = [],
}: {
  /** Clients actifs (statistiques et liste par defaut). */
  clients: ClientRow[];
  /** Clients archives, consultables pour les reactiver. */
  archives?: ClientRow[];
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [voirArchives, setVoirArchives] = useState(false);
  const liste = voirArchives ? archives : clients;
  const { actionsFor, dialogs } = useClientRowActions();

  const stats = useMemo(() => {
    const entreprises = clients.filter((c) => c.type === "ENTREPRISE").length;
    const villes = new Set(clients.map((c) => c.ville).filter(Boolean)).size;
    return {
      total: clients.length,
      entreprises,
      particuliers: clients.length - entreprises,
      villes,
    };
  }, [clients]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of liste) map[c.type] = (map[c.type] ?? 0) + 1;
    return map;
  }, [liste]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liste.filter((c) => {
      if (type && c.type !== type) return false;
      if (!q) return true;
      return [c.nom, c.email, c.ville, c.telephone]
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
      titre={t("clients.emptyTitle")}
      message={t("clients.emptyDescription")}
      action={{ href: "/clients/new", label: t("clients.newClient") }}
      accent={T.emptyAccent}
      link={T.emptyLink}
      icon={<IconUsers className="h-7 w-7" />}
    />
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Repertoire"
        title={t("clients.title")}
        subtitle={
          stats.total === 0
            ? "Aucun client enregistre pour le moment."
            : `${stats.total} client${stats.total > 1 ? "s" : ""} actif${stats.total > 1 ? "s" : ""}${stats.villes > 0 ? ` dans ${stats.villes} ville${stats.villes > 1 ? "s" : ""}` : ""}.`
        }
        accent={T.hero}
        glow={T.heroGlow}
        actionText={T.actionText}
        action={{ href: "/clients/new", label: t("clients.newClient") }}
      />

      <motion.section
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          index={0}
          label="Clients actifs"
          value={stats.total}
          format={(n) => String(Math.round(n))}
          hint="Fiches en cours"
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconUsers className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label="Entreprises"
          value={stats.entreprises}
          format={(n) => String(Math.round(n))}
          hint={
            stats.total > 0
              ? `${Math.round((stats.entreprises / stats.total) * 100)}% du repertoire`
              : "Aucune"
          }
          accent="from-indigo-500 to-violet-500"
          glow="hover:shadow-indigo-500/10"
          icon={<IconBuilding className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label="Particuliers"
          value={stats.particuliers}
          format={(n) => String(Math.round(n))}
          hint={
            stats.total > 0
              ? `${Math.round((stats.particuliers / stats.total) * 100)}% du repertoire`
              : "Aucun"
          }
          accent="from-teal-500 to-emerald-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconUser className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label="Villes couvertes"
          value={stats.villes}
          format={(n) => String(Math.round(n))}
          hint="Villes renseignees"
          accent="from-amber-400 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconTag className="h-5 w-5" />}
        />
      </motion.section>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder={t("clients.searchPlaceholder")}
        focus={T.focus}
      >
        <FilterChip
          label="Tous"
          count={liste.length}
          actif={type === null}
          onClick={() => setType(null)}
          classesActif="bg-neutral-900 text-white"
          classesInactif="text-neutral-600 hover:bg-neutral-100"
        />
        {TYPES.filter((ty) => counts[ty.key]).map((ty) => (
          <FilterChip
            key={ty.key}
            label={ty.key === "ENTREPRISE" ? t("clients.typeCompany") : t("clients.typeIndividual")}
            count={counts[ty.key]}
            actif={type === ty.key}
            onClick={() => setType(type === ty.key ? null : ty.key)}
            classesActif={T.chipActive}
            classesInactif={T.chipInactive}
          />
        ))}
        {archives.length > 0 && (
          <FilterChip
            label={t("common.archived")}
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
          t("clients.columnName"),
          t("clients.columnType"),
          t("clients.columnEmail"),
          t("clients.columnPhone"),
          t("clients.columnCity"),
          "",
        ]}
        empty={vide || undefined}
      >
        {visibles.map((c) => (
          <Row key={c.id} hover={T.rowHover}>
            <CellLink
              href={`/clients/${c.id}`}
              label={c.nom}
              accent={T.accent}
              hoverText={T.linkHover}
            />
            <Cell>
              <TypePill type={c.type} />
            </Cell>
            <Cell className="text-neutral-600">{c.email || "—"}</Cell>
            <Cell className="text-neutral-600">{c.telephone || "—"}</Cell>
            <Cell className="text-neutral-600">{c.ville || "—"}</Cell>
            <ActionsCell actions={actionsFor(c)} label={t("common.actionsFor", { name: c.nom })} />
          </Row>
        ))}
      </TableSection>

      <CardSection empty={vide || undefined}>
        {visibles.map((c) => (
          <Card key={c.id} href={`/clients/${c.id}`} accent={T.accent}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{c.nom}</p>
                <p className="truncate text-sm text-neutral-600">{c.email || "Sans email"}</p>
              </div>
              <TypePill type={c.type} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <CardField
                label="Telephone"
                value={c.telephone || "—"}
                className="text-sm text-neutral-700"
              />
              <CardField
                label="Ville"
                value={c.ville || "—"}
                align="right"
                className="text-sm text-neutral-700"
              />
            </div>
          </Card>
        ))}
      </CardSection>

      {visibles.length > 0 && (
        <ListFooter>
          {visibles.length} client{visibles.length > 1 ? "s" : ""} affiche
          {visibles.length > 1 ? "s" : ""}
        </ListFooter>
      )}

      {dialogs}
    </div>
  );
}

function TypePill({ type }: { type: ClientRow["type"] }) {
  const { t } = useLocale();
  const entreprise = type === "ENTREPRISE";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        entreprise
          ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
          : "bg-teal-50 text-teal-700 ring-teal-200"
      }`}
    >
      {entreprise ? <IconBuilding className="h-3.5 w-3.5" /> : <IconUser className="h-3.5 w-3.5" />}
      {entreprise ? t("clients.typeCompany") : t("clients.typeIndividual")}
    </span>
  );
}

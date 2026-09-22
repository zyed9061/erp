"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { formatMontant } from "@/lib/format";
import { EASE, gridVariants, listVariants, rowVariants } from "@/components/ui/motion";
import { ENTITY } from "@/components/ui/entity-theme";
import { themeFor } from "@/components/ui/statut";
import { PageHero } from "@/components/ui/PageHero";
import { StatCard } from "@/components/ui/StatCard";
import { StatutPill } from "@/components/ui/StatutPill";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import {
  IconAlert,
  IconArrowRight,
  IconCheckCircle,
  IconFileText,
  IconUsers,
  IconWallet,
} from "@/components/ui/icons";
import { RevenueChart, StatusDistributionChart } from "./DashboardCharts";

export type SuiviRow = {
  id: string;
  numero: string;
  clientNom: string;
  echeance: string | null;
  /** Jours restants avant echeance ; negatif = en retard ; null = sans echeance. */
  joursRestants: number | null;
  reste: number;
  statut: string;
};

export type DashboardData = {
  caDuMois: number;
  totalImpaye: number;
  devisEnAttente: number;
  clientsActifs: number;
  /** Les 5 plus urgentes ; `nbOuvertes` compte la totalite. */
  suivi: SuiviRow[];
  nbOuvertes: number;
  nbEnRetard: number;
  mois: string;
  /** Chiffre d'affaires TTC des 6 derniers mois (hors annulees). */
  revenueByMonth: { label: string; total: number }[];
  /** Nombre de factures par statut affiche (retard derive inclus). */
  statusCounts: { statut: string; label: string; count: number }[];
};

const RACCOURCIS = [
  { href: "/factures/new", label: "Nouvelle facture" },
  { href: "/devis/new", label: "Nouveau devis" },
  { href: "/clients/new", label: "Nouveau client" },
  { href: "/produits/new", label: "Ajouter un produit/service" },
];

const T = ENTITY.dashboard;

export function DashboardView({ data }: { data: DashboardData }) {
  const reste = data.nbOuvertes - data.suivi.length;
  // La vignette flotte en boucle : on la fige en mouvement reduit.
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Vue d'ensemble"
        title="Tableau de bord"
        subtitle={
          data.totalImpaye > 0
            ? `${formatMontant(data.totalImpaye)} restent a encaisser sur vos factures ouvertes.`
            : "Tout est encaisse : aucune facture en attente de paiement."
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
          label="CA du mois"
          value={data.caDuMois}
          format={(n) => formatMontant(n)}
          hint={data.mois}
          accent="from-violet-500 to-purple-500"
          glow="hover:shadow-violet-500/10"
          icon={<IconWallet className="h-5 w-5" />}
        />
        <StatCard
          index={1}
          label="Impayes en cours"
          value={data.totalImpaye}
          format={(n) => formatMontant(n)}
          hint={
            data.nbEnRetard > 0
              ? `dont ${data.nbEnRetard} en retard`
              : data.nbOuvertes > 0
                ? `${data.nbOuvertes} facture${data.nbOuvertes > 1 ? "s" : ""} a suivre`
                : "Rien a relancer"
          }
          accent="from-amber-400 to-orange-500"
          glow="hover:shadow-amber-500/10"
          icon={<IconAlert className="h-5 w-5" />}
        />
        <StatCard
          index={2}
          label="Devis en attente"
          value={data.devisEnAttente}
          format={(n) => String(Math.round(n))}
          hint="Brouillons et envoyes"
          accent="from-sky-500 to-blue-500"
          glow="hover:shadow-blue-500/10"
          icon={<IconFileText className="h-5 w-5" />}
        />
        <StatCard
          index={3}
          label="Clients actifs"
          value={data.clientsActifs}
          format={(n) => String(Math.round(n))}
          hint="Fiches en cours"
          accent="from-teal-500 to-emerald-500"
          glow="hover:shadow-emerald-500/10"
          icon={<IconUsers className="h-5 w-5" />}
        />
      </motion.section>

      {/* ---------- Factures a suivre ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
        className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200/70"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-neutral-100/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-neutral-900">
            Factures a suivre
            {data.nbOuvertes > 0 && (
              <span className="ml-2 font-normal text-neutral-500">
                {data.suivi.length} plus urgentes
              </span>
            )}
          </h2>
          {data.nbOuvertes > 0 && (
            <span className="text-xs text-neutral-500">
              <span className="font-medium text-neutral-700">
                <AnimatedNumber
                  value={data.totalImpaye}
                  format={(n) => formatMontant(n)}
                  duration={0.8}
                />
              </span>{" "}
              en attente
            </span>
          )}
        </div>

        {data.suivi.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <motion.span
              animate={reduceMotion ? { y: 0 } : { y: [0, -6, 0] }}
              transition={
                reduceMotion ? { duration: 0 } : { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
              }
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-500 ring-1 ring-emerald-200/60"
            >
              <IconCheckCircle className="h-7 w-7" />
            </motion.span>
            <p className="text-sm font-medium text-neutral-800">Tout est encaisse</p>
            <p className="max-w-xs text-sm text-neutral-500">
              Aucune facture en attente de paiement.
            </p>
          </div>
        ) : (
          <motion.ul variants={listVariants} initial="hidden" animate="show">
            {data.suivi.map((f) => (
              <motion.li
                key={f.id}
                variants={rowVariants}
                className="group border-t border-neutral-100 first:border-t-0"
              >
                <Link
                  href={`/factures/${f.id}`}
                  className="relative flex items-center gap-4 px-5 py-3.5 transition-colors duration-200 hover:bg-violet-50/40"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-gradient-to-b ${themeFor(f.statut).accent} transition-transform duration-300 group-hover:scale-y-100`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium text-neutral-900 transition-colors group-hover:text-violet-700">
                      {f.numero}
                      <IconArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </p>
                    <p className="truncate text-sm text-neutral-600">{f.clientNom}</p>
                  </div>

                  <div className="hidden sm:block">
                    <StatutPill statut={f.statut} />
                  </div>

                  <div className="w-28 shrink-0 text-right">
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400">
                      Echeance
                    </p>
                    <EcheanceLabel echeance={f.echeance} jours={f.joursRestants} />
                  </div>

                  <div className="w-32 shrink-0 text-right">
                    <p className="text-[11px] uppercase tracking-wider text-neutral-400">Reste</p>
                    <p className="font-semibold tabular-nums text-neutral-900">
                      {formatMontant(f.reste)}
                    </p>
                  </div>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}

        {reste > 0 && (
          <Link
            href="/factures"
            className="group flex items-center justify-center gap-1.5 border-t border-neutral-100 px-5 py-3 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50/50"
          >
            Voir les {reste} autre{reste > 1 ? "s" : ""} facture{reste > 1 ? "s" : ""} ouverte
            {reste > 1 ? "s" : ""}
            <IconArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35, ease: EASE }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200/70 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">
            Chiffre d&apos;affaires (6 derniers mois)
          </h2>
          <RevenueChart data={data.revenueByMonth} />
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200/70">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">Repartition des factures</h2>
          <StatusDistributionChart data={data.statusCounts} />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200/70"
      >
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Actions rapides</h2>
        <div className="flex flex-wrap gap-2">
          {RACCOURCIS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200"
            >
              + {r.label}
            </Link>
          ))}
        </div>
      </motion.section>
    </div>
  );
}

/** Echeance coloree selon l'urgence : depassee, proche, ou confortable. */
function EcheanceLabel({ echeance, jours }: { echeance: string | null; jours: number | null }) {
  if (!echeance || jours === null) {
    return <p className="text-sm text-neutral-400">—</p>;
  }

  const ton =
    jours < 0 ? "text-rose-600" : jours <= 7 ? "text-amber-600" : "text-neutral-700";
  const suffixe =
    jours < 0
      ? `${Math.abs(jours)} j de retard`
      : jours === 0
        ? "aujourd'hui"
        : `dans ${jours} j`;

  return (
    <p className={`text-sm font-medium ${ton}`}>
      <span className="block tabular-nums">{echeance}</span>
      <span className="text-[11px] font-normal opacity-80">{suffixe}</span>
    </p>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
  Plus,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { CountUp, Stagger, StaggerItem } from "@/components/motion/Motion";

const ICONS = {
  revenue: TrendingUp,
  wallet: Wallet,
  alert: AlertTriangle,
  check: CheckCircle2,
  quote: FileText,
  users: Users,
} satisfies Record<string, LucideIcon>;

const ACCENTS = {
  indigo: { chip: "from-brand-500 to-violet-500 shadow-brand-500/30", glow: "bg-brand-500/10" },
  amber: { chip: "from-amber-400 to-orange-500 shadow-amber-500/30", glow: "bg-amber-500/10" },
  rose: { chip: "from-rose-500 to-red-500 shadow-rose-500/30", glow: "bg-rose-500/10" },
  emerald: { chip: "from-emerald-400 to-teal-500 shadow-emerald-500/30", glow: "bg-emerald-500/10" },
  sky: { chip: "from-sky-400 to-blue-500 shadow-sky-500/30", glow: "bg-sky-500/10" },
  violet: { chip: "from-violet-500 to-fuchsia-500 shadow-violet-500/30", glow: "bg-violet-500/10" },
};

export interface StatCardData {
  icon: keyof typeof ICONS;
  label: string;
  value: number;
  format: "number" | "currency";
  accent: keyof typeof ACCENTS;
  href?: string;
}

export function StatCards({ stats }: { stats: StatCardData[] }) {
  return (
    <Stagger className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {stats.map((stat) => (
        <StaggerItem key={stat.label}>
          <StatCard {...stat} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function StatCard({ icon, label, value, format, accent, href }: StatCardData) {
  const Icon = ICONS[icon];
  const styles = ACCENTS[accent];
  const body = (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className="card card-hover group relative h-full overflow-hidden p-5"
    >
      <div
        aria-hidden="true"
        className={`absolute -end-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150 ${styles.glow}`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-lg ${styles.chip}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {href && (
          <ArrowUpRight
            className="h-4 w-4 text-slate-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500 rtl:-scale-x-100"
            aria-hidden="true"
          />
        )}
      </div>
      <p className="relative mt-4 text-[13px] font-medium text-slate-500">{label}</p>
      <p className="relative mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">
        <CountUp value={value} format={format} />
      </p>
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25">
      {body}
    </Link>
  ) : (
    body
  );
}

export function QuickActions({ actions }: { actions: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, i) => (
        <motion.div
          key={action.href}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 + i * 0.06, duration: 0.4 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <Link
            href={action.href}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition ${
              i === 0
                ? "bg-white text-brand-700 shadow-lg shadow-brand-950/20 hover:bg-brand-50"
                : "bg-white/10 text-white ring-1 ring-white/25 backdrop-blur-md hover:bg-white/20"
            }`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {action.label}
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

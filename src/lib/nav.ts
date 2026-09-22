import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Receipt,
  Undo2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/clients", labelKey: "nav.clients", icon: Users },
  { href: "/produits", labelKey: "nav.products", icon: Package },
  { href: "/devis", labelKey: "nav.quotes", icon: FileText },
  { href: "/factures", labelKey: "nav.invoices", icon: Receipt },
  { href: "/avoirs", labelKey: "nav.creditNotes", icon: Undo2 },
  { href: "/parametres", labelKey: "nav.settings", icon: Settings },
];

export const ROUTE_LABEL_KEYS: Record<string, string> = {
  "": "nav.dashboard",
  clients: "nav.clients",
  produits: "nav.products",
  devis: "nav.quotes",
  factures: "nav.invoices",
  avoirs: "nav.creditNotes",
  parametres: "nav.settings",
  new: "breadcrumb.new",
  login: "breadcrumb.login",
};

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

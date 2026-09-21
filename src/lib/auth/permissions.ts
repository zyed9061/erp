import type { Role } from "@/db/schema";

/**
 * Permissions par ressource et action. Les phases suivantes ajoutent leurs
 * ressources ici (clients, factures, paiements...).
 */
export const PERMISSIONS = {
  "users:manage": ["admin"],
  "audit:read": ["admin", "comptable"],
  "products:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "products:write": ["admin", "comptable"],
  "settings:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "customers:read":["admin", "comptable", "commercial", "lecture_seule"],
  "customers:write": ["admin", "comptable", "commercial"],
  "invoices:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "invoices:write": ["admin", "comptable"],
  "invoices:validate": ["admin", "comptable"],
  "payments:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "payments:write": ["admin", "comptable"],
  "quotes:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "quotes:write": ["admin", "comptable", "commercial"],
  "stock:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "stock:write": ["admin", "comptable"],
  "delivery:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "delivery:write": ["admin", "comptable", "commercial"],
  "delivery:validate": ["admin", "comptable"],
  "projects:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "projects:write": ["admin", "comptable"],
  "reports:read": ["admin", "comptable"],
  "recurring:read": ["admin", "comptable", "commercial", "lecture_seule"],
  "recurring:write": ["admin", "comptable"],
  "settings:manage": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  comptable: "Comptable",
  commercial: "Commercial",
  lecture_seule: "Lecture seule",
};

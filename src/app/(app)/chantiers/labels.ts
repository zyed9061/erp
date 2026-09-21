import type { ProjectStatus } from "@/db/schema";

export const PROJECT_LABELS: Record<ProjectStatus, string> = {
  active: "En cours", completed: "Terminé", cancelled: "Annulé",
};

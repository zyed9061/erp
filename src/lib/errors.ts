/** Erreur métier affichable telle quelle à l'utilisateur (par opposition à un bug). */
export class ServiceError extends Error {}

export type Actor = { id: string; email: string; ip?: string | null };

/**
 * Limite le nombre d'ÉCHECS de connexion par adresse IP (en plus du verrouillage par compte).
 * Fenêtre glissante en mémoire : réinitialisée au redémarrage et propre à chaque instance du serveur. Suffisant contre les
 * essais en rafale ; un déploiement à plusieurs instances devra la déplacer en base ou dans le reverse proxy.
 * NB : l'adresse vient de X-Forwarded-For : elle n'est fiable que derrière un reverse proxy qui la réécrit.
 */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max = 20,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length > 0) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Vrai si cette adresse a épuisé ses tentatives. */
  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  /** Enregistre une tentative ÉCHOUÉE. */
  record(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
    // Évite qu'une attaque depuis des milliers d'adresses fasse grossir la mémoire sans limite.
    if (this.hits.size > 10_000) this.hits.delete(this.hits.keys().next().value as string);
  }
}

export const loginLimiter = new AttemptLimiter();

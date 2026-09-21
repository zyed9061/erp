import type { MailMessage, MailResult, MailTransport } from "./transport";

/** Transport en mémoire pour les tests : conserve les messages, peut simuler une panne. */
export class MemoryTransport implements MailTransport {
  readonly sent: MailMessage[] = [];
  /** Erreur à lever à l'envoi suivant (une seule fois), ou en permanence avec `failAlways`. */
  failNext: string | null = null;
  failAlways: string | null = null;

  async send(message: MailMessage): Promise<MailResult> {
    const failure = this.failNext ?? this.failAlways;
    this.failNext = null;
    if (failure) throw new Error(failure);
    this.sent.push(message);
    return { messageId: `mem-${this.sent.length}` };
  }
}

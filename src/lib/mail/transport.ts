import nodemailer from "nodemailer";

export type MailAttachment = { filename: string; content: Uint8Array; contentType: string };

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

export type MailResult = { messageId: string | null };

export interface MailTransport {
  send(message: MailMessage): Promise<MailResult>;
}

/** Aucun envoi réel : écrit un résumé dans la console (développement, ou SMTP non configuré). */
export class LogTransport implements MailTransport {
  async send(message: MailMessage): Promise<MailResult> {
    const files = (message.attachments ?? []).map((a) => `${a.filename} (${a.content.byteLength} o)`).join(", ");
    console.log(`[mail:log] à ${message.to} · « ${message.subject} »${files ? ` · pièces jointes : ${files}` : ""}`);
    return { messageId: `log-${Date.now().toString(36)}` };
  }
}

type SmtpOptions = NonNullable<Parameters<typeof nodemailer.createTransport>[0]>;

class SmtpTransport implements MailTransport {
  private readonly inner: ReturnType<typeof nodemailer.createTransport>;
  constructor(private readonly from: string, options: SmtpOptions) {
    this.inner = nodemailer.createTransport(options);
  }
  async send(message: MailMessage): Promise<MailResult> {
    const info = await this.inner.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType,
      })),
    });
    return { messageId: typeof info.messageId === "string" ? info.messageId : null };
  }
}

/**
 * SMTP si SMTP_HOST est défini (SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM), sinon transport « journal ».
 * En production, définir SMTP_HOST : sans lui, aucun e-mail ne part réellement.
 */
export function createTransportFromEnv(env: NodeJS.ProcessEnv = process.env): MailTransport {
  const host = env.SMTP_HOST;
  if (!host) return new LogTransport();
  const from = env.MAIL_FROM || env.SMTP_USER;
  if (!from) throw new Error("MAIL_FROM (ou SMTP_USER) est requis quand SMTP_HOST est défini");
  const port = Number(env.SMTP_PORT) || 587;
  return new SmtpTransport(from, {
    host,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

let cached: MailTransport | undefined;
/** Transport partagé par l'application. */
export function getMailTransport(): MailTransport {
  return (cached ??= createTransportFromEnv());
}

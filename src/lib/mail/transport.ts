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
 * Configuration SMTP lue dans l'environnement, ou null si SMTP_HOST est absent (mode « journal », aucun envoi réel).
 * Sécurité par défaut : la connexion doit être chiffrée (TLS direct, ou STARTTLS obligatoire) et au moins en TLS 1.2 ;
 * `SMTP_ALLOW_INSECURE=true` autorise le clair, réservé à un serveur de test local.
 */
export type SmtpSettings = {
  host: string; port: number; secure: boolean; requireTLS: boolean; tls: { minVersion: "TLSv1.2" };
  auth?: { user: string; pass: string }; connectionTimeout: number; socketTimeout: number;
};

export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { from: string; options: SmtpSettings } | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const from = (env.MAIL_FROM || env.SMTP_USER || "").trim();
  if (!from) throw new Error("MAIL_FROM (ou SMTP_USER) est requis quand SMTP_HOST est défini");
  if (!from.includes("@")) throw new Error("MAIL_FROM doit contenir une adresse e-mail (ex. Facturation <facturation@societe.tn>)");
  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`SMTP_PORT invalide : « ${env.SMTP_PORT} »`);
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  const allowInsecure = env.SMTP_ALLOW_INSECURE === "true";
  return {
    from,
    options: {
      host,
      port,
      secure,
      requireTLS: !secure && !allowInsecure,
      tls: { minVersion: "TLSv1.2" },
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 10_000,
      socketTimeout: 30_000,
    },
  };
}

/** SMTP si SMTP_HOST est défini, sinon transport « journal ». En production, définir SMTP_HOST : sans lui, aucun e-mail ne part. */
export function createTransportFromEnv(env: NodeJS.ProcessEnv = process.env): MailTransport {
  const config = smtpConfigFromEnv(env);
  return config ? new SmtpTransport(config.from, config.options) : new LogTransport();
}

let cached: MailTransport | undefined;
/** Transport partagé par l'application. */
export function getMailTransport(): MailTransport {
  return (cached ??= createTransportFromEnv());
}

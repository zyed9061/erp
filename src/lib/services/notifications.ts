/**
 * Mock notification service.
 *
 * No email provider is wired up yet (nodemailer is installed but not
 * configured with SMTP credentials/templates). These functions simulate the
 * network round-trip so the UI can be built end-to-end now; swap the body of
 * each function for a real call (e.g. nodemailer transport, Resend, SendGrid)
 * once credentials are available, keeping the same signatures.
 *
 * Results carry a translation key (under `notifications.*`) plus its variables rather than a
 * ready-made sentence, so the calling UI renders the message in the user's language.
 */

export interface NotificationResult {
  success: boolean;
  messageKey: "noClientEmail" | "documentSent" | "reminderSent";
  vars?: Record<string, string>;
}

export interface SendDocumentEmailInput {
  type: "devis" | "facture";
  id: string;
  numero: string;
  clientEmail?: string | null;
}

export async function sendDocumentByEmail(input: SendDocumentEmailInput): Promise<NotificationResult> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!input.clientEmail) {
    return { success: false, messageKey: "noClientEmail" };
  }
  return {
    success: true,
    messageKey: "documentSent",
    vars: { number: input.numero, email: input.clientEmail },
  };
}

export interface SendPaymentReminderInput {
  factureId: string;
  numero: string;
  clientEmail?: string | null;
}

export async function sendPaymentReminder(input: SendPaymentReminderInput): Promise<NotificationResult> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!input.clientEmail) {
    return { success: false, messageKey: "noClientEmail" };
  }
  return { success: true, messageKey: "reminderSent", vars: { number: input.numero } };
}

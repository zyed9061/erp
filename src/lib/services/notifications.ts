/**
 * Mock notification service.
 *
 * No email provider is wired up yet (nodemailer is installed but not
 * configured with SMTP credentials/templates). These functions simulate the
 * network round-trip so the UI can be built end-to-end now; swap the body of
 * each function for a real call (e.g. nodemailer transport, Resend, SendGrid)
 * once credentials are available, keeping the same signatures.
 */

export interface SendDocumentEmailInput {
  type: "devis" | "facture";
  id: string;
  numero: string;
  clientEmail?: string | null;
}

export async function sendDocumentByEmail(input: SendDocumentEmailInput) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!input.clientEmail) {
    return { success: false, message: "Ce client n'a pas d'adresse email renseignee." };
  }
  return { success: true, message: `Document ${input.numero} envoye a ${input.clientEmail}.` };
}

export interface SendPaymentReminderInput {
  factureId: string;
  numero: string;
  clientEmail?: string | null;
}

export async function sendPaymentReminder(input: SendPaymentReminderInput) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!input.clientEmail) {
    return { success: false, message: "Ce client n'a pas d'adresse email renseignee." };
  }
  return { success: true, message: `Rappel envoye pour la facture ${input.numero}.` };
}

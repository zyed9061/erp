import { createHash } from "node:crypto";
import { ServiceError } from "../errors";
import { isDemoMode } from "../demo/mode";
import { verifyDemoSignature } from "./signature";

/**
 * Client TTN (El Fatoora).
 *
 * DÉMONSTRATION UNIQUEMENT : `MockTtnClient` n'appelle aucun serveur. Il simule une réponse déterministe :
 *  - fichier sans signature de démonstration valide -> rejeté ;
 *  - client dont le nom contient « REJET-DEMO » -> rejeté (pour montrer un refus) ;
 *  - sinon -> accepté, avec une référence « MOCK-TTN-… » qui n'a aucun lien avec un vrai identifiant TTN.
 * Le vrai client (API, authentification, environnement de test) est À FOURNIR PAR TTN.
 */
export type TtnRequest = { signedXml: string; invoiceNumber: string; customerName: string };
export type TtnResponse = { status: "accepted"; reference: string; message: string } | { status: "rejected"; reference: null; message: string };

export interface TtnClient {
  readonly mode: "mock";
  submit(request: TtnRequest): Promise<TtnResponse>;
}

export const REJECT_MARKER = "REJET-DEMO";

export class MockTtnClient implements TtnClient {
  readonly mode = "mock" as const;
  async submit(req: TtnRequest): Promise<TtnResponse> {
    if (!verifyDemoSignature(req.signedXml)) {
      return { status: "rejected", reference: null, message: "[SIMULATION] Rejeté : signature absente ou invalide." };
    }
    if (req.customerName.toUpperCase().includes(REJECT_MARKER)) {
      return { status: "rejected", reference: null, message: `[SIMULATION] Rejeté : rejet de démonstration (le nom du client contient « ${REJECT_MARKER} »).` };
    }
    const reference = `MOCK-TTN-${createHash("sha256").update(req.signedXml).digest("hex").slice(0, 10).toUpperCase()}`;
    return { status: "accepted", reference, message: "[SIMULATION] Accepté : aucune transmission réelle n'a eu lieu." };
  }
}

export function getTtnClient(env: NodeJS.ProcessEnv = process.env): TtnClient {
  if (isDemoMode(env)) return new MockTtnClient();
  throw new ServiceError("Transmission à TTN indisponible : accès et documentation À FOURNIR PAR TTN (voir docs/a-fournir.md).");
}

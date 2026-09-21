import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ServiceError } from "../errors";
import { isDemoMode } from "../demo/mode";

/**
 * Signature électronique d'un fichier TEIF.
 *
 * DÉMONSTRATION UNIQUEMENT : `MockSigner` ne produit PAS une signature XAdES et n'utilise AUCUN certificat. Il ajoute un
 * élément `<DemoSignature>` (empreinte SHA-256 du fichier + HMAC avec une clé de démonstration publique) qui permet seulement
 * de simuler le circuit « signer puis envoyer » et de détecter une modification du fichier. La vraie signature (XAdES, certificat
 * qualifié) est À FOURNIR PAR TTN / le prestataire de certification.
 */
export interface Signer {
  readonly algorithm: string;
  sign(xml: string): string;
}

/** Clé publique de démonstration : ne protège rien, elle sert seulement à détecter une altération dans la simulation. */
export const DEMO_SIGNING_KEY = "DEMO-KEY-PUBLIQUE-SANS-VALEUR";
export const MOCK_ALGORITHM = "DEMO-HMAC-SHA256";

const SIGNATURE_RE = /\n?\s*<DemoSignature [^>]*>[^<]*<\/DemoSignature>/;

export const stripDemoSignature = (xml: string) => xml.replace(SIGNATURE_RE, "");
const digestOf = (xml: string) => createHash("sha256").update(xml).digest("hex");
const macOf = (digest: string) => createHmac("sha256", DEMO_SIGNING_KEY).update(digest).digest("base64");

export class MockSigner implements Signer {
  readonly algorithm = MOCK_ALGORITHM;
  sign(xml: string): string {
    const base = stripDemoSignature(xml);
    const digest = digestOf(base);
    const element = `  <DemoSignature mode="SIMULATION" official="false" algorithm="${MOCK_ALGORITHM}" digest="${digest}">${macOf(digest)}</DemoSignature>`;
    return base.replace(/<\/TEIF>\s*$/, `${element}\n</TEIF>\n`);
  }
}

/** Vérifie la signature de démonstration : faux si absente, ou si le fichier a été modifié après la signature. */
export function verifyDemoSignature(signedXml: string): boolean {
  const m = /<DemoSignature [^>]*digest="([0-9a-f]{64})"[^>]*>([^<]*)<\/DemoSignature>/.exec(signedXml);
  if (!m) return false;
  const digest = digestOf(stripDemoSignature(signedXml));
  if (digest !== m[1]) return false;
  const expected = Buffer.from(macOf(digest));
  const actual = Buffer.from(m[2]!);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Signataire disponible : simulé en démonstration, sinon indisponible (certificat À FOURNIR). */
export function getSigner(env: NodeJS.ProcessEnv = process.env): Signer {
  if (isDemoMode(env)) return new MockSigner();
  throw new ServiceError("Signature indisponible : certificat de signature et spécification À FOURNIR PAR TTN (voir docs/a-fournir.md).");
}

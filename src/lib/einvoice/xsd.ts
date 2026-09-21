import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Validation du XML contre le XSD officiel de TTN.
 *
 * ÉTAT : XSD « À FOURNIR PAR TTN ». Déposer le fichier dans `src/lib/einvoice/official/teif.xsd` ; tant qu'il est absent, la
 * validation renvoie `unavailable` (jamais « valide »). Le moteur de validation XSD (bibliothèque) sera choisi et branché à
 * ce moment-là, derrière l'interface `XsdValidator`.
 */
export type XsdResult =
  | { status: "unavailable"; reason: string }
  | { status: "valid" }
  | { status: "invalid"; errors: string[] };

export interface XsdValidator {
  validate(xml: string): Promise<XsdResult>;
}

export const OFFICIAL_XSD_PATH = join(process.cwd(), "src", "lib", "einvoice", "official", "teif.xsd");

export class UnavailableXsdValidator implements XsdValidator {
  constructor(private readonly xsdPath: string = OFFICIAL_XSD_PATH) {}
  async validate(): Promise<XsdResult> {
    return existsSync(this.xsdPath)
      ? { status: "unavailable", reason: "XSD présent mais aucun moteur de validation XSD n'est encore branché." }
      : { status: "unavailable", reason: "XSD officiel À FOURNIR PAR TTN (src/lib/einvoice/official/teif.xsd)." };
  }
}

export const xsdValidator: XsdValidator = new UnavailableXsdValidator();

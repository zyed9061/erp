import QRCode from "qrcode";

/**
 * QR code de DÉMONSTRATION : son contenu commence par « DEMO-NON-OFFICIEL » et ne suit pas le format du cachet visible de TTN
 * (À FOURNIR PAR TTN). Il ne sert qu'à montrer où un QR code serait imprimé sur la facture.
 */
export const DEMO_QR_CAPTION = "QR code de DÉMONSTRATION : sans valeur officielle";

export const demoQrPayload = (p: { number: string; xmlSha256: string; reference: string }) =>
  `DEMO-NON-OFFICIEL|${p.number}|${p.xmlSha256.slice(0, 16)}|${p.reference}`;

/** Matrice booléenne du QR code (true = module noir). */
export function qrMatrix(payload: string): boolean[][] {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data as ArrayLike<number>;
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => data[r * size + c] === 1));
}

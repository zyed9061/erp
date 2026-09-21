/** Mini-générateur XML : échappement strict, pas de dépendance. */

// Caractères interdits en XML 1.0 (contrôles hors tab/LF/CR, substituts isolés, U+FFFE/U+FFFF).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/g;

export const escapeXml = (value: string) =>
  value.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export type XmlNode = { name: string; attrs: [string, string][]; children: (XmlNode | string)[] };

/** `el("A", { x: "1" }, child, "texte")` ; les attributs `undefined` sont omis. */
export function el(name: string, attrs: Record<string, string | undefined> = {}, ...children: (XmlNode | string | null | undefined | false)[]): XmlNode {
  return {
    name,
    attrs: Object.entries(attrs).filter((e): e is [string, string] => e[1] !== undefined),
    children: children.filter((c): c is XmlNode | string => c !== null && c !== undefined && c !== false),
  };
}

export function render(node: XmlNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const attrs = node.attrs.map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join("");
  if (node.children.length === 0) return `${pad}<${node.name}${attrs}/>`;
  if (node.children.every((c) => typeof c === "string")) {
    return `${pad}<${node.name}${attrs}>${escapeXml((node.children as string[]).join(""))}</${node.name}>`;
  }
  const inner = node.children.map((c) => (typeof c === "string" ? `${pad}  ${escapeXml(c)}` : render(c, depth + 1))).join("\n");
  return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
}

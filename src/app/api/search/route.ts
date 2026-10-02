import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PER_GROUP = 5;

export interface SearchResult {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  amount: number | null;
}

export interface SearchResponse {
  clients: SearchResult[];
  products: SearchResult[];
  quotes: SearchResult[];
  invoices: SearchResult[];
  creditNotes: SearchResult[];
}

/** Global search behind the header search box: a few matches per record type. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) {
    const empty: SearchResponse = { clients: [], products: [], quotes: [], invoices: [], creditNotes: [] };
    return NextResponse.json(empty);
  }

  const contains = { contains: q, mode: "insensitive" as const };
  const documentWhere = { OR: [{ numero: contains }, { client: { nom: contains } }] };
  const documentSelect = { id: true, numero: true, totalTTC: true, client: { select: { nom: true } } };
  const recentFirst = { createdAt: "desc" as const };

  const [clients, products, quotes, invoices, creditNotes] = await Promise.all([
    prisma.client.findMany({
      where: { OR: [{ nom: contains }, { email: contains }, { telephone: contains }] },
      select: { id: true, nom: true, email: true },
      orderBy: { nom: "asc" },
      take: PER_GROUP,
    }),
    prisma.produit.findMany({
      where: { OR: [{ designation: contains }, { reference: contains }] },
      select: { id: true, designation: true, reference: true },
      orderBy: { designation: "asc" },
      take: PER_GROUP,
    }),
    prisma.devis.findMany({ where: documentWhere, select: documentSelect, orderBy: recentFirst, take: PER_GROUP }),
    prisma.facture.findMany({ where: documentWhere, select: documentSelect, orderBy: recentFirst, take: PER_GROUP }),
    prisma.avoir.findMany({ where: documentWhere, select: documentSelect, orderBy: recentFirst, take: PER_GROUP }),
  ]);

  const toDocument = (base: string) => (d: (typeof quotes)[number]): SearchResult => ({
    id: d.id,
    href: `${base}/${d.id}`,
    title: d.numero,
    subtitle: d.client.nom,
    amount: Number(d.totalTTC),
  });

  const response: SearchResponse = {
    clients: clients.map((c) => ({ id: c.id, href: `/clients/${c.id}`, title: c.nom, subtitle: c.email, amount: null })),
    products: products.map((p) => ({
      id: p.id,
      href: `/produits/${p.id}`,
      title: p.designation,
      subtitle: p.reference,
      amount: null,
    })),
    quotes: quotes.map(toDocument("/devis")),
    invoices: invoices.map(toDocument("/factures")),
    creditNotes: creditNotes.map(toDocument("/avoirs")),
  };
  return NextResponse.json(response);
}

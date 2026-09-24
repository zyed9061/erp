"use client";

import { useState } from "react";
import { calculerLigne, calculerTotaux } from "@/lib/calculs";
import { formatMontant } from "@/lib/format";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { TotalsCard } from "@/components/ui/TotalsCard";

export type ProduitOption = {
  id: string;
  designation: string;
  prixUnitaireHT: number;
  tauxTva: number;
};

export type LigneState = {
  produitId: string | null;
  designation: string;
  description: string;
  quantite: number;
  prixUnitaireHT: number;
  remisePct: number;
  tauxTva: number;
};

const ligneVide: LigneState = {
  produitId: null,
  designation: "",
  description: "",
  quantite: 1,
  prixUnitaireHT: 0,
  remisePct: 0,
  tauxTva: 19,
};

export function LigneEditor({
  produits,
  timbreFiscal = 0,
}: {
  produits: ProduitOption[];
  timbreFiscal?: number;
}) {
  const { t, locale } = useLocale();
  const [lignes, setLignes] = useState<LigneState[]>([{ ...ligneVide }]);

  function mettreAJourLigne(index: number, patch: Partial<LigneState>) {
    setLignes((prev) => prev.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));
  }

  function selectionnerProduit(index: number, produitId: string) {
    const produit = produits.find((p) => p.id === produitId);
    if (!produit) {
      mettreAJourLigne(index, { produitId: null });
      return;
    }
    mettreAJourLigne(index, {
      produitId: produit.id,
      designation: produit.designation,
      prixUnitaireHT: produit.prixUnitaireHT,
      tauxTva: produit.tauxTva,
    });
  }

  function ajouterLigne() {
    setLignes((prev) => [...prev, { ...ligneVide }]);
  }

  function supprimerLigne(index: number) {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  }

  const totaux = calculerTotaux(lignes, timbreFiscal);

  return (
    <div className="space-y-4">
      <input type="hidden" name="lignes" value={JSON.stringify(lignes)} />

      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-start text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2 font-semibold">{t("documents.product")}</th>
              <th className="px-3 py-2 font-semibold">{t("documents.designation")}</th>
              <th className="px-3 py-2 font-semibold">{t("documents.quantity")}</th>
              <th className="px-3 py-2 font-semibold">{t("documents.priceHT")}</th>
              <th className="px-3 py-2 font-semibold">{t("documents.discountPct")}</th>
              <th className="px-3 py-2 font-semibold">{t("documents.vatPct")}</th>
              <th className="px-3 py-2 font-semibold">{t("documents.totalHT")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const calculee = calculerLigne(ligne);
              return (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-t border-slate-100 bg-white"
                >
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      value={ligne.produitId ?? ""}
                      onChange={(e) => selectionnerProduit(index, e.target.value)}
                    >
                      <option value="">—</option>
                      {produits.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.designation}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      value={ligne.designation}
                      onChange={(e) => mettreAJourLigne(index, { designation: e.target.value })}
                      required
                    />
                  </td>
                  <td className="px-3 py-2 w-20">
                    <input
                      type="number"
                      step="0.001"
                      className="input"
                      value={ligne.quantite}
                      onChange={(e) =>
                        mettreAJourLigne(index, { quantite: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <input
                      type="number"
                      step="0.001"
                      className="input"
                      value={ligne.prixUnitaireHT}
                      onChange={(e) =>
                        mettreAJourLigne(index, { prixUnitaireHT: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 w-24">
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={ligne.remisePct}
                      onChange={(e) =>
                        mettreAJourLigne(index, { remisePct: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 w-20">
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={ligne.tauxTva}
                      onChange={(e) =>
                        mettreAJourLigne(index, { tauxTva: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {formatMontant(calculee.totalHT, "TND", locale)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => supprimerLigne(index)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                      disabled={lignes.length === 1}
                      aria-label={t("common.removeLine")}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={ajouterLigne}
        className="btn-secondary"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t("documents.addLine")}
      </button>

      <TotalsCard
        rows={[
          { label: t("documents.subtotalHT"), value: formatMontant(totaux.sousTotalHT, "TND", locale) },
          { label: t("documents.vat"), value: formatMontant(totaux.totalTva, "TND", locale) },
          ...(timbreFiscal > 0
            ? [{ label: t("documents.stampDuty"), value: formatMontant(timbreFiscal, "TND", locale) }]
            : []),
          { label: t("documents.totalTTC"), value: formatMontant(totaux.totalTTC, "TND", locale), variant: "total" as const },
        ]}
      />
    </div>
  );
}

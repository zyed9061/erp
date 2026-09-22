"use client";

import { useState } from "react";
import { calculerLigne, calculerTotaux } from "@/lib/calculs";
import { formatMontant } from "@/lib/format";

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
    <div className="space-y-3">
      <input type="hidden" name="lignes" value={JSON.stringify(lignes)} />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-normal">Produit</th>
              <th className="px-3 py-2 font-normal">Designation</th>
              <th className="px-3 py-2 font-normal">Qte</th>
              <th className="px-3 py-2 font-normal">Prix HT</th>
              <th className="px-3 py-2 font-normal">Remise %</th>
              <th className="px-3 py-2 font-normal">TVA %</th>
              <th className="px-3 py-2 font-normal">Total HT</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const calculee = calculerLigne(ligne);
              return (
                <tr key={index} className="border-t border-neutral-100">
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
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-600">
                    {formatMontant(calculee.totalHT)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => supprimerLigne(index)}
                      className="text-neutral-400 hover:text-danger"
                      disabled={lignes.length === 1}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={ajouterLigne}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        + Ajouter une ligne
      </button>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Sous-total HT</span>
          <span>{formatMontant(totaux.sousTotalHT)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">TVA</span>
          <span>{formatMontant(totaux.totalTva)}</span>
        </div>
        {timbreFiscal > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Timbre fiscal</span>
            <span>{formatMontant(timbreFiscal)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>Total TTC</span>
          <span>{formatMontant(totaux.totalTTC)}</span>
        </div>
      </div>
    </div>
  );
}

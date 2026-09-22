"use client";

import { useActionState, useState } from "react";
import { changerCouleur, type CouleurState } from "@/lib/actions/couleurs";
import {
  couleurTropProche,
  FAMILLE_PAR_ENTITE,
  grilleSelecteur,
  type Entite,
} from "@/lib/couleur";

const ETAT_INITIAL: CouleurState = {};

const TEXTES: Record<Entite, { titre: string; qui: string }> = {
  client: { titre: "Couleur du client", qui: "client" },
  produit: { titre: "Couleur du produit", qui: "produit" },
  devis: { titre: "Couleur du devis", qui: "devis" },
  avoir: { titre: "Couleur de l'avoir", qui: "avoir" },
  facture: { titre: "Couleur de la facture", qui: "facture" },
};

/**
 * Selecteur de couleur d'un element (famille propre a chaque section). Les
 * couleurs deja prises par un autre element, ou trop proches, sont desactivees ;
 * le serveur re-verifie de toute facon (changerCouleur).
 */
export function CouleurPicker({
  entite,
  id,
  couleurActuelle,
  autres,
}: {
  entite: Entite;
  id: string;
  couleurActuelle: string | null;
  autres: string[];
}) {
  const famille = FAMILLE_PAR_ENTITE[entite];
  const grille = grilleSelecteur(famille);
  const { titre, qui } = TEXTES[entite];

  const [etat, formAction, enCours] = useActionState(changerCouleur.bind(null, entite, id), ETAT_INITIAL);
  const [choix, setChoix] = useState<string | null>(couleurActuelle);

  const conflit = choix ? couleurTropProche(famille, choix, autres) : undefined;
  const inchange = choix === couleurActuelle;

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-900">{titre}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Chaque {qui} a sa propre couleur. Les couleurs deja prises ou trop proches sont grisees.
          </p>
        </div>
        <span
          aria-hidden
          className="size-9 shrink-0 rounded-full border border-neutral-200 shadow-sm"
          style={{ backgroundColor: choix ?? "transparent" }}
        />
      </div>

      <input type="hidden" name="couleur" value={choix ?? ""} />

      <div role="radiogroup" aria-label={titre} className="space-y-1.5">
        {grille.map((ligne, i) => (
          <div key={i} className="flex flex-wrap gap-1.5">
            {ligne.map((hex) => {
              const pris = couleurTropProche(famille, hex, autres) !== undefined;
              const selectionne = hex === choix;
              return (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={selectionne}
                  aria-label={hex}
                  disabled={pris}
                  title={pris ? "Deja utilisee ou trop proche d'une autre" : hex}
                  onClick={() => setChoix(hex)}
                  style={{ backgroundColor: hex }}
                  className={`size-6 rounded-full transition disabled:cursor-not-allowed disabled:opacity-20 disabled:grayscale ${
                    selectionne
                      ? "ring-2 ring-neutral-900 ring-offset-2 ring-offset-surface"
                      : "hover:scale-110"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={enCours || !choix || inchange || conflit !== undefined}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enregistrer la couleur
        </button>
        <p aria-live="polite" className="text-sm">
          {etat.error ? (
            <span className="text-danger">{etat.error}</span>
          ) : etat.ok && inchange ? (
            <span className="text-success">Couleur enregistree.</span>
          ) : conflit ? (
            <span className="text-danger">Trop proche d&apos;une autre couleur deja attribuee.</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}

# À FOURNIR PAR TTN (partie technique)

> La liste précise de ce que vous devez fournir, avec où l'obtenir et dans quel format, est dans [`a-fournir.md`](a-fournir.md).
> Ce document-ci décrit où chaque élément se branche dans le code.

Tout ce qui suit dépend de documents officiels de Tunisie TradeNet (TTN) que nous n'avons pas. **Rien n'a été deviné** :
chaque valeur inconnue est marquée `A-FOURNIR-PAR-TTN` dans le fichier généré, et l'application affiche l'avertissement.

## Documents à obtenir

| # | Document | Ce qu'il débloque |
|---|---|---|
| 1 | **XSD officiel du TEIF** (version en vigueur, actuellement citée : 1.8.8 par des sources non officielles) | validation automatique du fichier, noms exacts des éléments et de leur ordre |
| 2 | **Annexe A : liste des codes** (types de document, fonctions de date et de partie, types d'identifiant, taxes, types de montant, références) | remplace tous les `A-FOURNIR-PAR-TTN` |
| 3 | **Guide d'implémentation** (exemples, règles de gestion) | cas particuliers : FODEC, timbre, retenue à la source, acompte, avoir, lignes de déduction |
| 4 | **Règle du matricule fiscal** | contrôle de format strict (aujourd'hui : 7 chiffres au minimum, forme complète signalée en avertissement) |
| 5 | **Format de signature** (XAdES, certificat qualifié) et **cachet visible / QR code** | signature du fichier |
| 6 | **API / mode d'échange avec TTN** (accès, authentification, environnement de test) | transmission et suivi des statuts |

## Où brancher chaque document (sans réécrire l'application)

| Élément | Fichier | Comment |
|---|---|---|
| Codes officiels | `src/lib/einvoice/spec.json` | renseigner `code`, `source` (document et section) et `official: true`. Le chargement **refuse** un code sans source (`tests/einvoice-spec.test.ts`). |
| Format de date, version TEIF | `src/lib/einvoice/spec.json` | idem (`dateFormat`, `teifVersion`) |
| Structure du XML | `src/lib/einvoice/teif.ts` | les noms d'éléments actuels viennent de sources non officielles ; corriger d'après le XSD |
| XSD | `src/lib/einvoice/official/teif.xsd` | déposer le fichier ; brancher un moteur de validation derrière l'interface `XsdValidator` (`src/lib/einvoice/xsd.ts`) |
| Version du générateur | `GENERATOR_VERSION` dans `src/lib/einvoice/teif-codes.ts` | l'incrémenter à chaque changement de mapping : les fichiers déjà conservés restent intacts |

## État actuel du fichier généré

- Aucun code officiel. Deux codes (`I-1602` TVA, `I-1604` retenue à la source) viennent d'un validateur tiers : ils sont
  marqués « source NON officielle » et comptés à part.
- Tout le reste vaut `A-FOURNIR-PAR-TTN`, y compris le format des dates (les dates sont écrites en ISO `AAAA-MM-JJ`).
- Le fichier porte un commentaire « non signé et non validé, ne pas transmettre ».
- L'application affiche la liste de ce qui manque sur chaque facture (carte « Facture électronique (TEIF) »).

## Ce qui est déjà contrôlé sans TTN

Avant toute préparation, l'application vérifie (`src/lib/einvoice/validate.ts`) : numéro, dates réelles et échéance postérieure à
l'émission, pays (2 lettres), matricules fiscaux, adresses, devise TND, lignes (description, unité, quantité, remise),
montants à 3 décimales, **recalcul complet** des lignes, du récapitulatif de taxes et des totaux par le moteur de facturation,
identité du net à payer (TTC + timbre − retenues), retenue sans taux, avoir sans facture d'origine.

## Simulations de démonstration (à remplacer, pas à supprimer)

| Simulation | Fichier | Remplaçant réel |
|---|---|---|
| Signature (`MockSigner`) | `src/lib/einvoice/signature.ts` | un `Signer` XAdES avec le certificat (interface `Signer`, `getSigner`) |
| Client TTN (`MockTtnClient`) | `src/lib/einvoice/ttn.ts` | un `TtnClient` réel (interface `TtnClient`, `getTtnClient`) |
| QR code de démonstration | `src/lib/einvoice/qr.ts` + `src/lib/pdf/render.ts` | le cachet visible officiel |
| Données fictives | `src/lib/demo/` | — (jamais en production) |

Le reste du circuit (préparation, historique en ajout seul, PDF, interface, tests) est déjà écrit pour fonctionner avec les
vrais composants : il suffira d'ajouter les implémentations réelles derrière ces interfaces.

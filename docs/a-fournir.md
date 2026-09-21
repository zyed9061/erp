# Ce que vous devez fournir (liste précise)

> **Projet d'exercice / démonstration : rien de ce qui suit n'est nécessaire.** Le mode démonstration (`DEMO_MODE=true`, voir le README)
> simule TTN, la signature, le QR code et l'e-mail avec des données fictives. Cette liste ne concerne qu'un usage réel futur.

Rien de ce qui suit ne peut être deviné par le logiciel. Pour chaque élément : **à quoi il sert**, **où l'obtenir**, **dans quel
format**, **comment me le donner**, et **ce que je fais ensuite**. Vous n'avez aucun code à modifier.

**Comment me donner un document** : le déposer dans le dossier `docs/ttn/` du projet (voir `docs/ttn/LISEZ-MOI.md`), puis me dire
« c'est déposé ». **Comment donner un secret** (mot de passe, certificat, identifiants) : ne jamais l'écrire dans une conversation ni
dans le dépôt ; le mettre seulement dans le fichier `.env` de votre serveur (voir la partie C).

Légende des sources : **[vérifié]** = trouvé sur un article de presse ou un site officiel consulté pour ce document ;
**[à confirmer]** = information de seconde main, à faire confirmer par l'organisme.

---

## A. Documents et accès TTN (facture électronique)

### A0. Une décision à prendre AVANT de demander quoi que ce soit

Deux façons d'utiliser El Fatoora, très différentes en travail :

1. **Le portail El Fatoora** (saisie sur le site de TTN) : conçu pour les entreprises et professionnels à faible volume de
   facturation, sans intégration informatique **[vérifié : Business News, 15/09/2026]**. Dans ce cas le logiciel n'a **pas** à
   envoyer de fichier à TTN : nos éléments A1 à A7 ne seraient pas nécessaires.
2. **L'intégration directe** (notre logiciel produit, signe et transmet les fichiers TEIF) : demande tous les éléments A1 à A7.

**À demander à votre comptable ou à TTN** : « Mon entreprise est-elle assujettie à la facture électronique, à partir de quelle date,
et puis-je utiliser le portail au lieu d'une intégration ? » **Format de la réponse** : un e-mail ou une lettre suffit.
**Ce que je fais ensuite** : si c'est le portail, j'ajoute un export « prêt à saisir » et je m'arrête là ; sinon je continue avec A1–A7.

### Où s'adresser à TTN

- Portail : `https://portail.elfatoora.tn` ; adhésion : `https://adhesion.elfatoora.tn` **[vérifié : Business News, 15/09/2026]**.
- Assistance : `support@elfatoora.tn` (technique) et `commercial@elfatoora.tn` (commercial) **[vérifié : même article]**.
- Je n'ai trouvé **aucun lien de téléchargement public** des spécifications sur les sites de TTN : il faut les **demander par
  écrit**. Un modèle de message est en fin de document (partie E).

### Tableau des éléments TTN

| # | Élément | À quoi il sert | Où l'obtenir | Format attendu | Ce que je fais ensuite |
|---|---|---|---|---|---|
| A1 | **Schéma XSD du TEIF** (version en vigueur ; des sites d'éditeurs citent « 1.8.8 » **[à confirmer]**) | valider automatiquement chaque fichier ; noms et ordre exacts des éléments | demande écrite à TTN (`support@elfatoora.tn`), ou à l'espace éditeurs/adhérents après adhésion **[à confirmer]** | fichier `.xsd` (parfois plusieurs, ou un `.zip`) | je le place dans `src/lib/einvoice/official/`, branche un validateur XSD et corrige la structure du XML |
| A2 | **Guide d'implémentation du TEIF** (des sources citent « V2.0 » **[à confirmer]**) | règles que le XSD ne dit pas (formats de date, références de paiement, structure de la signature) | idem A1 | PDF | j'aligne le fichier généré sur le guide et j'ajoute les contrôles correspondants |
| A3 | **Annexe A : liste officielle des codes** (type de document, fonction des parties et des dates, identifiants, taxes dont **FODEC et timbre**, types de montant, références) | remplace tous les `A-FOURNIR-PAR-TTN` du fichier | idem A1 (souvent dans le guide A2) | PDF ou Excel/CSV | je remplis `spec.json` avec la source de chaque code (le programme refuse un code sans source) |
| A4 | **Exemples de fichiers TEIF valides** : facture simple ; avec FODEC ; avec timbre ; avec retenue à la source ; avoir ; facture d'acompte ; facture avec ligne de déduction d'acompte | meilleure preuve de conformité : je compare mot à mot | demander à TTN avec A1 ; à défaut, faire générer un fichier par le portail El Fatoora pour un cas de test | fichiers `.xml` | je crée des tests qui exigent que notre fichier corresponde aux exemples |
| A5 | **Spécification de la signature électronique** (des sources citent « XAdES-B » **[à confirmer]**) et du **cachet visible / QR code** | signer les fichiers et imprimer le QR code sur le PDF | idem A1 | PDF | je code la signature et le QR (nécessite A6) |
| A6 | **Certificat de signature électronique** de votre entreprise et son mot de passe | signer les factures au nom de l'entreprise | auprès d'un prestataire de certification **accepté par TTN** : demander à TTN la liste ; l'autorité nationale s'appelle TunTrust **[à confirmer]** | fichier `.p12` ou `.pfx` + mot de passe (**secret**) | je branche la signature ; le fichier reste sur le serveur, jamais dans Git |
| A7 | **Documentation de l'API / du mode d'échange** + **accès à un environnement de TEST** (adresse, identifiants de test) | envoyer les factures à TTN et lire leur statut (accepté, rejeté) | après adhésion, demande à TTN **[à confirmer]** ; il peut y avoir un contrat éditeur et des frais | PDF ou fichier Swagger/OpenAPI (`.json`/`.yaml`) ; identifiants (**secrets**, à mettre dans `.env`) | je code la transmission et le suivi de statut, d'abord sur l'environnement de test |
| A8 | **Règle officielle du matricule fiscal** (format exact) | contrôle strict à la saisie ; aujourd'hui : 7 chiffres minimum | comptable, ou notice de la DGI | texte ou PDF | je remplace le contrôle minimal par le contrôle officiel |

---

## B. E-mail (SMTP)

**À quoi ça sert** : envoyer les factures, devis et relances par e-mail. Sans cela, l'application écrit seulement un résumé dans sa
console : **aucun e-mail réel ne part** (c'est voulu et déjà sûr).

**Ce que je ne peux pas faire** : choisir votre fournisseur ni créer une boîte à votre place. **Où l'obtenir** : chez le
fournisseur où vous avez déjà (ou allez créer) l'adresse d'envoi de l'entreprise : messagerie de votre hébergeur de site,
Microsoft 365, Google Workspace, ou un service d'envoi en ligne. Cherchez dans son aide « paramètres SMTP » ou « envoyer avec un
logiciel ».

| # | Valeur (nom exact dans `.env`) | Exemple | Remarque |
|---|---|---|---|
| B1 | `SMTP_HOST` | `smtp.votre-fournisseur.tn` | adresse du serveur d'envoi |
| B2 | `SMTP_PORT` | `587` (le plus courant) ou `465` | 587 = chiffrement STARTTLS ; 465 = chiffrement direct |
| B3 | `SMTP_SECURE` | `false` pour 587, `true` pour 465 | souvent déduit du port ; à laisser vide si vous ne savez pas |
| B4 | `SMTP_USER` | `facturation@votre-societe.tn` | identifiant de connexion (souvent l'adresse complète) |
| B5 | `SMTP_PASS` | (secret) | de préférence un **mot de passe d'application** dédié, pas votre mot de passe personnel |
| B6 | `MAIL_FROM` | `Facturation Société <facturation@votre-societe.tn>` | l'adresse doit appartenir à votre domaine ou être autorisée par le fournisseur |

**Pour éviter que vos factures arrivent en courrier indésirable** : dans la gestion de votre nom de domaine (là où il est
enregistré), ajouter les enregistrements **SPF, DKIM et DMARC** que votre fournisseur d'e-mail vous indique. C'est une
manipulation chez votre hébergeur/registrar, pas dans notre logiciel.

**Format pour me les donner** : ne me les donnez pas à moi : écrivez-les dans le fichier `.env` du serveur, puis :
1. lancez `npm run check:config` (il dit en français ce qui est bon ou faux, sans jamais afficher le mot de passe) ;
2. dans l'application, **Paramètres > Configuration > « Envoyer un e-mail de test »** : vous recevez un message si tout fonctionne.

Le chiffrement est **obligatoire** par défaut (TLS 1.2 minimum). Si votre fournisseur ne le propose pas, dites-le-moi plutôt que
de désactiver la protection.

---

## C. Ce que vous devez régler vous-même, sans lien avec TTN

| # | Élément | Comment | Où |
|---|---|---|---|
| C1 | **Mot de passe administrateur** (12 caractères minimum, différent des exemples) | `ADMIN_PASSWORD` avant la création du compte, ou Paramètres > Utilisateurs ; le programme refuse un mot de passe public en production | `.env` / application |
| C2 | **`CRON_SECRET`** (secret des tâches automatiques) | générer avec la commande `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` puis le coller dans `.env` | `.env` |
| C3 | **Informations de la société** : raison sociale, matricule fiscal, adresse, ville | Paramètres > Société, **avant la première facture** (elles sont figées dans chaque facture à sa validation) | application |
| C4 | **Hébergement de production** : un serveur avec PostgreSQL (ou Docker), un nom de domaine, HTTPS | prestataire d'hébergement de votre choix ; Docker demande d'activer la virtualisation du PC, seulement à ce moment-là | hébergeur |
| C5 | **Sauvegardes** de la base (conservation légale de 10 ans) | à mettre en place chez l'hébergeur (sauvegarde quotidienne de la base) | hébergeur |

Vérification : `npm run check:config` (ou Paramètres > Configuration, pour l'administrateur) liste tout ce qui reste à faire.

---

## D. Questions pour votre comptable

Le fichier `docs/points-a-valider-comptable.md` contient 17 règles appliquées par le logiciel (timbre, FODEC, retenue à la source,
retenue de garantie, base de la TVA…). **Format de la réponse** : « confirmé » ou « à corriger : … » pour chaque ligne. Je corrige
ensuite le moteur de calcul et les tests.

---

## E. Modèle de message à envoyer à TTN

À : `support@elfatoora.tn` (avec `commercial@elfatoora.tn` en copie pour la partie adhésion)

> Objet : Demande de documentation technique TEIF pour l'intégration d'un logiciel de facturation
>
> Bonjour,
>
> Nous développons un logiciel de facturation pour notre entreprise [raison sociale, matricule fiscal] et souhaitons produire
> des factures électroniques conformes au format TEIF et les transmettre via El Fatoora.
>
> Pourriez-vous nous transmettre :
> 1. le schéma XSD du TEIF en vigueur (et sa version) ;
> 2. le guide d'implémentation TEIF ;
> 3. l'annexe listant les codes officiels (types de document, fonctions, identifiants, taxes dont FODEC et droit de timbre, types de montants) ;
> 4. des exemples de fichiers TEIF valides (facture, avoir, facture d'acompte, avec retenue à la source, FODEC et timbre) ;
> 5. la spécification de la signature électronique attendue et du cachet visible (QR code), et la liste des prestataires de certificats acceptés ;
> 6. la documentation de l'interface d'échange (API) et l'accès à un environnement de test ;
> 7. les conditions d'adhésion, de contrat et de tarification pour un éditeur ou une entreprise qui intègre directement.
>
> Nous souhaitons également savoir si notre entreprise est concernée par l'obligation de facturation électronique, à partir de
> quelle date, et si le portail El Fatoora peut être utilisé à la place d'une intégration.
>
> Cordialement,
> [nom, fonction, téléphone]

---

## Ce qui est déjà fait sans ces informations

Voir `docs/ttn-a-fournir.md` (où chaque document se branche) et le README. En résumé : structure du fichier TEIF et contrôles
internes ; conservation en ajout seul ; e-mail chiffré par défaut, en mode journal tant que rien n'est configuré ; diagnostic de
configuration ; refus des mots de passe publics en production ; limitation des tentatives de connexion par adresse IP ;
en-têtes de sécurité ; secrets et certificats exclus de Git.

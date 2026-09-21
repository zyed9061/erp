# Documents fournis par TTN

Déposez ici les documents officiels reçus de TTN (PDF, Excel, XML, ZIP), **sans les renommer**. Ils ne contiennent aucun secret.

| Document | Nom de fichier conseillé | Format attendu |
|---|---|---|
| Schéma XSD du TEIF | laissez le nom d'origine, et copiez aussi le `.xsd` dans `src/lib/einvoice/official/teif.xsd` | `.xsd` (éventuellement dans un `.zip`) |
| Guide d'implémentation TEIF | idem | PDF |
| Annexe A (liste des codes) | idem | PDF ou Excel |
| Exemples de fichiers TEIF valides | dossier `exemples/` | `.xml` |
| Documentation de signature (XAdES) | idem | PDF |
| Documentation de l'API / échange | idem | PDF, ou fichier Swagger/OpenAPI (`.json` / `.yaml`) |

## À ne JAMAIS déposer ici, ni dans le dépôt Git, ni dans une conversation

- le certificat de signature (`.p12`, `.pfx`, `.pem`, `.key`) et son mot de passe ;
- les identifiants de connexion à TTN (test ou production) ;
- le mot de passe SMTP.

Ces éléments vont uniquement dans le fichier `.env` du serveur (ignoré par Git) ou dans le coffre de secrets de l'hébergeur.
Les extensions de certificats sont déjà exclues de Git par `.gitignore`.

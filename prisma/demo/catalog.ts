/**
 * Static reference data for the demo dataset. All company and person names are
 * fictional combinations; any resemblance to a real business is accidental.
 */

export const CITIES = [
  { ville: "Tunis", codePostal: "1000" },
  { ville: "Ariana", codePostal: "2080" },
  { ville: "Ben Arous", codePostal: "2013" },
  { ville: "Sfax", codePostal: "3000" },
  { ville: "Sousse", codePostal: "4000" },
  { ville: "Monastir", codePostal: "5000" },
  { ville: "Nabeul", codePostal: "8000" },
  { ville: "Bizerte", codePostal: "7000" },
  { ville: "Gabes", codePostal: "6000" },
  { ville: "Kairouan", codePostal: "3100" },
] as const;

export const STREETS = [
  "Avenue Habib Bourguiba",
  "Rue de Marseille",
  "Avenue de la Liberte",
  "Rue Ibn Khaldoun",
  "Avenue Hedi Chaker",
  "Rue de l'Industrie",
  "Zone Industrielle",
  "Avenue de Carthage",
  "Rue Mongi Slim",
  "Route de l'Aeroport",
] as const;

export const COMPANY_PREFIXES = [
  "Atlas", "Medina", "Carthago", "Jasmin", "Sahel", "Oasis", "Cap Bon", "Djerba",
  "Zitouna", "Kerkenna", "Hannibal", "Tabarka", "Numidia", "Elyssa", "Byrsa", "Salammbo",
  "Thapsus", "Hadrumete", "Utique", "Dougga",
] as const;

export const COMPANY_ACTIVITIES = [
  "Services", "Tech", "Distribution", "Industries", "Consulting", "Logistique", "Batiment",
  "Agro", "Pharma", "Textile", "Energie", "Immobilier", "Transport", "Medical", "Digital",
] as const;

export const COMPANY_FORMS = ["SARL", "SUARL", "SA"] as const;

export const FIRST_NAMES = [
  "Mohamed", "Ahmed", "Ali", "Youssef", "Karim", "Sami", "Hichem", "Walid", "Nizar", "Anis",
  "Amira", "Salma", "Ines", "Rim", "Nour", "Mariem", "Sonia", "Leila", "Emna", "Olfa",
] as const;

export const LAST_NAMES = [
  "Ben Salah", "Trabelsi", "Gharbi", "Jaziri", "Mansouri", "Hamdi", "Bouazizi", "Chaabane",
  "Ayari", "Khelifi", "Ferchichi", "Dridi", "Sassi", "Mejri", "Belhadj", "Zouari",
] as const;

export interface CatalogProduct {
  reference: string;
  designation: string;
  type: "PRODUIT" | "SERVICE";
  categorie: string;
  prixUnitaireHT: number;
  uniteMesure: string;
  tauxTva: number;
  /** Typical quantity range on an invoice line. */
  quantite: [number, number];
}

// Tunisian VAT rates in use: 19% (standard), 13% and 7% (reduced).
export const PRODUCTS: CatalogProduct[] = [
  { reference: "SRV-CONS-01", designation: "Conseil strategique (jour)", type: "SERVICE", categorie: "Conseil", prixUnitaireHT: 850, uniteMesure: "jour", tauxTva: 19, quantite: [1, 8] },
  { reference: "SRV-CONS-02", designation: "Audit organisationnel", type: "SERVICE", categorie: "Conseil", prixUnitaireHT: 3200, uniteMesure: "forfait", tauxTva: 19, quantite: [1, 1] },
  { reference: "SRV-CONS-03", designation: "Accompagnement fiscal (heure)", type: "SERVICE", categorie: "Conseil", prixUnitaireHT: 120, uniteMesure: "heure", tauxTva: 19, quantite: [2, 20] },
  { reference: "SRV-CONS-04", designation: "Etude de marche", type: "SERVICE", categorie: "Conseil", prixUnitaireHT: 4500, uniteMesure: "forfait", tauxTva: 19, quantite: [1, 1] },
  { reference: "SRV-DEV-01", designation: "Developpement web (jour)", type: "SERVICE", categorie: "Developpement", prixUnitaireHT: 450, uniteMesure: "jour", tauxTva: 19, quantite: [2, 20] },
  { reference: "SRV-DEV-02", designation: "Application mobile (forfait)", type: "SERVICE", categorie: "Developpement", prixUnitaireHT: 12000, uniteMesure: "forfait", tauxTva: 19, quantite: [1, 1] },
  { reference: "SRV-DEV-03", designation: "Integration ERP (jour)", type: "SERVICE", categorie: "Developpement", prixUnitaireHT: 600, uniteMesure: "jour", tauxTva: 19, quantite: [2, 15] },
  { reference: "SRV-DEV-04", designation: "Site vitrine", type: "SERVICE", categorie: "Developpement", prixUnitaireHT: 2400, uniteMesure: "forfait", tauxTva: 19, quantite: [1, 1] },
  { reference: "SRV-MNT-01", designation: "Maintenance mensuelle", type: "SERVICE", categorie: "Maintenance", prixUnitaireHT: 380, uniteMesure: "mois", tauxTva: 19, quantite: [1, 3] },
  { reference: "SRV-MNT-02", designation: "Intervention sur site", type: "SERVICE", categorie: "Maintenance", prixUnitaireHT: 150, uniteMesure: "intervention", tauxTva: 19, quantite: [1, 6] },
  { reference: "SRV-MNT-03", designation: "Support premium (annuel)", type: "SERVICE", categorie: "Maintenance", prixUnitaireHT: 3600, uniteMesure: "an", tauxTva: 19, quantite: [1, 1] },
  { reference: "SRV-MNT-04", designation: "Sauvegarde externalisee", type: "SERVICE", categorie: "Maintenance", prixUnitaireHT: 95, uniteMesure: "mois", tauxTva: 19, quantite: [1, 12] },
  { reference: "SRV-FOR-01", designation: "Formation bureautique (jour)", type: "SERVICE", categorie: "Formation", prixUnitaireHT: 420, uniteMesure: "jour", tauxTva: 19, quantite: [1, 5] },
  { reference: "SRV-FOR-02", designation: "Formation cybersecurite", type: "SERVICE", categorie: "Formation", prixUnitaireHT: 1800, uniteMesure: "session", tauxTva: 19, quantite: [1, 2] },
  { reference: "SRV-FOR-03", designation: "Formation comptabilite", type: "SERVICE", categorie: "Formation", prixUnitaireHT: 650, uniteMesure: "jour", tauxTva: 19, quantite: [1, 4] },
  { reference: "SRV-HEB-01", designation: "Hebergement web (annuel)", type: "SERVICE", categorie: "Hebergement", prixUnitaireHT: 540, uniteMesure: "an", tauxTva: 19, quantite: [1, 3] },
  { reference: "SRV-HEB-02", designation: "Nom de domaine .tn", type: "SERVICE", categorie: "Hebergement", prixUnitaireHT: 45, uniteMesure: "an", tauxTva: 19, quantite: [1, 4] },
  { reference: "SRV-HEB-03", designation: "Serveur dedie (mois)", type: "SERVICE", categorie: "Hebergement", prixUnitaireHT: 290, uniteMesure: "mois", tauxTva: 19, quantite: [1, 12] },
  { reference: "SRV-TRA-01", designation: "Transport de marchandises", type: "SERVICE", categorie: "Logistique", prixUnitaireHT: 210, uniteMesure: "voyage", tauxTva: 7, quantite: [1, 10] },
  { reference: "SRV-TRA-02", designation: "Stockage entrepot (m2/mois)", type: "SERVICE", categorie: "Logistique", prixUnitaireHT: 12, uniteMesure: "m2", tauxTva: 19, quantite: [20, 300] },
  { reference: "PRD-INF-01", designation: "Ordinateur portable pro", type: "PRODUIT", categorie: "Informatique", prixUnitaireHT: 2350, uniteMesure: "unite", tauxTva: 19, quantite: [1, 10] },
  { reference: "PRD-INF-02", designation: "Ecran 27 pouces", type: "PRODUIT", categorie: "Informatique", prixUnitaireHT: 690, uniteMesure: "unite", tauxTva: 19, quantite: [1, 12] },
  { reference: "PRD-INF-03", designation: "Imprimante laser", type: "PRODUIT", categorie: "Informatique", prixUnitaireHT: 980, uniteMesure: "unite", tauxTva: 19, quantite: [1, 4] },
  { reference: "PRD-INF-04", designation: "Routeur professionnel", type: "PRODUIT", categorie: "Informatique", prixUnitaireHT: 540, uniteMesure: "unite", tauxTva: 19, quantite: [1, 5] },
  { reference: "PRD-INF-05", designation: "Onduleur 1500VA", type: "PRODUIT", categorie: "Informatique", prixUnitaireHT: 460, uniteMesure: "unite", tauxTva: 19, quantite: [1, 6] },
  { reference: "PRD-INF-06", designation: "Disque SSD 1To", type: "PRODUIT", categorie: "Informatique", prixUnitaireHT: 310, uniteMesure: "unite", tauxTva: 19, quantite: [1, 20] },
  { reference: "PRD-LOG-01", designation: "Licence antivirus (poste)", type: "PRODUIT", categorie: "Logiciels", prixUnitaireHT: 85, uniteMesure: "licence", tauxTva: 19, quantite: [5, 100] },
  { reference: "PRD-LOG-02", designation: "Licence suite bureautique", type: "PRODUIT", categorie: "Logiciels", prixUnitaireHT: 320, uniteMesure: "licence", tauxTva: 19, quantite: [1, 50] },
  { reference: "PRD-LOG-03", designation: "Logiciel de gestion commerciale", type: "PRODUIT", categorie: "Logiciels", prixUnitaireHT: 2900, uniteMesure: "licence", tauxTva: 19, quantite: [1, 3] },
  { reference: "PRD-FOU-01", designation: "Ramette papier A4", type: "PRODUIT", categorie: "Fournitures", prixUnitaireHT: 14.5, uniteMesure: "ramette", tauxTva: 19, quantite: [10, 200] },
  { reference: "PRD-FOU-02", designation: "Cartouche toner", type: "PRODUIT", categorie: "Fournitures", prixUnitaireHT: 165, uniteMesure: "unite", tauxTva: 19, quantite: [2, 30] },
  { reference: "PRD-FOU-03", designation: "Classeur archive", type: "PRODUIT", categorie: "Fournitures", prixUnitaireHT: 6.8, uniteMesure: "unite", tauxTva: 19, quantite: [20, 300] },
  { reference: "PRD-FOU-04", designation: "Mobilier de bureau (poste)", type: "PRODUIT", categorie: "Fournitures", prixUnitaireHT: 1250, uniteMesure: "poste", tauxTva: 19, quantite: [1, 15] },
  { reference: "PRD-MED-01", designation: "Kit de premiers secours", type: "PRODUIT", categorie: "Medical", prixUnitaireHT: 75, uniteMesure: "kit", tauxTva: 7, quantite: [2, 40] },
  { reference: "PRD-MED-02", designation: "Gants nitrile (boite)", type: "PRODUIT", categorie: "Medical", prixUnitaireHT: 18, uniteMesure: "boite", tauxTva: 7, quantite: [10, 400] },
  { reference: "PRD-AGR-01", designation: "Huile d'olive extra (bidon 5L)", type: "PRODUIT", categorie: "Agroalimentaire", prixUnitaireHT: 68, uniteMesure: "bidon", tauxTva: 13, quantite: [10, 300] },
  { reference: "PRD-AGR-02", designation: "Dattes Deglet Nour (carton)", type: "PRODUIT", categorie: "Agroalimentaire", prixUnitaireHT: 42, uniteMesure: "carton", tauxTva: 13, quantite: [10, 500] },
  { reference: "PRD-BAT-01", designation: "Ciment (tonne)", type: "PRODUIT", categorie: "Batiment", prixUnitaireHT: 310, uniteMesure: "tonne", tauxTva: 19, quantite: [2, 60] },
  { reference: "PRD-BAT-02", designation: "Carrelage (m2)", type: "PRODUIT", categorie: "Batiment", prixUnitaireHT: 38, uniteMesure: "m2", tauxTva: 19, quantite: [20, 800] },
  { reference: "PRD-BAT-03", designation: "Peinture murale (pot 20L)", type: "PRODUIT", categorie: "Batiment", prixUnitaireHT: 145, uniteMesure: "pot", tauxTva: 19, quantite: [2, 80] },
];

export const CREDIT_NOTE_REASONS = [
  "Remise commerciale accordee apres facturation",
  "Retour partiel de marchandise",
  "Erreur de quantite facturee",
  "Prestation partiellement non realisee",
  "Geste commercial suite a reclamation",
] as const;

export const PAYMENT_TERMS_DAYS = [0, 15, 30, 45, 60] as const;

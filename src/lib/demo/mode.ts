/**
 * MODE DÉMONSTRATION (DEMO_MODE=true) : projet d'exercice. TTN, signature électronique et QR code sont SIMULÉS ; les
 * données sont fictives ; aucun e-mail réel ne part. Rien de ce que produit ce mode n'a de valeur légale ou fiscale.
 */
export const isDemoMode = (env: NodeJS.ProcessEnv = process.env): boolean => env.DEMO_MODE === "true";

export const DEMO_BANNER = "MODE DÉMONSTRATION : données fictives, TTN / signature / QR code simulés, aucune valeur légale.";
export const DEMO_SIGNATURE_LABEL = "SIGNATURE SIMULÉE (DEMO) : ce n'est pas une signature électronique qualifiée";

/**
 * Outil de validation manuelle du Checkout Lifetime S3A.
 * Accessible UNIQUEMENT sur un déploiement Vercel Preview :
 * production, development et valeur absente sont refusés (fail closed).
 */
export function isLifetimePreviewTestEnabled(vercelEnv: string | undefined): boolean {
  return vercelEnv === "preview"
}

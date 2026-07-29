import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
import { getSettings } from "@/lib/booking/queries"
import { sendEmail } from "@/lib/email/send"
import { verificationEmail } from "@/lib/email/templates"

/**
 * Configuration Better Auth (authentification email + mot de passe).
 *
 * Utilisée pour :
 *  - le dashboard administrateur (le professionnel),
 *  - plus tard, l'espace client optionnel.
 *
 * Le même Pool PostgreSQL que Drizzle est réutilisé (une seule connexion).
 */
export const auth = betterAuth({
  database: pool,
  // On ne fige `baseURL` que si elle est explicitement fournie. Sinon Better
  // Auth la déduit de la requête entrante — indispensable derrière le proxy
  // d'aperçu v0 (domaines *.vercel.run / *.vusercontent.net) et sur le futur
  // domaine personnalisé du professionnel, sans configuration.
  ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
  emailAndPassword: {
    enabled: true,
    // Inscription publique ouverte : n'importe qui peut créer un compte, mais
    // l'adresse email doit être confirmée avant de pouvoir se connecter.
    requireEmailVerification: true,
    autoSignIn: true,
  },
  emailVerification: {
    // Envoi automatique du lien de confirmation à l'inscription.
    sendOnSignUp: true,
    // Connexion automatique une fois l'email confirmé (atterrissage sur /admin).
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // lien valable 24h
    sendVerificationEmail: async ({ user: u, url }) => {
      // Coordonnées de l'entreprise pour l'expéditeur / le pied de page.
      const settings = await getSettings().catch(() => null)
      const businessName = settings?.businessName || "DetailFlow"
      const { subject, html } = verificationEmail({
        url,
        name: u.name,
        businessName,
        businessEmail: settings?.businessEmail,
        businessPhone: settings?.businessPhone,
      })
      await sendEmail({ to: u.email, subject, html, fromName: businessName })
    },
  },
  // `trustedOrigins` est une fonction : l'app admin et son API d'auth sont
  // TOUJOURS servies depuis le même hôte. On fait donc confiance à toute
  // requête strictement same-origin (origin.host === host de la requête),
  // quel que soit le domaine (aperçu v0, *.vercel.app, domaine client custom).
  // On ajoute aussi les origines connues via variables d'environnement.
  trustedOrigins: async (request) => {
    const origins = new Set<string>(["http://localhost:3000", "http://127.0.0.1:3000"])
    if (process.env.V0_RUNTIME_URL) origins.add(process.env.V0_RUNTIME_URL)
    if (process.env.BETTER_AUTH_URL) origins.add(process.env.BETTER_AUTH_URL)
    if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`)
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    }
    // App multi-tenant servie sur le domaine racine ET tout sous-domaine
    // d'entreprise ({slug}.detailflow.fr). On fait donc confiance à l'apex,
    // au www et à tous les sous-domaines (wildcard supporté par Better Auth),
    // pour que connexion/inscription/callback fonctionnent quel que soit l'hôte.
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim()
    if (root) {
      origins.add(`https://${root}`)
      origins.add(`https://www.${root}`)
      origins.add(`https://*.${root}`)
    }
    try {
      const origin = request?.headers.get("origin")
      const host = request?.headers.get("host")
      if (origin && host && new URL(origin).host === host) {
        origins.add(origin)
      }
    } catch {
      // origin non parsable : on ignore, la liste statique s'applique.
    }
    return Array.from(origins)
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 jours
    updateAge: 60 * 60 * 24, // 1 jour
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // En dev, l'aperçu v0 est affiché dans une iframe cross-site. Pour
          // que le navigateur accepte ET renvoie le cookie de session, il faut :
          //  - sameSite: "none" + secure    → autorisé en contexte cross-site,
          //  - partitioned: true (CHIPS)    → requis par Chrome depuis le blocage
          //    des cookies tiers, sinon le cookie est purement ignoré dans l'iframe.
          // En production (domaine propre du professionnel, same-origin), ces
          // réglages ne s'appliquent pas : Better Auth utilise SameSite=Lax.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
            partitioned: true,
          },
        },
      }
    : {}),
})

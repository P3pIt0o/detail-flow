# DetailFlow — règles pour Claude Code (kit v2)

SaaS multi-tenant pour les pros du detailing automobile (detailflow.fr). Un tenant = une entreprise
(`companies`, `companyId`). Réponds en français ; textes d'interface en français, vouvoiement.

## Stack
Next.js 16 (App Router), React 19, TypeScript 5.7, Tailwind v4, shadcn/ui (Base UI). PostgreSQL + Drizzle
(`lib/db/schema.ts`, driver `pg` ; le README qui cite Prisma est obsolète). Better Auth (`lib/auth.ts`).
Stripe (Billing plateforme + Connect), Resend, Vercel Blob, SMS AllMySMS. Tests Vitest `tests/**/*.test.ts`.

## Commandes
- Vérification d'un lot (typecheck + tests + contrôles) : `node .claude/hooks/lot.mjs verify <LOT>` (`--quick` pendant le dev)
- Ponctuel : `pnpm exec vitest run tests/<fichier>.test.ts`, `pnpm exec tsc --noEmit`
- `pnpm lint` ne fonctionne pas (ESLint absent du projet) : ne le lance pas.
- Les tests BDD/réseau sont ignorés chez toi (pas d'accès BDD, c'est voulu). Le développeur les lance via `dfguard.mjs test-db`.

## Où se trouve quoi
Prix affichés `lib/pricing/plans.ts` · droits/limites par plan `lib/licensing/registry.ts` (PLAN_MATRIX) et
`lib/licensing/enforce.ts` · commissions paiements en ligne `lib/billing/commercial-rules.ts` (COMMISSION_RULES, utilisé
par `lib/payments/`) · commissions abonnements clients `lib/customer-subscriptions/plan-policy.ts` (système DISTINCT) ·
abonnements SaaS `lib/billing/subscription-*.ts` · Lifetime `lib/billing/lifetime-*.ts` · SMS `lib/sms/` ·
réservation `lib/booking/` · landing `components/marketing/` · migrations `scripts/*.sql`.

## Règles non négociables
1. **Tenants.** Côté admin, `companyId` vient UNIQUEMENT de `requireCompanyMember()` (`lib/admin.ts`) ou
   `requireAdminCompanyId()`. Jamais de l'URL, d'un FormData, d'un body ou du navigateur. `requireCompanyId()` et
   `resolvePublicRequestTenant()` sont réservés aux chemins publics. Toute requête Drizzle sur une table tenant
   (select/update/delete) filtre par `companyId`. Un ID reçu du client est re-vérifié comme appartenant au tenant.
   Tout accès nouveau a un test « le tenant B ne voit/modifie pas les données du tenant A ».
2. **Droits par plan** contrôlés côté serveur (`canUseFeature`, `canCreateWithinLimit`), pas seulement masqués.
3. **Argent/Stripe.** Centimes entiers, taux en points de base. Webhooks : signature vérifiée, idempotence, aucun effet
   avant succès. Écritures Stripe avec `idempotencyKey`. Aucun Price ID, clé ou secret en dur : variables d'env,
   documentées dans `.env.example`. Chaque règle de prix/commission/quota a des tests de cas limites.
4. **Migrations** : nouveau fichier `scripts/<nom>-migration.sql`, additif et idempotent (`IF NOT EXISTS`), en-tête
   commenté. Jamais DROP/RENAME/changement de type. Jamais modifier une migration existante. Tu ne les exécutes JAMAIS.
5. **Secrets** : n'essaie pas de lire `.env*`, `~/.ssh`, les jetons, ni d'afficher des variables d'environnement.
6. **Git** : jamais de push, merge, rebase, fetch, tag, ni de commit sur `main`. Commits locaux sur `lot/<LOT>-<slug>`.
7. **Ne contourne jamais la garde.** Si une action est refusée par « [Garde DetailFlow] », n'essaie pas une variante :
   explique le blocage au développeur en une phrase et attends.
8. **Décisions commerciales** (prix, quotas, commissions, remises, textes de vente) : jamais inventées. Si la fiche ne
   tranche pas, pose la question.
9. Reste dans le périmètre du plan approuvé ; tout écart est signalé dans le rapport.

## Workflow
Lots décrits dans `docs/lots/`. Commande : `/lot <LOT>`. L'état est dans `.lot-state/` (non versionné).

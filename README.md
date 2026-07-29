# DetailFlow — Modèle de site pour professionnels du detailing

Modèle de site web **premium, duplicable et personnalisable** destiné aux entreprises de detailing automobile. Chaque client obtient une copie personnalisée en modifiant quelques fichiers de configuration, sans toucher au code.

> **Phase 1 (actuelle)** : site vitrine complet + architecture modulaire prête à recevoir les modules avancés.
> **Phases suivantes** : moteur de réservation, calcul des frais de déplacement, dashboard admin, emails automatiques, acomptes/paiements, espace client.

---

## Stack technique

| Domaine        | Technologie                          |
| -------------- | ------------------------------------ |
| Framework      | Next.js (App Router) + TypeScript    |
| Style          | Tailwind CSS v4                      |
| Composants UI  | shadcn/ui (Base UI)                  |
| Animations     | Framer Motion                        |
| Base de données| PostgreSQL + Prisma (schéma prêt)    |
| SEO            | Metadata API, sitemap, robots, JSON-LD |

> Le client final ne voit jamais les technologies utilisées : aucune mention de framework n'apparaît dans l'interface publique.

---

## Personnaliser le site pour un nouveau client

Tout se règle depuis le dossier `config/`. **Aucune connaissance technique poussée n'est nécessaire.**

1. **`config/site.ts`** — identité de marque : nom, logo, coordonnées, réseaux sociaux, WhatsApp, horaires, navigation, SEO.
2. **`config/content.ts`** — prestations, catégories, types de véhicules, options, galerie, avis, FAQ, page « À propos ».
3. **`config/legal.ts`** — informations légales de l'entreprise (mentions, éditeur, hébergeur).
4. **`app/globals.css`** — couleurs de la marque (variables `--primary`, `--background`, etc.).
5. **`/public`** — remplacer les images (hero, prestations, galerie, logo, `og-image`).

---

## Structure du projet

```
config/                 # 🎯 SEUL dossier à modifier pour personnaliser un client
  site.ts               # Identité, coordonnées, nav, SEO, feature flags
  content.ts            # Prestations, galerie, avis, FAQ (forme = future DB)
  legal.ts              # Données légales de l'entreprise

app/                    # Routes (App Router)
  layout.tsx            # Shell global : nav + footer + WhatsApp + SEO + JSON-LD
  page.tsx              # Accueil (compose les sections)
  prestations/          # Liste des prestations + tarifs véhicules/options
  galerie/              # Galerie avant/après filtrable
  avis/                 # Avis clients + note moyenne
  a-propos/             # Histoire, valeurs, statistiques
  contact/              # Formulaire (Server Action) + coordonnées
    actions.ts          # Traitement serveur du formulaire (email en Phase 4)
  mentions-legales/     # Pages juridiques
  cgv/
  confidentialite/
  sitemap.ts            # Sitemap généré depuis la config
  robots.ts             # robots.txt (bloque /admin, /compte, /api)
  not-found.tsx         # Page 404 personnalisée

components/
  layout/               # Navbar, footer, logo, header de page, WhatsApp
  sections/             # Sections de la page d'accueil (hero, process, etc.)
  ui/                   # Primitives (bouton CTA, reveal, note, titres…)
  *.tsx                 # Composants métier (service-card, before-after-slider…)

lib/
  db.ts                 # Singleton Prisma (client PostgreSQL)

prisma/
  schema.prisma         # Schéma complet : prépare TOUS les modules futurs
```

### Pourquoi cette architecture ?

- **Séparation données / présentation** : les composants lisent `config/`. En Phase 2/3, on remplace ces imports par des requêtes Prisma **sans réécrire l'affichage** (les types de `content.ts` correspondent déjà au schéma DB).
- **Feature flags** (`siteConfig.features`) : activer un module (réservation, espace client…) se fera via un booléen, sans casser l'existant.
- **Zones privées réservées** : `/admin`, `/compte` et `/api` sont déjà exclues de l'indexation (`robots.ts`).

---

## Démarrage

```bash
# 1. Installer les dépendances
pnpm install

# 2. Copier et remplir les variables d'environnement
cp .env.example .env

# 3. (Optionnel Phase 1) Générer le client Prisma et la base
pnpm prisma generate
pnpm prisma migrate dev --name init

# 4. Lancer le serveur de développement
pnpm dev
```

En Phase 1, le site fonctionne **sans base de données** (contenu servi depuis `config/`). La base devient nécessaire à partir de la Phase 2 (réservations).

---

## Variables d'environnement

Voir `.env.example`. Les principales :

- `DATABASE_URL` — connexion PostgreSQL (Neon recommandé).
- `NEXT_PUBLIC_SITE_URL` — URL de production (SEO/OG).
- Variables préparées et commentées pour les phases suivantes (email, auth, paiement, cartographie).

---

## Feuille de route (modules à venir)

- [ ] **Réservation** en ligne (prestations, véhicules, options, créneaux anti-doublon).
- [ ] **Frais de déplacement** calculés côté serveur depuis l'adresse client.
- [ ] **Dashboard admin** (calendrier multi-vues, clients, réservations, mode vacances, stats).
- [ ] **Emails automatiques** (confirmations, rappels, demande d'avis) personnalisables.
- [ ] **Acomptes & paiements** (Wero, virement, manuel ; Stripe branchable ultérieurement).
- [ ] **Espace client** optionnel (compte, historique, factures).

---

## Personnalisation des couleurs

Dans `app/globals.css`, ajustez les variables du thème. La couleur d'accent par défaut est un **bleu électrique sur fond noir**. Modifiez `--primary` (et éventuellement `--background`) pour changer toute l'identité visuelle du site.

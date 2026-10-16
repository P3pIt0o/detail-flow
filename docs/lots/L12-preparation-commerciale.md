# L12 — Préparation commerciale et fiabilité production (TRANSVERSE)

**Porte de sortie avant généralisation commerciale. Aucune mise en ligne sans ton accord explicite.**

## Objectif
Prouver de bout en bout, sur Preview, que les parcours qui touchent l'argent et les clients fonctionnent, et lister les risques résiduels.

## Dépendances
L0 à L8 terminés ou explicitement reportés par toi.

## Constat (16/10/2026, `main` @ c7c997d)
- **Aucune CI** : pas de dossier `.github/` (voir fiche L98). Déploiement via Vercel (crons dans `vercel.json` : reminders, customer-subscription-emails, notifications).
- **Aucun outil de suivi d'erreurs** (Sentry ou équivalent) dans `package.json`.
- Webhooks : `app/api/billing/webhook/route.ts` (plateforme), `app/api/payments/webhook/route.ts` (Connect).
- `pnpm lint` inutilisable (ESLint absent).

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Outil de suivi d'erreurs et d'alertes (et qui reçoit les alertes) : ____
- [ ] Politique de sauvegarde / restauration Neon et test de restauration (fait par toi) : ____
- [ ] Textes contractuels (CGV, confidentialité, mentions) relus par qui : ____
- [ ] Critères chiffrés de mise en vente (taux d'erreur, délais) : ____

## Checklist de bout en bout (Preview, Stripe en mode test)
- [ ] Essai → souscription → changement de plan → suspension/impayé → résiliation programmée → résiliation effective → facture.
- [ ] Paiement en ligne d'une réservation, commission, remboursement partiel et total, webhook rejoué.
- [ ] Notifications transactionnelles reçues par les bons destinataires.
- [ ] Alertes webhook/paiement déclenchées sur échec simulé, sans donnée sensible dans les messages.
- [ ] Mobile, accessibilité de base, performances des pages publiques.
- [ ] Procédure de retour arrière écrite (Vercel + base).

## Livrables
Checklist cochée avec preuves, rapport des risques résiduels, ta décision écrite de lancement.

# L6 — Liste d'attente

## Objectif
À définir par toi : la fiche ne peut pas être planifiée tant que la nature de la liste n'est pas tranchée.

## Dépendances
Aucune technique. Si (a) ci-dessous : cohérence avec L4 (landing).

## Constat dans le code (revérifié le 16/10/2026, `main` @ c7c997d)
- Performance et Équipe sont affichés « bientôt » sur la page tarifs (`coming_soon`) : cas d'usage possible d'une liste d'attente de type (a).
- Aucune « waitlist » trouvée.
- Il existe déjà un formulaire public « Programme Beta Tester » : `components/marketing/beta-form.tsx`, action
  `submitBetaLead` dans `app/marketing/actions.ts` (enregistre un lead). Une liste d'attente de type (a) pourrait le réutiliser.

## Décisions à confirmer (à remplir AVANT de lancer le lot)
- [ ] Nature : (a) liste d'attente DetailFlow pour un plan pas encore commercialisé (ex. Équipe), via la landing ;
      (b) liste d'attente de créneaux pour les clients finaux d'un pro (côté réservation, multi-tenant) ; ou autre : ____
- [ ] Si (a) : réutiliser le mécanisme Beta (`submitBetaLead`) ou un nouveau formulaire ? : ____
- [ ] Données collectées, base légale RGPD et durée de conservation : ____
- [ ] Notification à l'inscription (email au pro / à toi / à l'inscrit) : ____
- [ ] Désinscription : lien dans l'email, ou suppression manuelle : ____

## Critères d'acceptation (communs, complétés après décision)
- [ ] Validation serveur, anti-spam (limitation de débit + champ piège), message d'erreur générique.
- [ ] Si (b) : données isolées par tenant (test A/B), garde publique `resolvePublicRequestTenant()`.
- [ ] Désinscription effective (test).

## Tests de non-régression (existants)
Si (a) et réutilisation Beta : tests couvrant `app/marketing/actions.ts` (à identifier pendant l'audit).

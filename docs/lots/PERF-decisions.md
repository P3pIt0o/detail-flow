# PERF-1 — Décisions, études et points ouverts (L13 à L16)

Mis à jour le 16/10/2026. Constat : `main` @ c7c997d (lecture seule). Ce document ne décide rien à la place du développeur :
toute ligne « ouverte » reste `[ ]` dans la fiche du lot concerné, et `lot.mjs plan-ready` refuse un plan qui en contient.

## 1. État des décisions N1 à N9

| # | Sujet | État | Où |
| --- | --- | --- | --- |
| N1 | Points forts de Performance (suivi des dépenses et analyse de rentabilité déjà inclus dans Indépendant) | **Ouverte** — proposition en attente | L13 |
| N2 | Libellé public des SMS (« 50 SMS crédités chaque mois, cumulables ») | **Ouverte** — proposition en attente | L15 |
| N3 | Lifetime et autres clients BUSINESS | **Ouverte** — étude §2 | L15 |
| N4 | Complément de SMS à l'upgrade en cours de mois | **Ouverte** — étude §3 | L16 |
| N5 | Portail : poursuivre l'essai lors d'un upgrade (`continue_trial`) | **Ouverte** — proposition en attente | L14 |
| N6 | Remises de fidélité et proratas Stripe | **Ouverte** — étude §4 (aucune suppression décidée) | L14, L16 |
| N7 | Ligne « Analyse de rentabilité » dans le comparateur | **Ouverte** — proposition en attente | L13 |
| N8 | 50 SMS pendant l'essai Performance | **Ouverte** — proposition en attente | L15 |
| N9 | Découpage en lots L13, L14, L15, L16 | **Validée** (Clément, 16/10/2026) | INDEX |
| D1 | HT / TVA | **Ouverte** — présentation §5, prérequis du GO | L0, GO |

Décisions déjà validées et reportées dans les fiches : P1 à P13 du 16/10/2026 (voir « Décisions (tranchées) » de chaque fiche).

## 2. N3 — Protéger les clients Lifetime et identifier les autres clients BUSINESS

**Constat :** une licence Lifetime porte `licensePlan = BUSINESS` et `billingMode = lifetime` (`lib/billing/lifetime.ts`). Une licence peut aussi
être tracée dans `lifetime_license_allocations` (utilisée par `hasLifetimeLicense`). Le crédit SMS mensuel sélectionne les entreprises
**uniquement par `licensePlan`** (`app/api/cron/reminders/route.ts`, `ensureMonthlySmsGrant`). Ajouter `BUSINESS: 50` sans garde
créditerait donc 50 SMS par mois aux clients Lifetime, alors que l'offre Lifetime promet « 20 SMS de bienvenue » puis des SMS payants.

**Protection proposée (L15, à valider) :** exclure du crédit mensuel toute entreprise `billingMode = lifetime` **ou** ayant une allocation
Lifetime active. Mêmes règles pour l'affichage du quota dans admin › Paramètres. Aucun autre changement pour les clients Lifetime
(droits, commission 0 %, bonus de bienvenue).

**Point d'attention :** les entreprises PRO attribuées à la main (`billingMode free`) reçoivent **aujourd'hui** leurs 20 SMS. La règle des
BUSINESS manuels (N3b) doit donc être choisie explicitement, sans modifier le comportement actuel des PRO.

**Identification (requêtes en LECTURE SEULE, lancées par toi sur Neon ; l'agent n'y a pas accès) :**

```sql
-- 1. Répartition générale
SELECT "licensePlan", "billingMode", "subscriptionStatus", count(*)
FROM companies GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- 2. Entreprises BUSINESS hors Lifetime (bêta, partenaires, attributions manuelles)
SELECT id, name, status, "billingMode", "subscriptionStatus",
       ("subscriptionPriceId" IS NOT NULL) AS a_un_price, "licenseGeneration", "licenseAssignedAt", "createdAt"
FROM companies
WHERE "licensePlan" = 'BUSINESS' AND "billingMode" <> 'lifetime'
ORDER BY id;

-- 3. Cohérence Lifetime : allocations actives vs billingMode
SELECT a."companyId", a.status, c."billingMode", c."licensePlan"
FROM lifetime_license_allocations a LEFT JOIN companies c ON c.id = a."companyId"
ORDER BY a."companyId";

-- 4. État SMS actuel des entreprises BUSINESS
SELECT c.id, c."billingMode", s.balance, s."monthlyGrantKey", s."betaBonusGrantedAt"
FROM companies c LEFT JOIN sms_credits s ON s."companyId" = c.id
WHERE c."licensePlan" = 'BUSINESS' ORDER BY c.id;
```

**À décider après lecture des résultats :**

- [ ] N3a : Lifetime exclu du crédit mensuel (proposé).
- [ ] N3b : entreprises BUSINESS manuelles : incluses, exclues, ou au cas par cas (liste nominative).
- [ ] Toute incohérence relevée par la requête 3 (allocation active sans `billingMode lifetime`, ou l'inverse) : à traiter **avant** L15, sans correction automatique.

## 3. N4 — Complément de SMS lors d'un upgrade en cours de mois

**Constat :** `grantMonthlyIncludedSms` crédite une fois par mois civil (`monthlyGrantKey` = AAAA-MM, fuseau du tenant) par un
`UPDATE … WHERE "monthlyGrantKey" IS DISTINCT FROM <mois>` atomique, puis `grantMonthlyAndAllocate` transfère le delta vers le
sous-compte AllMySMS. **Le montant déjà crédité dans le mois n'est pas mémorisé** : `monthlyGrantedTotal` est un cumul toutes périodes.

| Variante | Fonctionnement | Avantages | Limites |
| --- | --- | --- | --- |
| **N4-A** Aucun complément | Le client upgradé reçoit 50 SMS au mois suivant ; le mois en cours garde les 20 déjà crédités | Aucun code, aucune migration, zéro risque de double crédit | Le client attend jusqu'au mois suivant |
| **N4-B** Complément différé | Au prochain passage du cron (quotidien) ou à l'ouverture des paramètres SMS : complément = quota du plan − déjà crédité ce mois | Pas de couplage avec le webhook Stripe ; idempotent ; réutilise le transfert AllMySMS existant | Migration additive : colonne `sms_credits."monthlyGrantedForKey"` (entier, **NULL = inconnu = pas de complément**) ; délai jusqu'à 24 h |
| **N4-C** Complément immédiat dans le webhook | Crédit déclenché par `customer.subscription.updated` | Instantané | Ajoute un effet de bord dans un chemin CRITIQUE (Stripe), plus de cas de rejeu : **déconseillé** |

**Règles communes si N4-B ou N4-C :**

- complément = `max(0, quota(nouveau plan) − déjà crédité pour le mois)`, jamais négatif ;
- jamais de complément sur un downgrade, jamais de reprise de solde ;
- au plus le quota du plan le plus élevé atteint dans le mois ;
- Lifetime et exclusions N3 respectées ;
- lignes existantes : `monthlyGrantedForKey` reste NULL jusqu'au prochain crédit mensuel → **aucun complément le mois de la migration**
  (évite de recréditer les 20 SMS déjà versés).

**Tests anti-double crédit (obligatoires si complément) :**

1. Upgrade après le crédit de 20 du mois → +30 une seule fois ; solde final = solde initial + 30.
2. Upgrade avant le crédit du mois → un seul crédit de 50 (aucun 20 + 50).
3. Deux passes du cron le même jour → un seul complément.
4. Cron et ouverture des paramètres simultanés (deux transactions concurrentes) → un seul complément (BDD).
5. Upgrade, downgrade programmé, puis nouvel upgrade dans le même mois → aucun crédit supplémentaire au-delà de 50.
6. Downgrade → aucun crédit, aucune reprise.
7. Passage de mois dans le fuseau du tenant (23 h 30 UTC un 31) → crédit du nouveau mois correct.
8. Ligne historique (`monthlyGrantedForKey` NULL) → aucun complément ce mois-ci, crédit normal le mois suivant.
9. Lifetime et entreprises exclues (N3) → aucun complément.
10. Transfert AllMySMS : delta transféré = complément exact, une seule fois (fournisseur simulé, aucun SMS réel).
11. Isolation : le complément du tenant A ne modifie jamais le solde du tenant B.

- [ ] N4 : variante retenue (A, B ou C) ; si B ou C, migration additive acceptée (exécutée par toi uniquement).

## 4. N6 — Remises de fidélité et proratas Stripe (étude, aucune suppression décidée)

**Fonctionnement actuel de la fidélité :** remise appliquée **au niveau de chaque facture** (coupon `LOYALTY_*` ajouté à la facture brouillon
par le webhook `invoice.created`), et non au niveau de l'abonnement. Palier calculé depuis `continuousSubscriptionStartedAt`.

**Faits documentés par Stripe :**

1. Les factures de renouvellement restent en brouillon environ une heure ; les factures créées lors d'un changement de formule
   (`always_invoice`) sont générées immédiatement, avec `auto_advance` désactivé dès le départ (paiement automatique : finalisation immédiate).
2. Les lignes de prorata sont `discountable=false` : une remise de niveau facture ne s'y applique pas.
3. Les proratas sont calculés à partir du prix **remisé de l'abonnement**. Or l'abonnement DetailFlow ne porte aucune remise :
   le débit Performance au prorata est donc calculé au prix plein.
4. En `billing_mode=flexible` (défaut des abonnements créés avec une version d'API récente, probablement le cas avec le SDK 22),
   le crédit pour le temps non utilisé est basé sur le **montant réellement débité** ; en `classic`, sur le prix actuel et les dernières remises utilisées.

**Conséquences probables (à confirmer en mode test) :**

- **Technique (B1) :** facture de prorata déjà finalisée → `handleInvoiceCreated` lève `INVOICE_NOT_DRAFT` (500) pour tout client ayant un palier
  → Stripe renvoie l'événement pendant plusieurs jours. Sans correction, le webhook resterait en erreur. **À corriger quelle que soit l'option.**
- **Commercial :** pour un client fidèle (≥ 6 mois), la partie Performance du prorata est facturée sans la remise de fidélité ; la remise
  s'applique de nouveau dès le renouvellement suivant, sur 34,90 €. Le crédit Indépendant reflète probablement le montant réellement payé (flexible).

**Options (aucune n'est décidée) :**

| Option | Principe | Fidélité sur le prorata | Complexité / risque |
| --- | --- | --- | --- |
| **O1** | Le webhook ignore la fidélité pour `billing_reason = subscription_update` (journalisé) | Non appliquée sur le prorata uniquement | Faible ; corrige B1 |
| **O2** | O1 + compensation : un crédit égal au % du palier sur le débit net du prorata, ajouté à la facture de renouvellement suivante (idempotent par facture de prorata) | Préservée intégralement | Moyenne ; nouvel objet Stripe écrit par le webhook (CRITIQUE) |
| **O3** | Déplacer la fidélité au niveau de l'abonnement (coupon d'abonnement changé à chaque palier) | Appliquée nativement par Stripe | Élevée ; refonte de L7 (interdit sans audit L7) : **déconseillé maintenant** |
| **O4** | `proration_behavior = create_prorations` (prorata ajouté au renouvellement suivant) | Non (lignes non remisables) ; évite B1 | Contredit P3 (« immédiat avec prorata ») ; risque d'upgrade non payé en cas de résiliation |

**Protocole de test en mode test Stripe (par toi, avant toute décision) :**

1. Créer une horloge de test (Test clock) et un client de test ; souscrire Indépendant via le parcours DetailFlow (environnement de préproduction).
2. Avancer l'horloge de 6 mois et 1 jour : vérifier le coupon 5 % sur le renouvellement et la réponse 200 du webhook.
3. Relever `subscription.billing_mode.type` (`flexible` ou `classic`).
4. Au milieu d'une période, upgrade vers Performance par le portail configuré (L14).
5. Relever pour la facture de prorata : `status` à la réception de `invoice.created`, `billing_reason`, lignes (`proration`, montants, `discount_amounts`),
   montant total, et la réponse du webhook (200 / 500, journal).
6. Avancer jusqu'au renouvellement suivant : vérifier le coupon sur 34,90 €, un seul coupon.
7. Refaire 1 à 6 avec un client sans palier (contrôle) et, si des abonnements `classic` existent en production, avec un abonnement `classic`.
8. Noter les résultats dans la fiche L14, section « Décisions à confirmer ».

- [ ] N6 : option retenue après le protocole (O1, O2, O3 ou O4).

## 5. D1 — HT / TVA : configuration à valider avant commercialisation

**Constat (code) :**

- Site : « Prix indiqués hors taxes » (`PRICING_COPY.note`) ; Lifetime « 1 290 € HT ».
- Stripe Billing : Prices de 1 990 / 3 490 / 5 990 centimes, **aucune TVA appliquée** (ni Stripe Tax, ni Tax Rate, ni `tax_behavior` ;
  le script de configuration indique « NI TVA » ; Lifetime : « Aucune TVA »). Le montant prélevé est donc exactement le montant affiché.
- La mention « TVA non applicable, art. 293 B du CGI » existe dans DetailFlow **pour les factures des tenants**, pas pour les abonnements DetailFlow.

**Ce qui doit être validé (avec ton expert-comptable ; ceci n'est pas un conseil fiscal) :**

| Configuration | Si DetailFlow est… | Affichage | Stripe | Montant payé par les clients |
| --- | --- | --- | --- | --- |
| **D1-A** | en franchise en base de TVA | « TVA non applicable, art. 293 B du CGI » au lieu de « hors taxes » | Mention ajoutée au pied des factures Stripe ; surveillance des seuils de la franchise | Inchangé (19,90 / 34,90 / 59,90) |
| **D1-B** | assujetti, prix maintenus HT | « HT » conservé, TTC affiché à côté | TVA 20 % ajoutée (Tax Rate exclusive ou Stripe Tax), collecte du n° de TVA des clients, autoliquidation intracommunautaire | 23,88 / 41,88 / 71,88 TTC — **hausse pour les abonnés existants : nécessite ta décision et une information préalable** |
| **D1-C** | assujetti, montants actuels considérés TTC | « TTC » au lieu de « hors taxes » | Tax Rate inclusive : TVA visible sur les factures | Inchangé ; revenu net DetailFlow 16,58 / 29,08 / 49,92 HT |

Lifetime suit la même règle (D1-B : 1 548 € TTC ; D1-C : 1 075 € HT). Les commissions Connect et les packs SMS (« TTC » dans `lib/sms/config.ts`)
sont à vérifier dans la même décision.

- [ ] D1 : configuration retenue (A, B ou C) et date d'application ; aucune modification des abonnements existants sans décision explicite.

## 6. Liste courte des décisions nécessitant ton accord

1. **Autoriser L13** (affichage), après avoir tranché dans la fiche N1, N7 et les 2 points d'affichage.
2. **N3** : lancer les 4 requêtes en lecture seule, puis trancher N3a et N3b.
3. **N4** : variante A, B ou C (et migration si B ou C).
4. **N6** : exécuter le protocole en mode test, puis choisir O1 à O4 (B1 doit être corrigé dans tous les cas).
5. **N5** : `continue_trial` oui / non.
6. **N2, N8** : libellé SMS et SMS pendant l'essai.
7. **D1** : A, B ou C, avec ton expert-comptable, avant le GO.
8. **Autoriser L14** (SEC-1), indépendamment de L13.

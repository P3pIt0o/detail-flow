# L87 — Facturation : Factur-X raccordé aux vraies factures (reprise de L8 sur le main actuel)

Risque : critique. Lot délégué par Clément (27/11 : « terminer DetailFlow, la facturation »). Fiche de référence : `docs/lots/L8-facturx.md` (constat du 16/10).

## Contexte
Le travail Factur-X est dans 6 branches `feat/facturx-*` (la plus avancée : `feat/facturx-integration-c4`, 13/10), toutes sur l'**ancien historique**
de main (réécrit le 24/11) : **ne jamais fusionner ces branches**. On reporte le code utile sur main à jour.

## À faire
1. Audit court (dans le plan) : ce que c4 contient vs les autres branches, base, dépendances (`@stafyniaksacha/facturx`, `pdf-lib`), et ce qui a changé
   dans `lib/invoice/` sur main depuis le 13/10. Un seul modèle de facture (décision du 11/10), droits logo par formule conservés.
2. Reporter sur main les fichiers de c4 (`lib/invoice/facturx/*`, `facturx-*.ts`, `public/facturx-assets/`, tests `tests/facturx-*.test.ts`),
   adaptés au code actuel, sans dupliquer `calc.ts` / `tax-treatment.ts`.
3. Factures et avoirs : PDF/A-3b + XML EN16931 embarqué ; vérification d'éligibilité avant génération (codes d'inéligibilité de c4) ; si non
   éligible, **PDF classique + message clair au pro** (ce qui manque + où le compléter : SIREN, TVA, adresse…) ; aucune donnée légale inventée.
4. Activation progressive inchangée : `FACTURX_INVOICES_ENABLED` + `FACTURX_PILOT_COMPANY_IDS` (documentés dans `.env.example`, désactivé par défaut).
5. Tenants : génération et téléchargement d'une facture filtrés par `companyId` (test tenant B ≠ tenant A).
6. Hors périmètre (à signaler dans le rapport, ne pas coder) : transmission via une plateforme agréée (réforme de la facturation électronique) — choix du
   prestataire = décision de Clément.

## Réussite
Tests facturx verts (XML conforme au schéma, montants = facture, avoirs liés à la facture d'origine, repli PDF), aucune régression `tests/invoice-*`.
Aperçu : `.lot-state/L87.apercu.html` (facture PDF + message « facture électronique impossible : il manque… »).

## Décision (28/11/2026, 13 h 20 — Clément : « je te fais confiance, fais les meilleurs choix »)
- **`pdf-lib` est accepté**, en version figée `1.17.1`, pour produire le PDF/A-3 et y joindre le XML. Le script d'Apollon l'ajoute à `package.json`
  et au lockfile sur la branche du lot avant ta passe. Ne l'ajoute pas toi-même.
- **`@stafyniaksacha/facturx` est refusé** : paquet peu suivi, inadapté à des factures. Le XML CII (profil EN 16931) est écrit dans le code
  (`lib/invoice/`), avec un test de validation (structure et règles principales). Ne pas redemander.

# Lots de développement DetailFlow

Un lot = une branche `lot/<id>-<slug>` = une commande `/lot <id>` dans Claude Code.
**Ordre, dépendances, conflits et priorités : voir `INDEX.md`.** Préparation avant tout lot : `P0-preparation.md`.

Fiches : `L0` grille tarifaire (décision, sans code) · `L1` commissions · `L2` SMS inclus · `L3` facturation annuelle ·
`L4` landing/FAQ · `L5` import clients · `L6` liste d'attente · `L7` fidélité · `L8` Factur-X · `L9` réservations/widgets ·
`L10` SEO tenants · `L11` sites personnalisés/admin · `L12` préparation commerciale · `L13`–`L16` commercialisation de Performance (PERF-1a, SEC-1, PERF-1b, PERF-1c ;
décisions dans `PERF-decisions.md`) · `L98` CI sur PR · `L99` pilote README.

## Règles des fiches
- **Aucune décision commerciale, fiscale ou d'accès n'est inventée.** Tout ce que tu n'as pas dit explicitement est dans
  « Décisions à confirmer » avec `[ ]` (`BLOQUANT — VALIDATION HUMAINE`). Claude refuse de planifier tant qu'une décision
  nécessaire reste ouverte (`lot.mjs plan-ready` bloque un plan qui contient `[ ]` dans ses décisions).
- Pour trancher : remplace `[ ]` par `[x]` et écris la valeur. Exemple : `- [x] SMS inclus Performance : 50`.
- Les constats datent du 16/10/2026 (`main` @ c7c997d) : chaque `/lot` les revérifie pendant l'audit.
- « Tests de non-régression » = tests EXISTANTS du dépôt qui doivent rester verts et non affaiblis.
- Les tests marqués (BDD) sont **ignorés** chez les agents (jamais « réussis ») et se lancent par toi :
  `node .claude/hooks/dfguard.mjs test-db <fichier>`.

## Modèle de fiche

```markdown
# L<n> — Titre

## Objectif
Ce qui change pour le pro, en une phrase.

## Dépendances
Lots à terminer avant.

## Constat dans le code (date, commit)
Chemins, fonctions et tests réels.

## Décisions (tranchées)
- [x] … (source : qui l'a décidé, quand)

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] …

## Périmètre
Fichiers concernés. Hors périmètre.

## Critères d'acceptation
- [ ] vérifiable par un test nommé ou une manipulation précise (dont tests négatifs tenant A/B)

## Tests à ajouter
- …

## Tests de non-régression (existants)
- `tests/…`
```

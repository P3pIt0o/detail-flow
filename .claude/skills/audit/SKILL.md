---
name: audit
description: Audit en LECTURE SEULE d'un lot DetailFlow (constats, écarts, questions bloquantes), sans plan d'implémentation ni code. À utiliser quand l'utilisateur tape /audit <id>.
argument-hint: <id du lot, ex. L8>
disable-model-invocation: true
---

Tu fais l'audit du lot **$ARGUMENTS** en lecture seule. Tu n'écris AUCUN code et tu ne demandes aucune approbation.
Le seul fichier que tu rédiges est `.lot-state/$ARGUMENTS.notes.md` (la garde refuse tout le reste).

1. `node .claude/hooks/lot.mjs status $ARGUMENTS`.
   - Aucun état : `git status` propre, `git switch main`, `git switch -c lot/$ARGUMENTS-<slug>` (slug = nom de la fiche), puis
     `node .claude/hooks/lot.mjs start $ARGUMENTS`.
   - État existant en phase AUDIT : reprends en relisant `.lot-state/$ARGUMENTS.notes.md` s'il existe.
   - Autre phase : arrête-toi, l'audit est déjà dépassé ; propose `/lot $ARGUMENTS`.
2. Lis la fiche `docs/lots/$ARGUMENTS-*.md`. Revérifie CHAQUE constat qu'elle contient (chemins, fonctions, tests, valeurs) avec des
   recherches ciblées. Pour une branche non fusionnée citée, lis-la sans la modifier : `git show <branche>:<fichier>`,
   `git ls-tree -r --name-only <branche>`, `git log --oneline -5 <branche>` (si la branche n'est pas présente localement, dis-le :
   tu ne peux pas faire de fetch, c'est le développeur qui la récupère).
3. Rédige `.lot-state/$ARGUMENTS.notes.md` :
   `## Constats confirmés` (avec preuve fichier:ligne) · `## Constats périmés ou faux dans la fiche` · `## Écarts entre le code et les règles confirmées` ·
   `## Risques` (tenants, argent, données légales, migrations) · `## Tests existants pertinents` (et ce qu'ils ne couvrent pas) ·
   `## Questions BLOQUANT — VALIDATION HUMAINE` (numérotées, une décision par question, sans proposer de valeur commerciale) ·
   `## Fichiers probablement concernés` · `## Risque estimé` (faible / moyen / critique, recalculé d'après les chemins).
4. Termine par un résumé de 15 lignes maximum et la prochaine action exacte (répondre aux questions dans la fiche, puis `/lot $ARGUMENTS`).

Règles : aucune décision commerciale, fiscale ou d'accès ; ne présente jamais l'absence d'alerte d'un contrôle automatique comme une
preuve d'absence de faille ; pas de sous-agent pour un audit (économie de quota) sauf demande explicite du développeur.

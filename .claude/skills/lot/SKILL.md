---
name: lot
description: Traite un lot de développement DetailFlow avec reprise automatique (audit, plan, approbation humaine, implémentation, revues proportionnées au risque, vérification). À utiliser quand l'utilisateur tape /lot <id>.
argument-hint: <id du lot, ex. L1>
disable-model-invocation: true
---

Tu pilotes le lot **$ARGUMENTS**. L'état fait foi : `node .claude/hooks/lot.mjs` (abrégé `lot`) le tient dans
`.lot-state/`. Tu ne modifies jamais ce dossier toi-même, sauf le plan `.lot-state/$ARGUMENTS.plan.md`.
La garde (« [Garde DetailFlow] ») bloque techniquement les actions interdites : si elle refuse, n'essaie aucune
variante, explique le blocage en une phrase et attends le développeur.

## 0. Toujours commencer par l'état (reprise)
Lance `node .claude/hooks/lot.mjs status $ARGUMENTS` et reprends EXACTEMENT à la « Prochaine action » indiquée.
Ne refais jamais une étape déjà enregistrée. S'il signale des modifications non committées, résume-les
au développeur (fichiers + intention) et demande : committer ou les jeter (c'est lui qui jette).

## 1. Démarrage (aucun état)
1. `git status` doit être propre, sinon demande quoi faire.
2. `git switch main` puis `git switch -c lot/$ARGUMENTS-<slug>` (slug = nom du fichier de la fiche, ex. `lot/L1-commissions`).
3. `lot start $ARGUMENTS` puis `lot baseline $ARGUMENTS` (mémorise les tests déjà en échec).

## 2. Audit et plan (lecture seule imposée par la garde)
- Si `.lot-state/$ARGUMENTS.notes.md` existe (fait par `/audit`), pars de ses constats et de ses réponses ; sinon revérifie
  toi-même les constats de la fiche (ils peuvent être périmés).
- Lis la fiche `docs/lots/$ARGUMENTS-*.md` et seulement le code utile (Grep ciblé sur les symboles cités, pas de lecture de dossiers entiers).
- Si la fiche a des « Décisions à confirmer » non cochées, ou si le code contredit la fiche : ARRÊTE-TOI et pose les questions
  (liste courte). N'invente aucune décision commerciale.
- Écris `.lot-state/$ARGUMENTS.plan.md` avec exactement ces sections :
  `## Objectif` · `## Décisions` (reprises de la fiche, toutes tranchées) · `## Fichiers` (un `` `chemin` `` par ligne,
  globs autorisés pour les nouveaux tests, ex. `` `tests/l1-*.test.ts` ``) · `## Tests` (nouveaux tests + tests existants de
  non-régression cités par la fiche) · `## Risque : faible|moyen|critique` (+ justification) · `## Migrations et variables d'env` ·
  `## Hors périmètre`.
- `lot plan-ready $ARGUMENTS`. Puis **STOP** : présente le plan en 15 lignes max et termine ton tour avec :
  « Approuve dans ton terminal : `node .claude/hooks/dfguard.mjs approve $ARGUMENTS` puis relance `/lot $ARGUMENTS`. »
  Tu ne peux PAS approuver toi-même ; n'écris aucun code avant.

## 3. Implémentation (après approbation)
1. `lot begin $ARGUMENTS`. S'il refuse, dis pourquoi et arrête.
2. Tests d'abord (ils doivent échouer sans le code), puis le code. Seuls les fichiers du plan sont modifiables ;
   s'il en faut un autre, arrête-toi : le plan doit être modifié et ré-approuvé.
3. Commits locaux fréquents : `git add <fichiers>` + `git commit -m "lot $ARGUMENTS: …"` (protège contre une coupure de quota).
4. Pendant le travail : `lot verify $ARGUMENTS --quick` (tests liés seulement). À la fin : `lot verify $ARGUMENTS` (complet).
   Corrige jusqu'à `RÉSULTAT : OK`. Après 3 échecs complets d'affilée, l'outil bloque : fais un point au développeur.

## 4. Revues proportionnées au risque (économie de quota)
1. `lot pack $ARGUMENTS` : il écrit `.lot-state/$ARGUMENTS.review.md` et liste les relecteurs requis.
   faible = aucun · moyen = revue-metier + revue-securite · critique = les deux, puis verificateur.
2. Lance UNIQUEMENT les relecteurs listés « À lancer », en parallèle, avec ce seul prompt :
   « Lot $ARGUMENTS. Dossier : .lot-state/$ARGUMENTS.review.md. » (pas ton raisonnement, pas de résumé).
   Pour un lot critique, lance `verificateur` après les deux revues, en lui donnant la liste de leurs points.
3. Après chaque retour : `lot review $ARGUMENTS <agent> <OK|A_CORRIGER> <nb BLOQUANT> <nb MAJEUR>`.

## 5. Corrections (boucles limitées)
- Tout OK → étape 6.
- Sinon `lot fix $ARGUMENTS` (refusé au-delà de 2 boucles), corrige tous les BLOQUANT et MAJEUR (un test par bug),
  traite ou justifie les MINEUR, committe, `lot verify $ARGUMENTS`.
- Si un relecteur avait un BLOQUANT : `lot pack $ARGUMENTS --delta` et relance UNIQUEMENT ce relecteur (une seule fois).
- Point contesté : explique pourquoi avec une preuve dans le code, ne le « corrige » pas pour faire plaisir.

## 6. Clôture et rapport (format obligatoire)
`lot done $ARGUMENTS`, puis rapport en français, court, dans cet ordre :
1. État initial observé et preuves (commit de base, chemins, baseline des tests).
2. Décisions confirmées utilisées / questions restées bloquantes.
3. Diff limité : liste des fichiers modifiés (`git diff --stat` depuis la base) et commits (`git log --oneline`).
4. Risques identifiés et tests négatifs ajoutés (tenant A/B, Stripe simulé, webhook rejoué…).
5. Résultats : tests réussis / échoués / **ignorés** (les tests BDD ignorés ne sont jamais « réussis ») ; échecs déjà présents dans la baseline.
6. Relectures indépendantes et corrections, avec le HEAD auquel chaque verdict a été rendu. Les contrôles automatiques de `verify`
   ne prouvent pas l'absence de faille : dis-le si aucune revue IA n'a eu lieu (risque faible).
7. Migrations SQL et variables d'environnement **à appliquer à la main** (Preview d'abord) ; tests BDD à lancer par le développeur :
   `node .claude/hooks/dfguard.mjs test-db <fichiers>`.
8. Procédure de test Preview en 3 à 5 étapes, plan de retour arrière, rappel : validation humaine avant push/merge/déploiement
   (relecture ligne à ligne obligatoire si risque critique).
9. Prochaine action exacte pour reprendre ou clore le lot.

## Économie de tokens
Ne recopie pas de longues sorties : cite les lignes utiles. Ne relis pas un fichier déjà lu sans changement.
Ne relance jamais un relecteur que `pack` indique « déjà relu à ce HEAD ».

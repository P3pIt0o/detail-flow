# L98 — Vérifications CI sur les PR (Phase 0, CRITIQUE car `.github/` est classé critique)

## Objectif
Chaque PR lance automatiquement typecheck, tests et build, sans aucun déploiement ni accès à la production.

## Constat (16/10/2026, `main` @ c7c997d)
- Aucun dossier `.github/` : aucune CI. Vercel construit les previews.
- `pnpm lint` échoue (ESLint absent des dépendances) ; `pnpm test` = `vitest run` ; typecheck = `pnpm exec tsc --noEmit`.
- Les tests BDD se mettent en `skip` sans `DATABASE_URL` : la CI ne doit **pas** recevoir de base de production.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Lint : ajouter ESLint au projet (nouvelle dépendance) ou l'exclure de la CI pour l'instant : ____
- [ ] `next build` en CI : variables factices non secrètes acceptables, ou build laissé à Vercel : ____
- [ ] Base de test en CI : aucune (tests BDD ignorés et signalés comme tels) ou base éphémère dédiée (ex. service Postgres de la CI) : ____
- [ ] Protection de branche `main` (PR obligatoire, CI verte) : réglage GitHub fait par toi : ____

## Critères d'acceptation
- [ ] Workflow déclenché sur `pull_request` uniquement, permissions `contents: read`, aucun secret de production, aucun déploiement.
- [ ] Le résumé CI distingue tests réussis / échoués / **ignorés**.
- [ ] Actions tierces épinglées par version.

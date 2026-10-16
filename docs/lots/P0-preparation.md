# Phase 0 — Préparation et validation de l'installation (avant tout lot)

Étapes faites **par toi** sur ton PC Linux (commandes du README du kit). Coche au fur et à mesure.

- [ ] Clone propre de `github.com/P3pIt0o/detail-flow`, `git switch main`, `git status` vide.
- [ ] Prérequis : Node ≥ 20, pnpm, `sudo apt-get install -y bubblewrap socat`, Claude Code ≥ 2.1.295.
- [ ] `bash install.sh --check <dépôt>` : succès, `git status` toujours vide (rien écrit).
- [ ] `bash install.sh <dépôt>` sur la branche `chore/claude-code-kit-v2`, relecture du diff, commit, PR et merge **par toi**.
- [ ] `node .claude/hooks/dfguard.mjs init --prod-host <hôte prod> --dev-host <hôte dev>` puis `doctor` sans KO.
- [ ] Tests du kit : `node <kit>/tests/kit-tests.mjs <dépôt>` → tout réussi.
- [ ] Aucune URL de production ni clé `sk_live_` dans les `.env*` du poste (`doctor` le vérifie) ; aucune variable secrète exportée dans ton shell.
- [ ] `pnpm install` puis baseline du dépôt : `pnpm test` → noter réussis / échoués / **ignorés** (les tests BDD ignorés ne sont pas « réussis »).
- [ ] Tests BDD sur Neon DEV : `node .claude/hooks/dfguard.mjs test-db` → noter le résultat séparément.
- [ ] Lot pilote **L99** (README) de bout en bout avec `/lot L99`.
- [ ] Lot **L98** (CI sur PR) après tes décisions, ou décision écrite de le reporter.

Résultat attendu : le cycle complet a été observé une fois sur un lot sans risque avant tout lot critique.

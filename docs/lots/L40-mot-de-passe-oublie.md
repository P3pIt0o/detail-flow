# L40 — Mot de passe oublié (libre-service)

Risque : MOYEN (authentification, aucune migration). Branche partie de `main`. Issu de l'audit de lancement (LAN-2).

## Constat
Aucun `sendResetPassword` dans `lib/auth.ts`, aucun lien dans `components/admin/admin-auth-form.tsx` : un pro qui oublie son
mot de passe dépend de Clément.

## Décisions (Clément, 08/11/2026)
- [x] Better Auth : activer la réinitialisation (`emailAndPassword.sendResetPassword`), lien valable **1 heure**, à usage unique
      (comportement natif Better Auth ; ne rien réimplémenter).
- [x] Pages : `/admin/mot-de-passe-oublie` (champ email) et `/admin/reinitialiser` (nouveau mot de passe + confirmation, mêmes
      règles de longueur que l'inscription). Lien « Mot de passe oublié ? » sous le champ mot de passe de la connexion.
- [x] **Réponse identique** que l'email existe ou non : « Si un compte existe pour cette adresse, vous allez recevoir un email. »
      (pas d'énumération de comptes). Limitation de fréquence : celle de Better Auth si disponible, sinon le limiteur existant.
- [x] Email via Resend, nouveau modèle `resetPasswordEmail` dans `lib/email/templates.ts`, même style que l'email de
      vérification. Objet : « Réinitialisez votre mot de passe DetailFlow ». Corps : 2 phrases + bouton « Choisir un nouveau
      mot de passe » + « Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. »
- [x] Après réinitialisation : toutes les autres sessions de l'utilisateur sont révoquées (option Better Auth), redirection vers
      la connexion avec le message « Mot de passe modifié, vous pouvez vous connecter. »
- [x] Vouvoiement, textes en français. Aucune clé ou URL en dur (URL de base via la config existante).

## Critères d'acceptation
- [ ] C1 Demande pour un email existant → email envoyé (Resend simulé) ; pour un email inconnu → même message, aucun envoi (tests).
- [ ] C2 Jeton expiré ou déjà utilisé → message d'erreur clair, lien pour refaire une demande (tests).
- [ ] C3 Sessions précédentes révoquées après changement (test).
- [ ] C4 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant.

## Aperçu : les 2 pages + le lien sur l'écran de connexion + l'email.
## À tester par Clément sur la Preview : faire le parcours avec une adresse à lui (base de dev).

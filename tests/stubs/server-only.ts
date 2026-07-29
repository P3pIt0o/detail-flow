// Stub no-op de `server-only` pour l'environnement de test Node (vitest).
// En production, le vrai paquet empêche l'import côté client ; dans les tests
// d'intégration on exécute ce code serveur directement.
export {}

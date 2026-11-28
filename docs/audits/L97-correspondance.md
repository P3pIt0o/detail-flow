# L97 — Correspondance ancien onglet → nouvel emplacement

Les adresses `/admin/parametres?tab=…` sont conservées : un ancien lien ouvre toujours le même réglage.
Seule exception : l'acompte (voir en bas).

| Adresse | Ancien emplacement | Nouvel emplacement |
| --- | --- | --- |
| `?tab=business` | Entreprise › Coordonnées | Mon entreprise › Coordonnées |
| `?tab=travel` | Réservations › Lieu | Mon entreprise › Lieu |
| `?tab=hours` | Réservations › Horaires | Mes disponibilités › Horaires |
| `?tab=timeoff` | Réservations › Congés | Mes disponibilités › Congés |
| `?tab=planning` | Réservations › Planning & acompte | Mes disponibilités › Créneaux (créneaux et mode vacances) |
| `?tab=site` | Site public › Contenu du site | Ma page de réservation › Contenu du site (« Textes du site » pour Spirit ACS) |
| `?tab=appearance` | Site public › Apparence | Ma page de réservation › Apparence |
| `?tab=gallery` | Site public › Galerie | Ma page de réservation › Galerie |
| `?tab=reviews` | Site public › Avis | Ma page de réservation › Avis |
| `?tab=custom-requests` | Site public › Demandes spéciales | Ma page de réservation › Demandes spéciales |
| `?tab=digital-card` | Site public › Carte digitale (L86) | Ma page de réservation › Carte digitale |
| `?tab=deposit` | Réservations › Planning & acompte (bloc acompte) | Paiements et factures › Acompte |
| `?tab=payments` | Paiements et facturation › Paiements | Paiements et factures › Paiements |
| `?tab=invoicing` | Paiements et facturation › Facturation | Paiements et factures › Facturation |
| `?tab=promo` | Paiements et facturation › Codes promo | Paiements et factures › Codes promo |
| `?tab=sms` | Communications › Rappels SMS | Messages aux clients › Rappels SMS |
| `?tab=notifications` | Communications › Rappels & avis | Messages aux clients › Rappels & avis |
| `?tab=security` | Compte et assistance › Sécurité | Mon compte › Sécurité |
| `?tab=data` | Compte et assistance › Mes données | Mon compte › Mes données |
| `?tab=support` | Compte et assistance › Support | Mon compte › Assistance |

Écrans hors Paramètres, ajoutés à l'accueil comme liens : « Mes prestations et prix » (`/admin/prestations`,
gabarits de véhicules compris) et « Abonnement » (`/admin/abonnement`).

## Redirection

`?tab=planning&bloc=reglage-acompte` → `?tab=deposit&bloc=reglage-acompte` (`tenant` conservé).

## Réglages repliés sous « Plus d'options »

- Acompte : instructions de paiement.
- Créneaux : pas des horaires proposés.
- Facturation : mentions sur la facture, e-mail accompagnant la facture.
- Rappels SMS : message envoyé.

## Tenants

Spirit ACS : disponibilités, lieu, acompte, paiements, codes promo, apparence et demandes spéciales restent masqués.
`booking_only` : « Ma page de réservation » ne garde que les demandes spéciales et la carte digitale (plus le lien et le QR code).

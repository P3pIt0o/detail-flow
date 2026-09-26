import { legalConfig } from "@/config/legal"
import { PageHeader } from "@/components/layout/page-header"
import { LegalContent } from "@/components/layout/legal-content"

/**
 * POLITIQUE COOKIES — DetailFlow.
 *
 * Basée sur un audit réel du projet : seuls des cookies strictement nécessaires
 * (session d'authentification), une mesure d'audience SANS cookie et un
 * stockage technique local anonyme sont utilisés. Aucun traceur publicitaire,
 * aucun outil de suivi tiers (Google Analytics, Meta Pixel, GTM, Hotjar…) →
 * AUCUN bandeau de consentement n'est requis ni affiché.
 */

type Tracker = {
  name: string
  provider: string
  purpose: string
  category: string
  duration: string
  necessary: string
}

const NECESSARY_COOKIES: Tracker[] = [
  {
    name: "Cookie de session",
    provider: "DetailFlow (Better Auth)",
    purpose: "Maintenir la connexion d'un professionnel à son espace",
    category: "Strictement nécessaire",
    duration: "Jusqu'à 7 jours",
    necessary: "Oui",
  },
]

const LOCAL_STORAGE: Tracker[] = [
  {
    name: "Identifiant de visite anonyme",
    provider: "DetailFlow",
    purpose: "Distinguer les visites pour des statistiques agrégées, sans identifier la personne",
    category: "Mesure d'audience (stockage local)",
    duration: "Persistant jusqu'à effacement",
    necessary: "Non essentiel",
  },
  {
    name: "Brouillon de réservation",
    provider: "DetailFlow",
    purpose: "Conserver temporairement une réservation en cours de saisie",
    category: "Confort (stockage local)",
    duration: "Temporaire",
    necessary: "Non essentiel",
  },
]

function TrackerTable({ rows }: { rows: Tracker[] }) {
  return (
    <div className="not-prose my-4 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 font-semibold">Nom</th>
            <th className="py-2 pr-4 font-semibold">Fournisseur</th>
            <th className="py-2 pr-4 font-semibold">Finalité</th>
            <th className="py-2 pr-4 font-semibold">Catégorie</th>
            <th className="py-2 pr-4 font-semibold">Durée</th>
            <th className="py-2 font-semibold">Nécessaire</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-border/60 align-top">
              <td className="py-2 pr-4 font-medium text-foreground">{r.name}</td>
              <td className="py-2 pr-4 text-muted-foreground">{r.provider}</td>
              <td className="py-2 pr-4 text-muted-foreground">{r.purpose}</td>
              <td className="py-2 pr-4 text-muted-foreground">{r.category}</td>
              <td className="py-2 pr-4 text-muted-foreground">{r.duration}</td>
              <td className="py-2 text-muted-foreground">{r.necessary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CookiesContent() {
  return (
    <>
      <PageHeader
        eyebrow="Traceurs"
        title="Politique relative aux cookies et autres traceurs"
        description={`Dernière mise à jour : ${legalConfig.lastUpdated}`}
      />
      <LegalContent>
        <p>
          Cette page décrit les cookies et traceurs utilisés par {legalConfig.brandName}. Nous limitons volontairement
          leur usage : le service repose sur des cookies strictement nécessaires et une mesure d&apos;audience qui ne
          dépose pas de cookie. Aucun cookie publicitaire ni traceur de suivi tiers n&apos;est utilisé.
        </p>

        <h2>Cookies strictement nécessaires</h2>
        <p>
          Ces cookies sont indispensables au fonctionnement du service et ne peuvent pas être désactivés depuis nos
          écrans. Ils servent notamment à maintenir la session d&apos;un professionnel connecté à son espace et à
          assurer la sécurité.
        </p>
        <TrackerTable rows={NECESSARY_COOKIES} />

        <h2>Mesure d&apos;audience sans cookie</h2>
        <p>
          Nous utilisons une mesure d&apos;audience agrégée (via notre hébergeur applicatif) qui ne dépose pas de cookie
          et ne suit pas les personnes de site en site. Elle fournit des statistiques globales de fréquentation.
        </p>

        <h2>Stockage local technique</h2>
        <p>
          Certaines informations sont conservées dans le stockage local de votre navigateur (et non dans des cookies)
          pour des besoins techniques et de confort. Elles restent sur votre appareil et peuvent être effacées à tout
          moment depuis les réglages de votre navigateur.
        </p>
        <TrackerTable rows={LOCAL_STORAGE} />

        <h2>Faut-il donner son consentement ?</h2>
        <p>
          En l&apos;absence de cookie publicitaire ou de traceur de suivi non essentiel nécessitant un consentement,
          aucun bandeau de consentement n&apos;est affiché. Si {legalConfig.brandName} venait à introduire de tels
          traceurs, un mécanisme de consentement serait mis en place <strong>avant</strong> leur déclenchement, avec la
          possibilité de tout accepter, tout refuser ou personnaliser — refuser étant aussi simple qu&apos;accepter.
        </p>

        <h2>Gérer les cookies depuis votre navigateur</h2>
        <p>
          Vous pouvez à tout moment configurer votre navigateur pour bloquer ou supprimer les cookies et vider le
          stockage local. Le blocage des cookies strictement nécessaires peut toutefois empêcher la connexion à un
          espace professionnel.
        </p>

        <h2>En savoir plus</h2>
        <p>
          Le traitement des données personnelles est détaillé dans la{" "}
          <a href="/confidentialite">politique de confidentialité</a>. Pour toute question, écrivez à{" "}
          <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>.
        </p>
      </LegalContent>
    </>
  )
}

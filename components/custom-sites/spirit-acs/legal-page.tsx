/**
 * Pages LÉGALES de Spirit ACS (Mentions légales & Politique de confidentialité)
 * — composants SERVEUR rendus DANS la coquille Spirit (`SpiritSiteShell`).
 *
 * ISOLATION : ces composants ne sont montés que pour le tenant Spirit ACS
 * (dispatch dans les routes `(site)/mentions-legales` et `(site)/confidentialite`).
 * Les autres tenants conservent EXACTEMENT le rendu standard (PageHeader +
 * LegalContent). Aucune donnée inventée : l'identité de l'éditeur provient des
 * coordonnées RÉELLES du tenant (`getContact`) avec repli sur l'identité
 * professionnelle vérifiée `SPIRIT_BUSINESS`. Les prestataires cités dans la
 * politique de confidentialité correspondent aux services réellement utilisés
 * par le parcours de demande de devis (hébergement Vercel, base Neon, e-mails
 * Resend, stockage photos Vercel Blob).
 */

import type { ReactNode } from "react"
import Link from "next/link"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"
import { withTenant } from "@/lib/tenant-link"
import { SpiritSiteShell } from "./site-shell"
import { buildSpiritShellPropsForSubpage } from "./shell-props"
import { SPIRIT_BUSINESS } from "./seo-content"

/** Date de dernière mise à jour affichée sur les documents légaux Spirit. */
const LEGAL_LAST_UPDATED = "16 septembre 2026"

/** Style commun des liens dans le corps juridique (accents de marque Spirit). */
const LINK_CLASS =
  "font-medium text-[color:var(--spirit-teal-strong)] underline underline-offset-2 transition-colors hover:text-[color:var(--spirit-pink)]"

type Block =
  | { kind: "p"; content: ReactNode }
  | { kind: "lines"; lines: ReactNode[] }
  | { kind: "ul"; items: ReactNode[] }

type Section = { id: string; heading: string; blocks: Block[] }

function BlockView({ block }: { block: Block }) {
  if (block.kind === "ul") {
    return (
      <ul className="list-disc space-y-1.5 pl-5 marker:text-[color:var(--spirit-pink)]">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    )
  }
  if (block.kind === "lines") {
    return (
      <p className="leading-relaxed">
        {block.lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < block.lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    )
  }
  return <p className="leading-relaxed">{block.content}</p>
}

/**
 * Gabarit visuel commun aux deux pages légales Spirit : coquille de marque +
 * en-tête (filet accent, H1 unique, date) + corps aéré et lisible.
 */
async function SpiritLegalLayout({
  data,
  title,
  intro,
  sections,
}: {
  data: CustomSitePublicData
  title: string
  intro?: ReactNode
  sections: Section[]
}) {
  const shellProps = await buildSpiritShellPropsForSubpage(data)

  return (
    <SpiritSiteShell {...shellProps}>
      <article className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <header>
            <span className="spirit-rule" />
            <h1 className="spirit-title spirit-h1 mt-4 text-balance leading-[1.02]">{title}</h1>
            <p className="mt-3 text-sm text-[color:var(--spirit-ink)]/55">
              Dernière mise à jour : {LEGAL_LAST_UPDATED}
            </p>
          </header>

          {intro && (
            <p className="mt-8 text-lg leading-relaxed text-[color:var(--spirit-ink)]/80 text-pretty">{intro}</p>
          )}

          <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-[color:var(--spirit-ink)]/80 sm:text-base">
            {sections.map((section) => (
              <section key={section.id} aria-labelledby={`legal-${section.id}`}>
                <h2
                  id={`legal-${section.id}`}
                  className="spirit-title text-xl text-[color:var(--spirit-ink)] sm:text-2xl"
                >
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.blocks.map((block, i) => (
                    <BlockView key={i} block={block} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </article>
    </SpiritSiteShell>
  )
}

/** Identité éditeur résolue depuis les coordonnées réelles + repli vérifié. */
async function resolveEditorIdentity(data: CustomSitePublicData) {
  const contact = await data.getContact()
  const address =
    contact.address?.trim() ||
    `${SPIRIT_BUSINESS.streetAddress}, ${SPIRIT_BUSINESS.postalCode} ${SPIRIT_BUSINESS.addressLocality}`
  const phoneRaw = contact.phoneRaw?.trim() || SPIRIT_BUSINESS.phone
  const phone = contact.phone?.trim() || "06 99 90 13 03"
  const email = contact.email?.trim() || null
  return {
    name: SPIRIT_BUSINESS.name,
    alternateName: SPIRIT_BUSINESS.alternateName,
    address,
    phone,
    phoneRaw,
    email,
  }
}

/* ------------------------------- Mentions légales ------------------------------- */

export async function SpiritMentionsLegales({ data }: { data: CustomSitePublicData }) {
  const slug = data.tenant.slug
  const editor = await resolveEditorIdentity(data)
  const confidentialiteHref = withTenant("/confidentialite", slug)

  const sections: Section[] = [
    {
      id: "editeur",
      heading: "1. Éditeur du site",
      blocks: [
        {
          kind: "lines",
          lines: [
            <>
              <strong>{editor.name}</strong> ({editor.alternateName})
            </>,
            <>Responsable de la publication : Corentin Gisclon</>,
            <>Adresse : {editor.address}</>,
            <>
              Téléphone :{" "}
              <a className={LINK_CLASS} href={`tel:${editor.phoneRaw}`}>
                {editor.phone}
              </a>
            </>,
            ...(editor.email
              ? [
                  <>
                    Email :{" "}
                    <a className={LINK_CLASS} href={`mailto:${editor.email}`}>
                      {editor.email}
                    </a>
                  </>,
                ]
              : []),
          ],
        },
      ],
    },
    {
      id: "hebergement",
      heading: "2. Hébergement",
      blocks: [
        {
          kind: "lines",
          lines: [
            <>
              Le site est hébergé par <strong>Vercel Inc.</strong>
            </>,
            <>340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</>,
            <>
              <a className={LINK_CLASS} href="https://vercel.com" target="_blank" rel="noopener noreferrer">
                vercel.com
              </a>
            </>,
          ],
        },
      ],
    },
    {
      id: "propriete",
      heading: "3. Propriété intellectuelle",
      blocks: [
        {
          kind: "p",
          content:
            "L'ensemble des contenus présents sur ce site (textes, photographies, logos, éléments graphiques et mise en page) est la propriété de Spirit Auto Clean Service ou de ses partenaires, et est protégé par le droit d'auteur. Toute reproduction, représentation ou diffusion, totale ou partielle, sans autorisation écrite préalable, est interdite.",
        },
      ],
    },
    {
      id: "responsabilite",
      heading: "4. Responsabilité",
      blocks: [
        {
          kind: "p",
          content:
            "Spirit Auto Clean Service s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur ce site. Les prestations, tarifs indicatifs et disponibilités sont donnés à titre informatif et peuvent évoluer ; ils ne constituent pas un engagement contractuel avant l'établissement d'un devis. La responsabilité de l'éditeur ne saurait être engagée en cas d'erreur, d'omission ou d'indisponibilité temporaire du site.",
        },
      ],
    },
    {
      id: "liens",
      heading: "5. Liens hypertextes",
      blocks: [
        {
          kind: "p",
          content:
            "Ce site peut contenir des liens vers des sites tiers (réseaux sociaux, fiche Google, messagerie). Spirit Auto Clean Service n'exerce aucun contrôle sur ces sites et décline toute responsabilité quant à leur contenu ou à l'usage qui en est fait.",
        },
      ],
    },
    {
      id: "donnees",
      heading: "6. Données personnelles",
      blocks: [
        {
          kind: "p",
          content: (
            <>
              Le traitement des données personnelles collectées via ce site (notamment le formulaire de demande de
              devis) est détaillé dans notre{" "}
              <Link className={LINK_CLASS} href={confidentialiteHref}>
                Politique de confidentialité
              </Link>
              .
            </>
          ),
        },
      ],
    },
    {
      id: "cookies",
      heading: "7. Cookies",
      blocks: [
        {
          kind: "p",
          content:
            "Ce site utilise uniquement des mécanismes techniques strictement nécessaires à son fonctionnement ainsi qu'une mesure d'audience interne et anonyme. Aucun cookie publicitaire ni traceur tiers n'est déposé. Les modalités sont précisées dans la Politique de confidentialité.",
        },
      ],
    },
    {
      id: "droit",
      heading: "8. Droit applicable",
      blocks: [
        {
          kind: "p",
          content:
            "Le présent site et ses mentions légales sont régis par le droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français seront seuls compétents.",
        },
      ],
    },
  ]

  return (
    <SpiritLegalLayout
      data={data}
      title="Mentions légales"
      intro="Informations légales relatives au site de Spirit Auto Clean Service (Spirit ACS), detailing et entretien automobile à Lagny-sur-Marne."
      sections={sections}
    />
  )
}

/* --------------------------- Politique de confidentialité --------------------------- */

export async function SpiritConfidentialite({ data }: { data: CustomSitePublicData }) {
  const slug = data.tenant.slug
  const editor = await resolveEditorIdentity(data)
  const contactHref = withTenant("/contact", slug)

  const contactEditor: ReactNode = editor.email ? (
    <a className={LINK_CLASS} href={`mailto:${editor.email}`}>
      {editor.email}
    </a>
  ) : (
    <Link className={LINK_CLASS} href={contactHref}>
      page Contact
    </Link>
  )

  const sections: Section[] = [
    {
      id: "responsable",
      heading: "1. Responsable du traitement",
      blocks: [
        {
          kind: "lines",
          lines: [
            <>
              Le responsable du traitement des données est <strong>{editor.name}</strong> ({editor.alternateName}).
            </>,
            <>Adresse : {editor.address}</>,
            <>
              Contact :{" "}
              {editor.email ? (
                <a className={LINK_CLASS} href={`mailto:${editor.email}`}>
                  {editor.email}
                </a>
              ) : (
                <Link className={LINK_CLASS} href={contactHref}>
                  via la page Contact
                </Link>
              )}
              {" — "}
              <a className={LINK_CLASS} href={`tel:${editor.phoneRaw}`}>
                {editor.phone}
              </a>
            </>,
          ],
        },
      ],
    },
    {
      id: "donnees-collectees",
      heading: "2. Données collectées",
      blocks: [
        { kind: "p", content: "Dans le cadre d'une demande de devis, nous pouvons collecter :" },
        {
          kind: "ul",
          items: [
            "votre nom et, le cas échéant, votre statut (particulier ou professionnel) ;",
            "vos coordonnées : e-mail et numéro de téléphone ;",
            "les informations relatives à votre véhicule (type, marque, modèle) et à votre demande ;",
            "les photographies que vous choisissez de transmettre pour préciser votre besoin ;",
            "pour un professionnel, l'identifiant légal communiqué (ex. SIREN/SIRET).",
          ],
        },
        {
          kind: "p",
          content:
            "Seules les informations que vous transmettez volontairement sont collectées. Aucune donnée sensible n'est demandée.",
        },
      ],
    },
    {
      id: "finalites",
      heading: "3. Finalités du traitement",
      blocks: [
        { kind: "p", content: "Vos données sont utilisées uniquement pour :" },
        {
          kind: "ul",
          items: [
            "étudier votre demande et établir une proposition de prestation ;",
            "vous recontacter au sujet de votre demande ;",
            "assurer le suivi de la prestation éventuellement convenue.",
          ],
        },
        {
          kind: "p",
          content:
            "Vos données ne sont jamais vendues, louées ni utilisées à des fins de prospection commerciale non sollicitée.",
        },
      ],
    },
    {
      id: "base-legale",
      heading: "4. Base légale",
      blocks: [
        {
          kind: "p",
          content:
            "Le traitement repose sur votre consentement et sur l'exécution de mesures précontractuelles prises à votre demande (établissement d'un devis), conformément au Règlement Général sur la Protection des Données (RGPD).",
        },
      ],
    },
    {
      id: "conservation",
      heading: "5. Durée de conservation",
      blocks: [
        {
          kind: "p",
          content:
            "Vos données sont conservées le temps nécessaire au traitement de votre demande et à la relation qui en découle, puis archivées ou supprimées conformément aux obligations légales applicables. Les demandes sans suite sont supprimées dans un délai raisonnable.",
        },
      ],
    },
    {
      id: "destinataires",
      heading: "6. Destinataires et prestataires techniques",
      blocks: [
        {
          kind: "p",
          content:
            "Vos données sont destinées à Spirit Auto Clean Service. Pour faire fonctionner le site et traiter les demandes, nous faisons appel à des prestataires techniques agissant pour notre compte :",
        },
        {
          kind: "ul",
          items: [
            <>
              <strong>Vercel</strong> — hébergement et diffusion du site ;
            </>,
            <>
              <strong>Neon</strong> — base de données hébergeant les demandes de devis ;
            </>,
            <>
              <strong>Resend</strong> — acheminement des e-mails de notification liés à votre demande ;
            </>,
            <>
              <strong>Vercel Blob</strong> — stockage sécurisé et privé des photos que vous transmettez.
            </>,
          ],
        },
        {
          kind: "p",
          content:
            "Ces prestataires n'accèdent aux données que dans la stricte mesure nécessaire à leur mission et sont tenus à la confidentialité.",
        },
      ],
    },
    {
      id: "transferts",
      heading: "7. Transferts hors Union européenne",
      blocks: [
        {
          kind: "p",
          content:
            "Certains prestataires techniques peuvent traiter des données en dehors de l'Union européenne, notamment aux États-Unis. Dans ce cas, les transferts sont encadrés par des garanties appropriées (clauses contractuelles types de la Commission européenne).",
        },
      ],
    },
    {
      id: "securite",
      heading: "8. Sécurité",
      blocks: [
        {
          kind: "p",
          content:
            "Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour protéger vos données. Les photos transmises sont stockées dans un espace privé, accessible via un lien d'autorisation signé et à durée limitée.",
        },
      ],
    },
    {
      id: "droits",
      heading: "9. Vos droits",
      blocks: [
        {
          kind: "p",
          content: (
            <>
              {
                "Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition sur vos données, ainsi que du droit de retirer votre consentement à tout moment. Pour l'exercer, contactez-nous à "
              }
              {contactEditor}
              {"."}
            </>
          ),
        },
        {
          kind: "p",
          content:
            "Vous pouvez également introduire une réclamation auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés, www.cnil.fr).",
        },
      ],
    },
    {
      id: "cookies",
      heading: "10. Cookies et mesure d'audience",
      blocks: [
        {
          kind: "p",
          content:
            "Ce site n'utilise pas de cookie publicitaire ni de traceur tiers. Seule une mesure d'audience interne et anonyme (identifiant technique anonyme, sans identification personnelle) est utilisée pour améliorer le site. Aucun consentement à des cookies non essentiels n'est donc requis.",
        },
      ],
    },
  ]

  return (
    <SpiritLegalLayout
      data={data}
      title="Politique de confidentialité"
      intro="Spirit Auto Clean Service (Spirit ACS) accorde une grande importance à la protection de vos données personnelles, conformément au Règlement Général sur la Protection des Données (RGPD)."
      sections={sections}
    />
  )
}

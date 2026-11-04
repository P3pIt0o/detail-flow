/**
 * PRODUITS & FOURNISSEURS CLEANYZER (L35) : textes, preuves et photos EXACTEMENT comme la maquette
 * validée par Tom. Bandeau de logos qui défile (logos seuls) : OryShine et Koch-Chemie cliquables
 * (nouvel onglet), Fraber non cliquable, Alchimy en texte (logo à venir). La copie de défilement est
 * masquée aux lecteurs d'écran ; défilement arrêté si `prefers-reduced-motion` (cleanyzer.css).
 */

const NEON = "/custom-sites/cleanyzer/neon"

const PROOFS = [
  { title: "Gammes professionnelles", text: "Des produits de pro, pas de grande surface.", dot: "" },
  { title: "Testées en laboratoire", text: "Des formules contrôlées, conformes aux normes européennes.", dot: " b" },
  { title: "Dont des marques 100 % françaises", text: "Choisies par Tom pour leurs résultats.", dot: "" },
]

const PHOTOS = [
  {
    src: `${NEON}/mousse-porsche.webp`,
    alt: "Porsche recouverte de mousse de prélavage pendant un lavage Cleanyzer",
    caption: "Prélavage à la mousse",
    big: true,
  },
  {
    src: `${NEON}/tapis-brosse.webp`,
    alt: "Tom brosse un tapis de sol avec une brosse et des gants",
    caption: "Shampoing des tapis",
    position: "50% 60%",
  },
  {
    src: "/custom-sites/cleanyzer/realisations/siege-apres.webp",
    alt: "Siège en tissu propre après shampoing",
    caption: "Intérieur & textile",
  },
]

type Supplier = { name: string; href?: string; logo?: string; alt?: string }
const SUPPLIERS: Supplier[] = [
  { name: "OryShine", href: "https://www.oryshine.fr/", logo: `${NEON}/logos/oryshine.webp`, alt: "OryShine, produits de nettoyage auto fabriqués en France" },
  { name: "Koch-Chemie", href: "https://www.koch-chemie.com/", logo: `${NEON}/logos/kochchemie.webp`, alt: "Koch-Chemie, produits professionnels de detailing" },
  { name: "Fraber", logo: `${NEON}/logos/fraber.webp`, alt: "Fraber, produits de lavage automobile" },
  { name: "Alchimy" },
]

function SupplierItem({ s, copy }: { s: Supplier; copy: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  const content = s.logo ? <img src={s.logo} alt={copy ? "" : (s.alt ?? s.name)} loading="lazy" height={28} /> : <b>{s.name}</b>
  const hidden = copy ? { "aria-hidden": true as const } : {}
  return s.href ? (
    <a className="clz-neon-sup" href={s.href} target="_blank" rel="noopener noreferrer" tabIndex={copy ? -1 : undefined} {...hidden}>
      {content}
    </a>
  ) : (
    <span className="clz-neon-sup" {...hidden}>
      {content}
    </span>
  )
}

export function ClzFournisseurs() {
  return (
    <section className="clz-neon-products" aria-labelledby="clz-prod-title">
      <div className="clz-neon-wrap clz-neon-pgrid">
        <div>
          <span className="clz-neon-eyebrow">Nos fournisseurs</span>
          <h2 id="clz-prod-title" className="clz-neon-h2">
            Des produits de detailing professionnels <em>pour votre voiture, à Annecy.</em>
          </h2>
          <p className="clz-neon-plede">
            Pour chaque nettoyage auto à domicile à Annecy et alentours, Cleanyzer travaille avec des gammes professionnelles testées en laboratoire, dont des marques 100 % françaises. Les mêmes exigences, du lavage extérieur au shampoing des sièges.
          </p>
          <ul className="clz-neon-proofs">
            {PROOFS.map((p) => (
              <li key={p.title}>
                <span className={`clz-neon-dot${p.dot}`} aria-hidden="true" />
                <div>
                  <b>{p.title}</b>
                  <span>{p.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="clz-neon-shelf" aria-label="Tom au travail avec ses produits">
          {PHOTOS.map((p) => (
            <figure key={p.src} className={`clz-neon-ph${p.big ? " big" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.alt} loading="lazy" decoding="async" style={p.position ? { objectPosition: p.position } : undefined} />
              <figcaption>{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="clz-neon-band" aria-label="Nos fournisseurs professionnels">
        <div className="clz-neon-marquee">
          <div className="clz-neon-track">
            {SUPPLIERS.map((s) => (
              <SupplierItem key={s.name} s={s} copy={false} />
            ))}
            {SUPPLIERS.map((s) => (
              <SupplierItem key={`${s.name}-copie`} s={s} copy />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

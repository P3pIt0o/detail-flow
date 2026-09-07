import type { Metadata } from "next"
import { Oswald } from "next/font/google"

/**
 * MAQUETTE VISUELLE ISOLÉE — Accueil mobile Spirit ACS (Écran 01).
 *
 * Cette page est une PRÉVISUALISATION autonome destinée à la validation par
 * Corentin AVANT toute implémentation. Elle n'importe aucun composant du site
 * de production, ne touche ni au système multi-tenant, ni au catalogue, ni aux
 * autres tenants. Toutes les données (prestations, tarifs, adresse, photos)
 * sont les données RÉELLES déjà présentes dans le projet — rien n'est inventé.
 *
 * À supprimer une fois la direction UX validée.
 */

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-osw" })

export const metadata: Metadata = {
  title: "Maquette — Accueil Spirit ACS",
  robots: { index: false, follow: false },
}

const BASE = "/custom-sites/spirit-acs"

/**
 * Cartes d'accueil réorganisées selon les retours de Corentin :
 *   1 Nettoyage · 2 Polissage & Céramique · 3 PPF & Personnalisation ·
 *   4 Rénovation de phares · 5 Moto (seul, pleine largeur).
 *
 * Aucune prestation réelle n'est supprimée : « polissage-automobile » +
 * « protection-ceramique » sont regroupés en UNE vitrine (le regroupement
 * visuel ne préjuge pas de l'architecture SEO : chaque prestation gardera sa
 * propre page). « personnalisation » n'existe pas comme prestation autonome
 * dans le catalogue (aujourd'hui rattachée à la moto) → aucun prix inventé.
 *
 * Prix : uniquement des indications certaines. Un regroupement dont le prix
 * d'entrée diffère affiche « Voir les formules » ; « Sur devis » là où c'est
 * réellement le cas (source : seo-content.ts).
 */
const SERVICES = [
  {
    title: "Nettoyage intérieur et extérieur",
    price: "Sur devis",
    image: `${BASE}/nettoyage-interieur-cuir.jpg`,
    alt: "Habitacle cuir nettoyé et soigné par Spirit ACS",
    wide: false,
  },
  {
    title: "Polissage & céramique",
    price: "Voir les formules",
    image: `${BASE}/polissage-porsche-911.jpg`,
    alt: "Carrosserie de Porsche 911 polie par Spirit ACS",
    wide: false,
  },
  {
    title: "PPF & personnalisation",
    price: "Sur devis",
    image: `${BASE}/ppf-porsche-911.jpg`,
    alt: "Avant de Porsche 911 protégé par un film PPF transparent",
    wide: false,
  },
  {
    title: "Rénovation de phares",
    price: "dès 80 €",
    image: `${BASE}/renovation-phares-apres.jpg`,
    alt: "Optique de phare rénovée et de nouveau transparente",
    wide: false,
  },
  {
    title: "Moto",
    price: "dès 50 €",
    image: `${BASE}/detailing-moto-kymco.jpg`,
    alt: "Scooter Kymco entretenu par Spirit ACS",
    wide: true,
  },
]

/** Réalisations : uniquement de vraies photos Spirit, aucun faux avant/après. */
const REALISATIONS = [
  { image: `${BASE}/polissage-porsche-911.jpg`, alt: "Porsche 911 polie par Spirit ACS" },
  { image: `${BASE}/ceramique-bmw-m4.jpg`, alt: "BMW M4 protégée en céramique" },
  { image: `${BASE}/ppf-porsche-911.jpg`, alt: "Porsche 911 protégée en PPF" },
  { image: `${BASE}/renovation-phares-apres.jpg`, alt: "Phare rénové par Spirit ACS" },
  { image: `${BASE}/detailing-moto-kymco.jpg`, alt: "Moto entretenue par Spirit ACS" },
]

const STEPS = [
  { n: "1", title: "Votre demande", text: "Décrivez votre véhicule et le résultat recherché." },
  { n: "2", title: "Analyse et proposition", text: "Spirit ACS étudie votre besoin et propose une prestation adaptée." },
  { n: "3", title: "Réalisation", text: "Prise en charge à l'atelier ou à domicile selon la prestation." },
  { n: "4", title: "Contrôle final", text: "Le résultat est contrôlé avant la restitution du véhicule." },
]

export default function SpiritHomeMockup() {
  return (
    <div className={`${oswald.variable} spirit-mock-stage`}>
      <style>{css}</style>

      <div className="spirit-mock">
        {/* 1 — HEADER */}
        <header className="mk-header">
          <img src={`${BASE}/spirit-logo.png`} alt="Spirit ACS" className="mk-logo" />
          <button className="mk-burger" aria-label="Ouvrir le menu">
            <span />
            <span />
            <span />
          </button>
        </header>

        {/* 2 — HERO (traitement premium multi-couches, non destructif) */}
        <section className="mk-hero">
          <img src={`${BASE}/polissage-porsche-911.jpg`} alt="Porsche 911 noire préparée par Spirit ACS à Lagny-sur-Marne" className="mk-hero-img" />
          <div className="mk-hero-vignette" aria-hidden="true" />
          <div className="mk-hero-side" aria-hidden="true" />
          <div className="mk-hero-grade" aria-hidden="true" />
          <div className="mk-hero-body">
            <p className="mk-eyebrow">Detailing automobile · Lagny-sur-Marne</p>
            <h1 className="mk-title mk-h1">Prenez soin de votre véhicule</h1>
            <p className="mk-lead">Nettoyage, polissage et protection, réalisés avec exigence.</p>
            <div className="mk-cta-col">
              <a className="mk-btn mk-btn-pink" href="#">Demander un devis</a>
              <a className="mk-btn mk-btn-ghost" href="#services">Voir les prestations</a>
            </div>
          </div>
        </section>

        {/* 3 — PRESTATIONS */}
        <section className="mk-sec" id="services">
          <p className="mk-eyebrow mk-eyebrow-dark">Nos prestations</p>
          <h2 className="mk-title mk-h2">Sélectionnez puis réservez votre créneau</h2>
          <div className="mk-grid">
            {SERVICES.map((s) => (
              <a key={s.title} className={`mk-tile${s.wide ? " mk-tile-wide" : ""}`} href="#">
                <img src={s.image || "/placeholder.svg"} alt={s.alt} className="mk-tile-img" />
                <div className="mk-tile-veil" />
                <span className="mk-tile-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
                <div className="mk-tile-body">
                  <span className="mk-tile-title">{s.title}</span>
                  <span className="mk-tile-price">{s.price}</span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* 4 — RÉALISATIONS */}
        <section className="mk-sec mk-sec-tight">
          <p className="mk-eyebrow mk-eyebrow-dark">Réalisations</p>
          <h2 className="mk-title mk-h2">Nos derniers passages à l'atelier</h2>
          <div className="mk-scroller">
            {REALISATIONS.map((r, i) => (
              <div key={i} className="mk-shot">
                <img src={r.image || "/placeholder.svg"} alt={r.alt} className="mk-shot-img" />
              </div>
            ))}
          </div>
        </section>

        {/* 5 — COMMENT ÇA SE PASSE */}
        <section className="mk-sec">
          <p className="mk-eyebrow mk-eyebrow-dark">Comment ça se passe</p>
          <h2 className="mk-title mk-h2">Une demande, pas une réservation</h2>
          <ol className="mk-steps">
            {STEPS.map((st) => (
              <li key={st.n} className="mk-step">
                <span className="mk-step-n">{st.n}</span>
                <div>
                  <p className="mk-step-title">{st.title}</p>
                  <p className="mk-step-text">{st.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 6 — ZONE D'INTERVENTION */}
        <section className="mk-zone">
          <svg viewBox="0 0 24 24" className="mk-zone-pin" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
            />
          </svg>
          <p className="mk-eyebrow mk-eyebrow-dark">Zone d'intervention</p>
          <h2 className="mk-title mk-h2">Lagny-sur-Marne et alentours</h2>
          <p className="mk-zone-text">
            Spirit ACS est situé à Lagny-sur-Marne et intervient également, selon la prestation, dans les communes
            voisines de Seine-et-Marne.
          </p>
        </section>

        {/* 7 — CTA FINAL */}
        <section className="mk-final">
          <h2 className="mk-title mk-final-title">Un projet pour votre véhicule ?</h2>
          <p className="mk-final-text">Envoyez votre demande, Spirit ACS l'étudie et vous répond.</p>
          <a className="mk-btn mk-btn-pink mk-btn-wide" href="#">Demander un devis</a>
        </section>

        {/* 8 — FOOTER */}
        <footer className="mk-footer">
          <img src={`${BASE}/spirit-logo.png`} alt="Spirit ACS" className="mk-logo mk-logo-foot" />
          <p className="mk-foot-line">53 Rue Pierre Semard, 77400 Lagny-sur-Marne</p>
          <a className="mk-foot-line mk-foot-link" href="tel:+33699901303">06 99 90 13 03</a>
          <nav className="mk-foot-nav">
            <a href="#services">Prestations</a>
            <a href="#">Avis</a>
            <a href="#">Contact</a>
          </nav>
          <p className="mk-foot-legal">Spirit Auto Clean Service · Mentions légales</p>
        </footer>
      </div>
    </div>
  )
}

const css = `
.spirit-mock-stage{
  min-height:100vh;
  background:#02090e;
  display:flex;
  justify-content:center;
  padding:0;
}
.spirit-mock{
  --navy:#06131c; --navy2:#0a2130; --navy3:#0d2a3b;
  --teal:#17b3c9; --pink:#e51e7a; --pink2:#c4136a;
  --paper:#eef2f4; --fg:#f4f8fa; --muted:#9fb1bc;
  width:100%; max-width:402px;
  background:var(--navy); color:var(--fg);
  font-family:var(--font-sans),system-ui,sans-serif;
  overflow:hidden; position:relative;
  -webkit-font-smoothing:antialiased;
}
.mk-title{ font-family:var(--font-osw),"Oswald",system-ui,sans-serif; text-transform:uppercase; font-weight:700; line-height:.98; letter-spacing:.01em; margin:0; }
.mk-eyebrow{ font-family:var(--font-osw),"Oswald",system-ui,sans-serif; text-transform:uppercase; letter-spacing:.2em; font-weight:600; font-size:11px; color:var(--teal); margin:0; }
.mk-eyebrow-dark{ color:var(--teal); }

/* HEADER */
.mk-header{ position:absolute; top:0; left:0; right:0; z-index:5; height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; }
.mk-logo{ height:30px; width:auto; object-fit:contain; }
.mk-burger{ background:rgba(6,19,28,.35); border:1px solid rgba(255,255,255,.16); border-radius:9px; width:40px; height:40px; display:flex; flex-direction:column; gap:4px; align-items:center; justify-content:center; backdrop-filter:blur(6px); }
.mk-burger span{ width:17px; height:2px; background:var(--fg); border-radius:2px; }

/* HERO — vraie photo Porsche, rendu cinématique 100% CSS (non destructif) */
.mk-hero{ position:relative; height:592px; display:flex; align-items:flex-end; overflow:hidden; background:var(--navy); }
.mk-hero-img{
  position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:63% 34%;
  /* accentuation légère des reflets premium, sans dénaturer la photo */
  filter:contrast(1.1) saturate(1.07) brightness(.94);
}
/* 1 · vignettage radial : bords assombris, Porsche encore lumineuse au centre */
.mk-hero-vignette{ position:absolute; inset:0; background:
  radial-gradient(125% 88% at 64% 40%, rgba(2,9,14,0) 40%, rgba(2,9,14,.42) 78%, rgba(2,9,14,.68) 100%); }
/* 2 · voile latéral gauche : protège la lisibilité du texte */
.mk-hero-side{ position:absolute; inset:0; background:
  linear-gradient(96deg, rgba(2,9,14,.9) 0%, rgba(2,9,14,.55) 30%, rgba(2,9,14,.12) 58%, rgba(2,9,14,0) 78%); }
/* 3 · fusion verticale : haut légèrement voilé + bas fondu dans le navy du site */
.mk-hero-grade{ position:absolute; inset:0; background:
  linear-gradient(180deg, rgba(2,9,14,.5) 0%, rgba(2,9,14,0) 20%, rgba(2,9,14,0) 46%, rgba(6,19,28,.72) 80%, var(--navy) 100%); }
.mk-hero-body{ position:relative; z-index:2; padding:0 20px 32px; width:100%; }
.mk-h1{ font-size:40px; margin:10px 0 0; color:#fff; text-shadow:0 2px 20px rgba(0,0,0,.4); }
.mk-lead{ margin:12px 0 0; font-size:15px; line-height:1.5; color:var(--paper); max-width:330px; }
.mk-cta-col{ margin-top:20px; display:flex; flex-direction:column; gap:10px; }
.mk-btn{ display:flex; align-items:center; justify-content:center; height:52px; border-radius:12px; font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.06em; font-weight:600; font-size:15px; text-decoration:none; }
.mk-btn-pink{ background:var(--pink); color:#fff; box-shadow:0 12px 30px -12px rgba(229,30,122,.8); }
.mk-btn-ghost{ background:rgba(255,255,255,.06); color:var(--fg); border:1px solid rgba(23,179,201,.6); }

/* SECTIONS */
.mk-sec{ padding:34px 20px 6px; }
.mk-sec-tight{ padding-top:30px; }
.mk-h2{ font-size:25px; margin:8px 0 18px; color:#fff; max-width:300px; }

/* GRID PRESTATIONS */
.mk-grid{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.mk-tile{ position:relative; border-radius:14px; overflow:hidden; aspect-ratio:4/5; display:block; text-decoration:none; border:1px solid rgba(255,255,255,.06); }
.mk-tile-wide{ grid-column:1 / -1; aspect-ratio:16/8; }
.mk-tile-img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.mk-tile-veil{ position:absolute; inset:0; background:linear-gradient(180deg, rgba(6,19,28,0) 34%, rgba(6,19,28,.62) 66%, rgba(6,19,28,.92) 100%); }
.mk-tile-body{ position:absolute; left:0; right:0; bottom:0; z-index:2; padding:12px 13px 13px; display:flex; flex-direction:column; gap:4px; }
.mk-tile-title{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; font-weight:600; font-size:14px; line-height:1.08; color:#fff; }
.mk-tile-price{ font-size:12.5px; font-weight:600; color:var(--teal); }
.mk-tile-arrow{ position:absolute; top:11px; right:11px; z-index:2; width:28px; height:28px; border-radius:50%; background:rgba(6,19,28,.55); border:1px solid rgba(255,255,255,.22); display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); }
.mk-tile-arrow svg{ width:14px; height:14px; color:#fff; }

/* RÉALISATIONS */
.mk-scroller{ display:flex; gap:11px; overflow-x:auto; margin:0 -20px; padding:2px 20px 10px; scroll-snap-type:x mandatory; }
.mk-shot{ flex:0 0 auto; width:250px; aspect-ratio:16/11; border-radius:14px; overflow:hidden; scroll-snap-align:start; border:1px solid rgba(255,255,255,.07); }
.mk-shot-img{ width:100%; height:100%; object-fit:cover; }

/* STEPS */
.mk-steps{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px; }
.mk-step{ display:flex; gap:14px; align-items:flex-start; }
.mk-step-n{ flex:0 0 auto; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-osw),"Oswald",sans-serif; font-weight:700; font-size:15px; color:var(--navy); background:var(--teal); }
.mk-step-title{ margin:4px 0 2px; font-weight:700; font-size:15px; color:#fff; }
.mk-step-text{ margin:0; font-size:13.5px; line-height:1.5; color:var(--muted); }

/* ZONE */
.mk-zone{ margin:34px 20px 6px; padding:26px 20px; border-radius:18px; background:linear-gradient(160deg,var(--navy2),var(--navy3)); border:1px solid rgba(255,255,255,.06); text-align:center; }
.mk-zone-pin{ width:30px; height:30px; color:var(--teal); margin:0 auto 8px; display:block; }
.mk-zone .mk-h2{ margin:8px auto 10px; }
.mk-zone-text{ margin:0 auto; font-size:13.5px; line-height:1.55; color:var(--muted); max-width:320px; }

/* CTA FINAL */
.mk-final{ margin:34px 0 0; padding:38px 22px 40px; background:linear-gradient(140deg,var(--pink2),var(--pink)); text-align:center; }
.mk-final-title{ font-size:26px; color:#fff; }
.mk-final-text{ margin:10px 0 20px; font-size:14px; line-height:1.5; color:rgba(255,255,255,.92); }
.mk-btn-wide{ background:#fff; color:var(--pink2); box-shadow:none; }

/* FOOTER */
.mk-footer{ background:var(--navy); padding:30px 22px 40px; text-align:center; border-top:1px solid rgba(255,255,255,.06); }
.mk-logo-foot{ height:34px; margin:0 auto 14px; display:block; }
.mk-foot-line{ margin:3px 0; font-size:13px; color:var(--muted); }
.mk-foot-link{ color:var(--teal); text-decoration:none; font-weight:600; display:inline-block; }
.mk-foot-nav{ display:flex; gap:18px; justify-content:center; margin:16px 0 14px; }
.mk-foot-nav a{ font-family:var(--font-osw),"Oswald",sans-serif; text-transform:uppercase; letter-spacing:.08em; font-size:12px; color:var(--fg); text-decoration:none; }
.mk-foot-legal{ margin:8px 0 0; font-size:11px; color:rgba(159,177,188,.6); }
`

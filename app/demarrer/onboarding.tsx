"use client"

import type React from "react"
import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Layout,
  MailCheck,
  MonitorSmartphone,
  Sparkles,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveOnboarding, type OnboardingIntent } from "@/lib/onboarding/shared"

/* -------------------------------------------------------------------------- */
/*  Données du parcours                                                        */
/* -------------------------------------------------------------------------- */

const INTENTS: {
  id: OnboardingIntent
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}[] = [
  {
    id: "booking",
    icon: MonitorSmartphone,
    title: "Ajouter la réservation à mon site",
    description: "J'ai déjà un site et je veux permettre à mes clients de réserver en ligne.",
  },
  {
    id: "page",
    icon: Layout,
    title: "Créer ma page professionnelle",
    description: "Une page simple à partager sur Instagram, Google, WhatsApp ou avec mes clients.",
  },
  {
    id: "website",
    icon: Globe,
    title: "Créer mon site professionnel",
    description: "Un site complet pour présenter mon activité et prendre des réservations.",
  },
]

const ACTIVITIES = [
  "Detailing automobile",
  "Lavage automobile",
  "Nettoyage automobile",
  "Polissage",
  "Protection céramique",
  "PPF",
  "Nettoyage textile",
  "Canapés / matelas",
  "Chaussures",
  "Autre",
]

const COUNTRIES = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "LU", label: "Luxembourg" },
  { code: "CA", label: "Canada" },
  { code: "OT", label: "Autre" },
]

type Step =
  | "intent"
  | "booking-site"
  | "page-info"
  | "website-domain"
  | "activity"
  | "company"
  | "recap"
  | "auth"
  | "verify"

/** Ordre des étapes selon l'intention (hors « verify », terminale). */
function stepsFor(intent: OnboardingIntent | ""): Step[] {
  const second: Step = intent === "booking" ? "booking-site" : intent === "website" ? "website-domain" : "page-info"
  if (!intent) return ["intent"]
  return ["intent", second, "activity", "company", "recap", "auth"]
}

/* -------------------------------------------------------------------------- */
/*  Composant principal                                                        */
/* -------------------------------------------------------------------------- */

export function Onboarding() {
  const [step, setStep] = useState<Step>("intent")
  const [intent, setIntent] = useState<OnboardingIntent | "">("")

  const [existingSite, setExistingSite] = useState("")
  const [hasDomain, setHasDomain] = useState<"yes" | "no" | "">("")
  const [domain, setDomain] = useState("")
  const [activities, setActivities] = useState<string[]>([])

  const [companyName, setCompanyName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [city, setCity] = useState("")
  const [country, setCountry] = useState("FR")
  const [phone, setPhone] = useState("")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)

  const steps = useMemo(() => stepsFor(intent), [intent])
  const currentIndex = steps.indexOf(step)
  // Tous les parcours comptent 6 étapes (intent -> ... -> auth) : total fixe
  // pour une progression cohérente dès le premier écran.
  const TOTAL_STEPS = 6
  const progress = step === "verify" ? 100 : Math.round(((currentIndex + 1) / TOTAL_STEPS) * 100)

  function goNext() {
    setError(null)
    const idx = steps.indexOf(step)
    if (idx >= 0 && idx < steps.length - 1) setStep(steps[idx + 1])
  }

  function goBack() {
    setError(null)
    const idx = steps.indexOf(step)
    if (idx > 0) setStep(steps[idx - 1])
  }

  function toggleActivity(a: string) {
    setActivities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  const websiteUrl = intent === "booking" ? existingSite.trim() : intent === "website" ? domain.trim() : ""

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Votre mot de passe doit contenir au moins 8 caractères.")
      return
    }
    setLoading(true)

    // On enregistre l'état AVANT de montrer l'écran de confirmation : ainsi, au
    // retour depuis le lien email, /admin/creer-mon-espace pré-remplit tout.
    if (intent) {
      saveOnboarding({
        intent,
        websiteUrl: websiteUrl || undefined,
        activities,
        companyName: companyName.trim(),
        ownerName: ownerName.trim(),
        city: city.trim() || undefined,
        country,
        phone: phone.trim() || undefined,
      })
    }

    const { error: authError } = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: ownerName.trim() || companyName.trim(),
      callbackURL: "/admin/creer-mon-espace",
    })
    setLoading(false)
    if (authError) {
      setError(authError.message ?? "Impossible de créer le compte.")
      return
    }
    setStep("verify")
  }

  async function resend() {
    setResent(false)
    const { error: e } = await authClient.sendVerificationEmail({
      email: email.trim(),
      callbackURL: "/admin/creer-mon-espace",
    })
    if (!e) setResent(true)
  }

  /* --------------------------------- Écrans -------------------------------- */

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh max-w-xl flex-col px-4 py-6 sm:py-10">
        {/* En-tête : retour + progression */}
        <div className="mb-8 flex items-center gap-4">
          {step !== "intent" && step !== "verify" ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Étape précédente"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Retour à l'accueil"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          )}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
            {step === "verify" ? "100%" : `${progress}%`}
          </span>
        </div>

        <div className="flex flex-1 flex-col">
          {step === "intent" && (
            <StepShell title="Que voulez-vous faire avec DetailFlow ?" subtitle="Choisissez ce qui correspond le mieux à votre situation.">
              <div className="flex flex-col gap-3">
                {INTENTS.map((opt) => {
                  const Icon = opt.icon
                  const active = intent === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setIntent(opt.id)
                        setStep(opt.id === "booking" ? "booking-site" : opt.id === "website" ? "website-domain" : "page-info")
                      }}
                      className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition-all ${
                        active ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="text-base font-semibold text-foreground">{opt.title}</span>
                        <span className="text-sm leading-relaxed text-muted-foreground">{opt.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </StepShell>
          )}

          {step === "booking-site" && (
            <StepShell
              title="Avez-vous déjà un site internet ?"
              subtitle="Vous pourrez ajouter votre lien de réservation DetailFlow depuis votre site, Instagram, Google, WhatsApp ou un QR code."
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  goNext()
                }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="existing-site">Adresse de votre site (facultatif)</Label>
                  <Input
                    id="existing-site"
                    type="url"
                    inputMode="url"
                    value={existingSite}
                    onChange={(e) => setExistingSite(e.target.value)}
                    placeholder="https://mon-site.fr"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">Pas encore de site ? Laissez ce champ vide, ce n&apos;est pas obligatoire.</p>
                </div>
                <PrimaryNext />
              </form>
            </StepShell>
          )}

          {step === "page-info" && (
            <StepShell
              title="Votre page professionnelle DetailFlow"
              subtitle="Une page à votre nom pour présenter vos prestations et recevoir des réservations, sans avoir à créer un site complet."
            >
              <ul className="flex flex-col gap-3">
                {["À partager sur Instagram, Google, WhatsApp ou par SMS", "Vos prestations et vos tarifs mis en avant", "La réservation en ligne intégrée", "Un QR code prêt à imprimer"].map(
                  (item) => (
                    <li key={item} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
              <div className="mt-6">
                <PrimaryNext onClick={goNext} asButton />
              </div>
            </StepShell>
          )}

          {step === "website-domain" && (
            <StepShell
              title="Avez-vous déjà un nom de domaine ?"
              subtitle="Vous pourrez commencer avec DetailFlow et connecter votre domaine plus tard, rien n'est bloquant."
            >
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setHasDomain("yes")}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    hasDomain === "yes" ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <span className="text-base font-semibold text-foreground">Oui, j&apos;ai un domaine</span>
                </button>
                {hasDomain === "yes" && (
                  <div className="flex flex-col gap-2 px-1">
                    <Label htmlFor="domain">Votre nom de domaine</Label>
                    <Input
                      id="domain"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="monentreprise.fr"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">Vous pourrez le connecter plus tard, ce n&apos;est pas obligatoire maintenant.</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setHasDomain("no")
                    setDomain("")
                  }}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    hasDomain === "no" ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <span className="text-base font-semibold text-foreground">Pas encore</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Vous pourrez en connecter un plus tard.</span>
                </button>
              </div>
              <div className="mt-6">
                <PrimaryNext onClick={goNext} asButton disabled={hasDomain === ""} />
              </div>
            </StepShell>
          )}

          {step === "activity" && (
            <StepShell title="Quelle est votre activité ?" subtitle="Sélectionnez tout ce qui s'applique. DetailFlow s'adapte à vos prestations.">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {ACTIVITIES.map((a) => {
                  const active = activities.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleActivity(a)}
                      aria-pressed={active}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-4 text-left text-sm font-medium transition-all ${
                        active ? "border-primary bg-primary/[0.06] text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {a}
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {active && <Check className="size-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-6">
                <PrimaryNext onClick={goNext} asButton disabled={activities.length === 0} />
              </div>
            </StepShell>
          )}

          {step === "company" && (
            <StepShell title="Parlez-nous de votre entreprise" subtitle="Ces informations personnalisent votre espace et votre page.">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (companyName.trim() && ownerName.trim()) goNext()
                }}
                className="flex flex-col gap-4"
              >
                <Field id="company-name" label="Nom de l'entreprise" value={companyName} onChange={setCompanyName} placeholder="Ex : Detailing Lyon" required autoFocus autoComplete="organization" />
                <Field id="owner-name" label="Votre nom et prénom" value={ownerName} onChange={setOwnerName} placeholder="Ex : Julien Martin" required autoComplete="name" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="city" label="Ville" value={city} onChange={setCity} placeholder="Ex : Lyon" autoComplete="address-level2" />
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="country">Pays</Label>
                    <select
                      id="country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Field id="phone" label="Téléphone" value={phone} onChange={setPhone} placeholder="06 12 34 56 78" type="tel" autoComplete="tel" inputMode="tel" />
                <PrimaryNext disabled={!companyName.trim() || !ownerName.trim()} />
              </form>
            </StepShell>
          )}

          {step === "recap" && (
            <StepShell title="Votre espace DetailFlow est prêt" subtitle="Voici ce que DetailFlow va préparer pour vous.">
              <ul className="flex flex-col gap-2.5">
                {recapItems({ intent, activities }).map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <PrimaryNext onClick={goNext} asButton label="Créer mon compte" />
              </div>
            </StepShell>
          )}

          {step === "auth" && (
            <StepShell title="Créez votre compte" subtitle="Dernière étape : vos identifiants de connexion. Vous confirmerez votre email juste après.">
              <form onSubmit={handleCreateAccount} className="flex flex-col gap-4">
                <Field id="email" label="Email" value={email} onChange={setEmail} placeholder="vous@exemple.fr" type="email" required autoFocus autoComplete="email" inputMode="email" />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8 caractères minimum"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={loading} className="mt-2 h-12 w-full text-base">
                  {loading ? "Création en cours..." : "Créer mon compte"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  En créant un compte, vous acceptez nos conditions d&apos;utilisation.
                </p>
              </form>
            </StepShell>
          )}

          {step === "verify" && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MailCheck className="size-7" aria-hidden="true" />
              </div>
              <h1 className="text-balance text-2xl font-bold tracking-tight">Confirmez votre email</h1>
              <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
                Un lien de confirmation a été envoyé à <span className="font-medium text-foreground">{email}</span>.
                Cliquez dessus pour activer votre compte : nous finaliserons ensuite la création de votre espace.
              </p>
              <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
                <Button variant="secondary" onClick={resend} className="w-full">
                  Renvoyer l&apos;email
                </Button>
                {resent && (
                  <p className="text-sm text-primary" role="status">
                    Email renvoyé.
                  </p>
                )}
                <Link href="/admin/login" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  J&apos;ai déjà confirmé, me connecter
                </Link>
              </div>
            </div>
          )}
        </div>

        {step === "intent" && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Vous avez déjà un compte ?{" "}
            <Link href="/admin/login" className="text-foreground underline underline-offset-4">
              Se connecter
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sous-composants présentationnels                                           */
/* -------------------------------------------------------------------------- */

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/** Bouton « Continuer » — soit submit de formulaire, soit onClick direct. */
function PrimaryNext({
  onClick,
  asButton,
  disabled,
  label = "Continuer",
}: {
  onClick?: () => void
  asButton?: boolean
  disabled?: boolean
  label?: string
}) {
  return (
    <Button type={asButton ? "button" : "submit"} onClick={onClick} disabled={disabled} className="h-12 w-full text-base">
      {label}
      <ArrowRight className="size-5" aria-hidden="true" />
    </Button>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  autoFocus,
  autoComplete,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  autoFocus?: boolean
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        inputMode={inputMode}
      />
    </div>
  )
}

/** Récapitulatif dynamique de ce que DetailFlow prépare. */
function recapItems({ intent, activities }: { intent: OnboardingIntent | ""; activities: string[] }): string[] {
  const items: string[] = []
  if (activities[0]) items.push(activities.length > 1 ? `${activities[0]} (+${activities.length - 1})` : activities[0])
  if (intent === "booking") items.push("Réservation en ligne pour votre site")
  if (intent === "page") items.push("Page professionnelle à partager")
  if (intent === "website") items.push("Site professionnel")
  items.push("Réservation en ligne", "Planning", "Clients & véhicules", "Facturation")
  return items
}

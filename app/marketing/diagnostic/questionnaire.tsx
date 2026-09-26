"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  CalendarClock,
  Sparkles,
  Palette,
  MessageSquare,
  Phone,
  FileText,
  Search,
  CreditCard,
  Images,
  Star,
  Tag,
  LayoutGrid,
  HelpCircle,
  TrendingUp,
  Rocket,
  Loader2,
  PartyPopper,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BOOKING_ORDER,
  DOMAIN_ORDER,
  IDENTITY_ORDER,
  GOAL_ORDER,
  FEATURE_ORDER,
  BOOKING_LABELS,
  DOMAIN_LABELS,
  IDENTITY_LABELS,
  GOAL_LABELS,
  FEATURE_LABELS,
  buildProjectSummary,
  visibleSteps,
  EMAIL_RE,
  isReasonablePhone,
  type DiagnosticAnswers,
  type DiagnosticField,
  type StepKey,
} from "@/lib/diagnostic/schema"
import { submitDiagnostic, type DiagnosticState } from "./actions"

/* ------------------------------ État initial ----------------------------- */

const INITIAL: DiagnosticAnswers = {
  hasSite: null,
  siteUrl: "",
  hasDomain: null,
  domain: "",
  booking: null,
  bookingTool: "",
  goals: [],
  features: [],
  identity: null,
  companyName: "",
  firstName: "",
  email: "",
  phone: "",
  comment: "",
}

/* ------------------------ Icônes par valeur d'option --------------------- */

const BOOKING_ICONS: Record<string, LucideIcon> = {
  aucun: X,
  google_agenda: CalendarClock,
  logiciel: LayoutGrid,
  telephone: Phone,
  papier: FileText,
  autre: HelpCircle,
}
const GOAL_ICONS: Record<string, LucideIcon> = {
  site_pro: Globe,
  plus_demandes: TrendingUp,
  visibilite_google: Search,
  reservation: CalendarClock,
  paiements: CreditCard,
  centraliser: LayoutGrid,
  moderniser: Sparkles,
}
const FEATURE_ICONS: Record<string, LucideIcon> = {
  reservation: CalendarClock,
  paiement: CreditCard,
  devis: FileText,
  galerie: Images,
  avis: Star,
  prestations: Tag,
  seo_local: Search,
  domaine: Globe,
  contact: MessageSquare,
  ne_sais_pas: HelpCircle,
}
const IDENTITY_ICONS: Record<string, LucideIcon> = {
  logo_couleurs: Palette,
  logo_seul: Sparkles,
  rien: HelpCircle,
}

/* -------------------------------- UI atomes ------------------------------ */

function ChoiceCard({
  label,
  icon: Icon,
  selected,
  onClick,
  multi = false,
}: {
  label: string
  icon?: LucideIcon
  selected: boolean
  onClick: () => void
  multi?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-2xl border bg-card p-4 text-left transition sm:p-5",
        "hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected ? "border-primary bg-primary/[0.05] ring-1 ring-primary" : "border-border",
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-primary",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-pretty text-[15px] font-medium text-foreground">{label}</span>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition",
          multi ? "rounded-md" : "rounded-full",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
        )}
        aria-hidden="true"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  )
}

function StepShell({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow?: string
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div key={title} className="animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
      {eyebrow ? (
        <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      ) : null}
      <h1 className="mt-3 text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      {hint ? <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{hint}</p> : null}
      <div className="mt-7">{children}</div>
    </div>
  )
}

function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
    >
      {children}
    </button>
  )
}

/* ------------------------------- Composant ------------------------------- */

export function Questionnaire() {
  const [answers, setAnswers] = useState<DiagnosticAnswers>(INITIAL)
  const [current, setCurrent] = useState<StepKey>("hasSite")
  const [history, setHistory] = useState<StepKey[]>([])
  const [status, setStatus] = useState<"form" | "submitting" | "success">("form")
  const [serverError, setServerError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DiagnosticField, string>>>()
  // Honeypot anti-spam (invisible pour l'humain).
  const [honeypot, setHoneypot] = useState("")

  const steps = useMemo(() => visibleSteps(answers), [answers])
  const stepIndex = steps.indexOf(current)
  const total = steps.length
  const progress = Math.round(((stepIndex + 1) / total) * 100)

  function set<K extends keyof DiagnosticAnswers>(key: K, value: DiagnosticAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  function goNext(nextAnswers: DiagnosticAnswers = answers) {
    const list = visibleSteps(nextAnswers)
    const idx = list.indexOf(current)
    const next = list[idx + 1]
    if (next) {
      setHistory((h) => [...h, current])
      setCurrent(next)
    }
  }

  function goBack() {
    setServerError(null)
    setHistory((h) => {
      if (h.length === 0) return h
      const copy = [...h]
      const prev = copy.pop() as StepKey
      setCurrent(prev)
      return copy
    })
  }

  /** Choix unique : mémorise la réponse puis avance automatiquement (1 clic). */
  function selectSingle<K extends keyof DiagnosticAnswers>(key: K, value: DiagnosticAnswers[K]) {
    const next = { ...answers, [key]: value }
    setAnswers(next)
    goNext(next)
  }

  function toggleMulti(key: "goals" | "features", value: string) {
    setAnswers((prev) => {
      const list = prev[key]
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] }
    })
  }

  const contactValid =
    answers.companyName.trim().length >= 2 &&
    answers.firstName.trim().length >= 2 &&
    EMAIL_RE.test(answers.email.trim()) &&
    isReasonablePhone(answers.phone.trim())

  async function handleSubmit() {
    setStatus("submitting")
    setServerError(null)
    const res = await submitDiagnostic({ ...answers, website: honeypot })
    if (res.ok) {
      setStatus("success")
      return
    }
    setStatus("form")
    setServerError(res.error)
    if ("fieldErrors" in res) setFieldErrors(res.fieldErrors)
  }

  /* ------------------------------ Succès ------------------------------ */

  if (status === "success") {
    return (
      <Layout>
        <div className="animate-in fade-in-50 zoom-in-95 duration-500 text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <PartyPopper className="size-8" aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Votre projet est entre de bonnes mains.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
            Nous étudions votre demande et revenons vers vous avec un devis personnalisé sous 24 h.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Première version de votre site sous 7 jours après validation du projet.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Retourner à DetailFlow
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Layout>
    )
  }

  /* ---------------------------- Rendu étapes --------------------------- */

  let content: ReactNode = null

  switch (current) {
    case "hasSite":
      content = (
        <StepShell eyebrow="Votre situation" title="Vous avez déjà un site internet ?">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard label="Oui" icon={Globe} selected={answers.hasSite === "oui"} onClick={() => selectSingle("hasSite", "oui")} />
            <ChoiceCard label="Non" icon={X} selected={answers.hasSite === "non"} onClick={() => selectSingle("hasSite", "non")} />
          </div>
        </StepShell>
      )
      break

    case "siteUrl":
      content = (
        <StepShell title="Quelle est l'adresse de votre site ?" hint="Nous y jetterons un œil avant de vous répondre.">
          <TextStep
            value={answers.siteUrl}
            onChange={(v) => set("siteUrl", v)}
            onContinue={() => goNext()}
            placeholder="exemple.fr"
            inputMode="url"
            canContinue={answers.siteUrl.trim().length > 0}
          />
        </StepShell>
      )
      break

    case "hasDomain":
      content = (
        <StepShell eyebrow="Votre situation" title="Vous avez déjà acheté votre nom de domaine ?">
          <div className="grid gap-3">
            {DOMAIN_ORDER.map((v) => (
              <ChoiceCard
                key={v}
                label={DOMAIN_LABELS[v]}
                selected={answers.hasDomain === v}
                onClick={() => selectSingle("hasDomain", v)}
              />
            ))}
          </div>
        </StepShell>
      )
      break

    case "domain":
      content = (
        <StepShell title="Quel est votre domaine ?">
          <TextStep
            value={answers.domain}
            onChange={(v) => set("domain", v)}
            onContinue={() => goNext()}
            placeholder="mon-entreprise.fr"
            canContinue={answers.domain.trim().length > 0}
          />
        </StepShell>
      )
      break

    case "booking":
      content = (
        <StepShell eyebrow="Votre organisation" title="Comment prenez-vous vos rendez-vous aujourd'hui ?">
          <div className="grid gap-3 sm:grid-cols-2">
            {BOOKING_ORDER.map((v) => (
              <ChoiceCard
                key={v}
                label={BOOKING_LABELS[v]}
                icon={BOOKING_ICONS[v]}
                selected={answers.booking === v}
                onClick={() => selectSingle("booking", v)}
              />
            ))}
          </div>
        </StepShell>
      )
      break

    case "bookingTool":
      content = (
        <StepShell title="Lequel ?" hint="Facultatif — cela nous aide à préparer une éventuelle reprise de données.">
          <TextStep
            value={answers.bookingTool}
            onChange={(v) => set("bookingTool", v)}
            onContinue={() => goNext()}
            placeholder="Nom du logiciel"
            canContinue
            optional
          />
        </StepShell>
      )
      break

    case "goals":
      content = (
        <StepShell
          eyebrow="Vos priorités"
          title="Qu'aimeriez-vous améliorer en priorité ?"
          hint="Plusieurs réponses possibles."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {GOAL_ORDER.map((v) => (
              <ChoiceCard
                key={v}
                label={GOAL_LABELS[v]}
                icon={GOAL_ICONS[v]}
                multi
                selected={answers.goals.includes(v)}
                onClick={() => toggleMulti("goals", v)}
              />
            ))}
          </div>
          <div className="mt-7">
            <PrimaryButton onClick={() => goNext()}>
              Continuer
              <ArrowRight className="size-4" aria-hidden="true" />
            </PrimaryButton>
          </div>
        </StepShell>
      )
      break

    case "features":
      content = (
        <StepShell
          eyebrow="Votre futur site"
          title="Que souhaitez-vous intégrer à votre futur site ?"
          hint="Plusieurs réponses possibles."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURE_ORDER.map((v) => (
              <ChoiceCard
                key={v}
                label={FEATURE_LABELS[v]}
                icon={FEATURE_ICONS[v]}
                multi
                selected={answers.features.includes(v)}
                onClick={() => toggleMulti("features", v)}
              />
            ))}
          </div>
          <div className="mt-7">
            <PrimaryButton onClick={() => goNext()}>
              Continuer
              <ArrowRight className="size-4" aria-hidden="true" />
            </PrimaryButton>
          </div>
        </StepShell>
      )
      break

    case "identity":
      content = (
        <StepShell eyebrow="Votre image" title="Vous avez déjà votre identité visuelle ?">
          <div className="grid gap-3">
            {IDENTITY_ORDER.map((v) => (
              <ChoiceCard
                key={v}
                label={IDENTITY_LABELS[v]}
                icon={IDENTITY_ICONS[v]}
                selected={answers.identity === v}
                onClick={() => selectSingle("identity", v)}
              />
            ))}
          </div>
        </StepShell>
      )
      break

    case "contact":
      content = (
        <StepShell
          eyebrow="Dernière étape"
          title="Où vous envoyer votre diagnostic et votre devis ?"
          hint="Nous ne demandons que l'essentiel."
        >
          <div className="grid gap-4">
            <Field
              label="Nom de l'entreprise"
              value={answers.companyName}
              onChange={(v) => set("companyName", v)}
              error={fieldErrors?.companyName}
              autoComplete="organization"
            />
            <Field
              label="Prénom"
              value={answers.firstName}
              onChange={(v) => set("firstName", v)}
              error={fieldErrors?.firstName}
              autoComplete="given-name"
            />
            <Field
              label="Email"
              type="email"
              value={answers.email}
              onChange={(v) => set("email", v)}
              error={fieldErrors?.email}
              autoComplete="email"
              inputMode="email"
            />
            <Field
              label="Téléphone"
              type="tel"
              value={answers.phone}
              onChange={(v) => set("phone", v)}
              error={fieldErrors?.phone}
              autoComplete="tel"
              inputMode="tel"
            />
            <Field
              label="Quelque chose à ajouter ?"
              value={answers.comment}
              onChange={(v) => set("comment", v)}
              optional
              multiline
            />
            {/* Honeypot anti-spam : masqué, ignoré des lecteurs d'écran. */}
            <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
              <label>
                Ne pas remplir
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="mt-7">
            <PrimaryButton onClick={() => goNext()} disabled={!contactValid}>
              Continuer
              <ArrowRight className="size-4" aria-hidden="true" />
            </PrimaryButton>
          </div>
        </StepShell>
      )
      break

    case "recap": {
      const rows = buildProjectSummary(answers)
      content = (
        <StepShell eyebrow="Récapitulatif" title="Votre projet" hint="Vérifiez avant l'envoi — vous pouvez revenir en arrière.">
          <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {rows.map((r) => (
              <div key={r.label} className="grid gap-1 p-4 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{r.label}</dt>
                <dd className="text-pretty text-sm font-medium text-foreground">{r.value}</dd>
              </div>
            ))}
            <div className="grid gap-1 p-4 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</dt>
              <dd className="text-pretty text-sm font-medium text-foreground">
                {answers.firstName} · {answers.companyName}
                <br />
                <span className="text-muted-foreground">
                  {answers.email} · {answers.phone}
                </span>
              </dd>
            </div>
          </dl>

          {serverError ? (
            <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <div className="mt-7">
            <PrimaryButton onClick={handleSubmit} disabled={status === "submitting"}>
              {status === "submitting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Envoi…
                </>
              ) : (
                <>
                  <Rocket className="size-4" aria-hidden="true" />
                  Envoyer mon projet
                </>
              )}
            </PrimaryButton>
            <p className="mt-3 text-sm font-medium text-foreground">Devis personnalisé sous 24 h</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Première version sous 7 jours après validation du projet.
            </p>
          </div>
        </StepShell>
      )
      break
    }
  }

  return (
    <Layout>
      {/* Progression discrète */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Étape {stepIndex + 1} sur {total}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {history.length > 0 ? (
        <button
          type="button"
          onClick={goBack}
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour
        </button>
      ) : null}

      {content}
    </Layout>
  )
}

/* --------------------------- Mise en page funnel -------------------------- */

function Layout({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-5 py-16 sm:px-6 sm:py-24">
      {children}
    </section>
  )
}

/* -------------------------- Micro-étape « texte » ------------------------- */

function TextStep({
  value,
  onChange,
  onContinue,
  placeholder,
  canContinue,
  optional = false,
  inputMode,
}: {
  value: string
  onChange: (v: string) => void
  onContinue: () => void
  placeholder?: string
  canContinue: boolean
  optional?: boolean
  inputMode?: "url" | "email" | "tel" | "text"
}) {
  return (
    <div className="grid gap-4">
      <input
        type="text"
        inputMode={inputMode}
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && (e as unknown as { keyCode?: number }).keyCode !== 229) {
            e.preventDefault()
            if (canContinue) onContinue()
          }
        }}
        className="h-14 w-full rounded-2xl border border-border bg-card px-5 text-base text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div>
        <PrimaryButton onClick={onContinue} disabled={!canContinue}>
          Continuer
          <ArrowRight className="size-4" aria-hidden="true" />
        </PrimaryButton>
        {optional ? <p className="mt-3 text-xs text-muted-foreground">Vous pouvez passer cette étape.</p> : null}
      </div>
    </div>
  )
}

/* ------------------------------ Champ contact ----------------------------- */

function Field({
  label,
  value,
  onChange,
  type = "text",
  error,
  optional = false,
  multiline = false,
  autoComplete,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string
  optional?: boolean
  multiline?: boolean
  autoComplete?: string
  inputMode?: "email" | "tel" | "text"
}) {
  const base =
    "w-full rounded-xl border bg-card px-4 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {optional ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(facultatif)</span> : null}
      </span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(base, "resize-none py-3", error && "border-destructive")}
        />
      ) : (
        <input
          type={type}
          value={value}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          className={cn(base, "h-12", error ? "border-destructive" : "border-border")}
        />
      )}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  )
}

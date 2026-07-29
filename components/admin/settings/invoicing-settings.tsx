"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Upload, ImageIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveInvoicingSettings } from "@/app/admin/(dashboard)/parametres/actions"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const labelClass = "mb-1.5 block text-sm font-medium text-foreground"
const cardClass = "rounded-2xl border border-border bg-card p-5"

type Props = {
  invoiceCompanyAddress: string
  invoiceSiret: string
  invoiceIban: string
  invoiceBic: string
  vatEnabled: boolean
  vatRate: string
  vatExemptNote: string
  invoicePrefix: string
  invoiceDueDays: number
  invoiceFooterNote: string
  invoiceLegalMentions: string
  invoiceEmailSubject: string
  invoiceEmailBody: string
  invoiceLogoPathname: string | null
}

export function InvoicingSettings(props: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [companyAddress, setCompanyAddress] = useState(props.invoiceCompanyAddress)
  const [siret, setSiret] = useState(props.invoiceSiret)
  const [iban, setIban] = useState(props.invoiceIban)
  const [bic, setBic] = useState(props.invoiceBic)
  const [vatEnabled, setVatEnabled] = useState(props.vatEnabled)
  const [vatRate, setVatRate] = useState(props.vatRate)
  const [vatExemptNote, setVatExemptNote] = useState(props.vatExemptNote)
  const [prefix, setPrefix] = useState(props.invoicePrefix)
  const [dueDays, setDueDays] = useState(String(props.invoiceDueDays))
  const [footerNote, setFooterNote] = useState(props.invoiceFooterNote)
  const [legalMentions, setLegalMentions] = useState(props.invoiceLegalMentions)
  const [emailSubject, setEmailSubject] = useState(props.invoiceEmailSubject)
  const [emailBody, setEmailBody] = useState(props.invoiceEmailBody)
  const [logoPathname, setLogoPathname] = useState<string | null>(props.invoiceLogoPathname)

  async function handleUpload(file: File) {
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/logo", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Échec de l'upload.")
        return
      }
      setLogoPathname(json.pathname)
      setNotice("Logo téléversé. N'oubliez pas d'enregistrer.")
    } catch {
      setError("Échec de l'upload du logo.")
    } finally {
      setUploading(false)
    }
  }

  function save() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveInvoicingSettings({
        invoiceCompanyAddress: companyAddress,
        invoiceSiret: siret,
        invoiceIban: iban,
        invoiceBic: bic,
        vatEnabled,
        vatRate,
        vatExemptNote,
        invoicePrefix: prefix,
        invoiceDueDays: Number.parseInt(dueDays, 10) || 0,
        invoiceFooterNote: footerNote,
        invoiceLegalMentions: legalMentions,
        invoiceEmailSubject: emailSubject,
        invoiceEmailBody: emailBody,
        invoiceLogoPathname: logoPathname,
      })
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setNotice("Paramètres de facturation enregistrés.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Logo</h2>
        <p className="mb-4 text-sm text-muted-foreground">Affiché en haut de vos factures PDF (PNG ou JPG, max 2 Mo).</p>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
            {logoPathname ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/admin/logo?pathname=${encodeURIComponent(logoPathname)}`}
                alt="Logo de l'entreprise"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {logoPathname ? "Remplacer" : "Téléverser"}
            </Button>
            {logoPathname && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setLogoPathname(null)
                  setNotice("Logo retiré. Enregistrez pour confirmer.")
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Retirer
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Coordonnées légales */}
      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-foreground">Coordonnées légales</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Adresse de l'entreprise</label>
            <textarea
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              rows={2}
              placeholder="12 rue des Ateliers, 75000 Paris"
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>SIRET</label>
              <input value={siret} onChange={(e) => setSiret(e.target.value)} className={inputClass} placeholder="123 456 789 00012" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>IBAN</label>
              <input value={iban} onChange={(e) => setIban(e.target.value)} className={inputClass} placeholder="FR76 ..." />
            </div>
            <div>
              <label className={labelClass}>BIC</label>
              <input value={bic} onChange={(e) => setBic(e.target.value)} className={inputClass} placeholder="ABCDFRPP" />
            </div>
          </div>
        </div>
      </div>

      {/* TVA */}
      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-foreground">TVA</h2>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={vatEnabled}
            onChange={(e) => setVatEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Appliquer la TVA sur les factures</span>
        </label>
        {vatEnabled ? (
          <div className="mt-4 max-w-xs">
            <label className={labelClass}>Taux de TVA (%)</label>
            <input value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={inputClass} placeholder="20" inputMode="decimal" />
          </div>
        ) : (
          <div className="mt-4">
            <label className={labelClass}>Mention d'exonération</label>
            <input
              value={vatExemptNote}
              onChange={(e) => setVatExemptNote(e.target.value)}
              className={inputClass}
              placeholder="TVA non applicable, art. 293 B du CGI"
            />
          </div>
        )}
      </div>

      {/* Numérotation & échéance */}
      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-foreground">Numérotation &amp; échéance</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Préfixe de numéro</label>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inputClass} placeholder="FAC" />
            <p className="mt-1 text-xs text-muted-foreground">Exemple : {(prefix || "FAC").toUpperCase()}-{new Date().getFullYear()}-0001</p>
          </div>
          <div>
            <label className={labelClass}>Délai de paiement (jours)</label>
            <input value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={inputClass} inputMode="numeric" placeholder="30" />
          </div>
        </div>
      </div>

      {/* Mentions PDF */}
      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-foreground">Mentions sur la facture</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Note de bas de page</label>
            <input
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              className={inputClass}
              placeholder="Merci de votre confiance."
            />
          </div>
          <div>
            <label className={labelClass}>Mentions légales</label>
            <textarea
              value={legalMentions}
              onChange={(e) => setLegalMentions(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Pénalités de retard : 3× le taux d'intérêt légal. Indemnité forfaitaire de recouvrement : 40 €."
            />
          </div>
        </div>
      </div>

      {/* Email d'envoi */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Email d'envoi</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Variables disponibles : <code className="text-foreground">{"{{client}}"}</code>,{" "}
          <code className="text-foreground">{"{{numero}}"}</code>, <code className="text-foreground">{"{{entreprise}}"}</code>.
        </p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Objet (facultatif)</label>
            <input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className={inputClass}
              placeholder="Facture {{numero}} — {{entreprise}}"
            />
          </div>
          <div>
            <label className={labelClass}>Message (facultatif)</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Bonjour {{client}}, veuillez trouver ci-joint votre facture {{numero}}."
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">{notice}</div>
      )}

      <Button onClick={save} disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Enregistrer la facturation
      </Button>
    </div>
  )
}

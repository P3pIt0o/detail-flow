"use client"

/**
 * L21 — Gestion des offres, équivalences et compléments suggérés.
 * N'appelle QUE les actions serveur L19 (droits, tenant et validation y sont
 * contrôlés). `canEdit` ne fait que masquer les boutons d'écriture.
 */
import { useMemo, useState, useTransition } from "react"
import { AlertTriangle, Copy, Info, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { analyzeTiers, formatEuros, previewPromotion, type ItemRef, type Promotion, type TierWarning } from "@/lib/booking/promotions"
import {
  KIND_LABEL,
  MODES_BY_KIND,
  MODE_LABEL,
  emptyForm,
  formToPayload,
  promotionToForm,
  sampleCartFor,
  tierLabel,
  type PromotionFormState,
  type PromotionPayload,
} from "@/lib/booking/promotions-form"
import {
  deleteEquivalenceAction,
  deletePromotionAction,
  deleteUpsellAction,
  duplicatePromotionAction,
  saveEquivalence,
  savePromotion,
  saveUpsell,
  setEquivalenceActiveAction,
  setPromotionActiveAction,
  setUpsellActiveAction,
  type OfferActionResult,
} from "@/app/admin/(dashboard)/offres/actions"
import type { AdminLists } from "@/lib/booking/promotions-store"

type CatalogItem = { id: number; name: string; priceCents: number }
type Props = {
  lists: AdminLists & { warnings: Record<number, TierWarning[]> }
  canEdit: boolean
  timeZone: string
  services: CatalogItem[]
  options: CatalogItem[]
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/** Alertes de paliers avec les prix min. et max. du catalogue (mêmes que dans le formulaire). */
function warningsFor(p: Promotion, services: CatalogItem[]): TierWarning[] {
  const prices = (p.kind === "multi_services" && p.eligibleServiceIds ? services.filter((s) => p.eligibleServiceIds!.includes(s.id)) : services).map((s) => s.priceCents)
  return analyzeTiers(p, prices.length ? { minEligiblePriceCents: Math.min(...prices), maxEligiblePriceCents: Math.max(...prices) } : {})
}

function toPromotion(p: PromotionPayload): Promotion {
  const base = { id: 1, name: p.name, active: true, priority: 0, startsAt: null, endsAt: null, stackable: p.stackable, stackableWithPromoCode: p.stackableWithPromoCode, tiers: p.tiers }
  if (p.kind === "multi_services") return { ...base, kind: "multi_services", eligibleServiceIds: p.eligibleServiceIds ?? null, includeOptions: p.includeOptions === true }
  if (p.kind === "multi_options") return { ...base, kind: "multi_options", eligibleOptionIds: p.eligibleOptionIds ?? null }
  return { ...base, kind: "service_option", trigger: p.trigger! }
}

export function OffersManager({ lists, canEdit, timeZone, services, options }: Props) {
  if (!lists.ready) {
    return <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Cette fonctionnalité sera bientôt disponible.</p>
  }
  return (
    <Tabs defaultValue="offers" className="w-full">
      <TabsList className="flex-wrap">
        <TabsTrigger value="offers">Offres</TabsTrigger>
        <TabsTrigger value="equivalences">Équivalences</TabsTrigger>
        <TabsTrigger value="upsells">Compléments suggérés</TabsTrigger>
      </TabsList>
      <TabsContent value="offers" className="mt-6">
        <OffersTab lists={lists} canEdit={canEdit} timeZone={timeZone} services={services} options={options} />
      </TabsContent>
      <TabsContent value="equivalences" className="mt-6">
        <EquivalencesTab lists={lists} canEdit={canEdit} services={services} options={options} />
      </TabsContent>
      <TabsContent value="upsells" className="mt-6">
        <UpsellsTab lists={lists} canEdit={canEdit} services={services} options={options} />
      </TabsContent>
    </Tabs>
  )
}

/* -------------------------------------------------------------------------- */
/*  Petits éléments partagés                                                   */
/* -------------------------------------------------------------------------- */

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<OfferActionResult>, onOk?: (r: OfferActionResult) => void) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (r.ok) onOk?.(r)
      else setError([r.error, ...(r.errors ?? [])].join(" "))
    })
  return { pending, error, setError, run }
}

function StatusPill({ active, masculine }: { active: boolean; masculine?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
      {active ? (masculine ? "Actif" : "Active") : masculine ? "Désactivé" : "Désactivée"}
    </span>
  )
}

function Warnings({ warnings }: { warnings: TierWarning[] }) {
  if (!warnings.length) return null
  return (
    <ul className="mt-2 space-y-1">
      {warnings.map((w, i) => (
        <li key={i} className={`flex gap-1.5 text-xs ${w.severity === "warning" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          {w.severity === "warning" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  )
}

function ItemPicker({ items, selected, onChange }: { items: CatalogItem[]; selected: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
      {items.map((it) => (
        <label key={it.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(it.id)}
            onChange={(e) => onChange(e.target.checked ? [...selected, it.id] : selected.filter((x) => x !== it.id))}
          />
          <span className="truncate">{it.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{formatEuros(it.priceCents)}</span>
        </label>
      ))}
      {items.length === 0 && <p className="text-xs text-muted-foreground">Aucun élément dans votre catalogue.</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Offres                                                                     */
/* -------------------------------------------------------------------------- */

function OffersTab({ lists, canEdit, timeZone, services, options }: Omit<Props, "lists"> & { lists: Props["lists"] }) {
  const [editing, setEditing] = useState<{ id?: number; form: PromotionFormState } | null>(null)
  const act = useAction()
  const nameOf = (list: CatalogItem[], ids: number[] | null) => (ids === null ? null : ids.map((id) => list.find((x) => x.id === id)?.name ?? `#${id}`).join(", "))

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing({ form: emptyForm() })}>
            <Plus className="mr-1 h-4 w-4" /> Nouvelle offre
          </Button>
        </div>
      )}
      {act.error && <p className="text-sm text-destructive">{act.error}</p>}
      {lists.promotions.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune offre pour le moment. Les offres sont créées désactivées : activez-les quand elles sont prêtes.
        </p>
      )}
      <div className="space-y-2">
        {lists.promotions.map((p) =>
          "invalid" in p ? (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-card px-4 py-3">
              <div>
                <p className="font-medium">{p.name || "Offre sans nom"}</p>
                <p className="text-xs text-destructive">Offre incomplète : elle n'est jamais appliquée. Supprimez-la puis recréez-la.</p>
              </div>
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label="Supprimer" disabled={act.pending} onClick={() => confirm(`Supprimer « ${p.name} » ?`) && act.run(() => deletePromotionAction(p.id))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ) : (
            <div key={p.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{p.name}</p>
                    <StatusPill active={p.active} />
                    <span className="text-xs text-muted-foreground">{KIND_LABEL[p.kind]}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.tiers.map((t) => tierLabel(p.kind, t)).join(" · ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.kind === "multi_services" && `Prestations : ${nameOf(services, p.eligibleServiceIds) ?? "toutes"}${p.includeOptions ? " (options comprises)" : ""}`}
                    {p.kind === "multi_options" && `Options : ${nameOf(options, p.eligibleOptionIds) ?? "toutes"}`}
                    {p.kind === "service_option" && `${nameOf(services, [p.trigger.serviceId])} + ${nameOf(options, [p.trigger.optionId])}`}
                    {(p.stackable || p.stackableWithPromoCode) && ` · cumulable${p.stackableWithPromoCode ? " avec les codes promo" : ""}`}
                  </p>
                  <Warnings warnings={warningsFor(p, services)} />
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      aria-label={p.active ? "Désactiver" : "Activer"}
                      checked={p.active}
                      disabled={act.pending}
                      onCheckedChange={(v) => act.run(() => setPromotionActiveAction(p.id, v === true))}
                    />
                    <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEditing({ id: p.id, form: promotionToForm(p, timeZone) })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Dupliquer" disabled={act.pending} onClick={() => act.run(() => duplicatePromotionAction(p.id))}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Supprimer"
                      disabled={act.pending}
                      onClick={() => confirm(`Supprimer l'offre « ${p.name} » ?`) && act.run(() => deletePromotionAction(p.id))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>
      {editing && (
        <PromotionDialog
          key={editing.id ?? "new"}
          id={editing.id}
          initial={editing.form}
          services={services}
          options={options}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function PromotionDialog({
  id,
  initial,
  services,
  options,
  onClose,
}: {
  id?: number
  initial: PromotionFormState
  services: CatalogItem[]
  options: CatalogItem[]
  onClose: () => void
}) {
  const [f, setF] = useState<PromotionFormState>(initial)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<TierWarning[]>([])
  const act = useAction()
  const set = (patch: Partial<PromotionFormState>) => setF((x) => ({ ...x, ...patch }))
  const checked = useMemo(() => formToPayload(f), [f])

  // Aperçu et alertes calculés en direct par le moteur (aucun appel serveur).
  const preview = useMemo(() => {
    if (!checked.ok) return null
    const p = toPromotion(checked.payload)
    const cart = sampleCartFor(p, { services, options })
    if (cart.vehicles.length === 0) return null
    const r = previewPromotion(p, cart)
    return {
      text: `Exemple : ${cart.vehicles.length} véhicule${cart.vehicles.length > 1 ? "s" : ""}, ${formatEuros(r.normalCents)} au prix normal → ${formatEuros(r.finalCents)} (−${formatEuros(r.savingsCents)}).`,
      warnings: warningsFor(p, services),
    }
  }, [checked, services, options])

  function submit() {
    if (!checked.ok) return setErrors(checked.errors)
    setErrors([])
    act.run(
      () => savePromotion(checked.payload, id),
      () => {
        // Alertes après enregistrement : mêmes règles, avec les prix du catalogue.
        const after = warningsFor(toPromotion(checked.payload), services)
        if (after.length) setWarnings(after)
        else onClose()
      },
    )
  }

  const tierEditable = f.kind !== "service_option"
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{id ? "Modifier l'offre" : "Nouvelle offre"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="of-name">Nom affiché au client</Label>
            <Input id="of-name" maxLength={120} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. : 2 prestations = −10 %" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="of-kind">Type d'offre</Label>
              <select
                id="of-kind"
                className={selectClass}
                value={f.kind}
                disabled={!!id}
                onChange={(e) => {
                  const kind = e.target.value as PromotionFormState["kind"]
                  setF({ ...emptyForm(kind), name: f.name })
                }}
              >
                {(Object.keys(KIND_LABEL) as PromotionFormState["kind"][]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-mode">Réduction</Label>
              <select
                id="of-mode"
                className={selectClass}
                value={f.mode}
                onChange={(e) => set({ mode: e.target.value as PromotionFormState["mode"], tiers: f.tiers.map((t) => ({ ...t, value: "" })) })}
              >
                {MODES_BY_KIND[f.kind].map((m) => (
                  <option key={m} value={m}>{MODE_LABEL[m]}</option>
                ))}
              </select>
            </div>
          </div>

          {f.kind === "service_option" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="of-svc">Prestation</Label>
                <select id="of-svc" className={selectClass} value={f.trigger.serviceId ?? ""} onChange={(e) => set({ trigger: { ...f.trigger, serviceId: e.target.value ? Number(e.target.value) : null } })}>
                  <option value="">Choisir…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-opt">Option</Label>
                <select id="of-opt" className={selectClass} value={f.trigger.optionId ?? ""} onChange={(e) => set({ trigger: { ...f.trigger, optionId: e.target.value ? Number(e.target.value) : null } })}>
                  <option value="">Choisir…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="of-applies">La réduction porte sur</Label>
                <select id="of-applies" className={selectClass} value={f.trigger.appliesTo} onChange={(e) => set({ trigger: { ...f.trigger, appliesTo: e.target.value as "service" | "option" | "both" } })}>
                  <option value="option">l'option</option>
                  <option value="service">la prestation</option>
                  <option value="both">la prestation et l'option</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch id="of-all" checked={f.allItems} onCheckedChange={(v) => set({ allItems: v === true })} />
                <Label htmlFor="of-all">{f.kind === "multi_services" ? "Toutes les prestations" : "Toutes les options"}</Label>
              </div>
              {!f.allItems && (
                <ItemPicker
                  items={f.kind === "multi_services" ? services : options}
                  selected={f.kind === "multi_services" ? f.serviceIds : f.optionIds}
                  onChange={(ids) => set(f.kind === "multi_services" ? { serviceIds: ids } : { optionIds: ids })}
                />
              )}
              {f.kind === "multi_services" && (
                <div className="flex items-center gap-2">
                  <Switch id="of-incl" checked={f.includeOptions} onCheckedChange={(v) => set({ includeOptions: v === true })} />
                  <Label htmlFor="of-incl">Appliquer aussi la réduction aux options (elles ne comptent pas dans le nombre)</Label>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{tierEditable ? "Paliers" : "Valeur"}</Label>
            {f.tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                {tierEditable && (
                  <>
                    <Input
                      aria-label={`Nombre minimal, palier ${i + 1}`}
                      className="w-20"
                      inputMode="numeric"
                      value={t.minQuantity}
                      onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, minQuantity: e.target.value } : x)) })}
                    />
                    <span className="text-sm text-muted-foreground">{f.kind === "multi_services" ? "prestations ou plus" : "options ou plus"}</span>
                  </>
                )}
                <Input
                  aria-label={`Valeur, palier ${i + 1}`}
                  className="w-28"
                  inputMode="decimal"
                  value={t.value}
                  onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                />
                <span className="text-sm text-muted-foreground">{f.mode === "percent" ? "%" : f.mode === "amount" ? "€ de réduction" : "€ au total"}</span>
                {tierEditable && f.tiers.length > 1 && (
                  <Button variant="ghost" size="icon" aria-label="Retirer le palier" onClick={() => set({ tiers: f.tiers.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {tierEditable && f.tiers.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ tiers: [...f.tiers, { minQuantity: String((Number(f.tiers.at(-1)?.minQuantity) || 1) + 1), value: "" }] })}
              >
                <Plus className="mr-1 h-4 w-4" /> Ajouter un palier
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="of-start">Début (facultatif)</Label>
              <Input id="of-start" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-end">Fin incluse (facultatif)</Label>
              <Input id="of-end" type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch id="of-stack" checked={f.stackable} onCheckedChange={(v) => set({ stackable: v === true })} />
              <Label htmlFor="of-stack">Cumulable avec mes autres offres cumulables</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="of-code" checked={f.stackableWithPromoCode} onCheckedChange={(v) => set({ stackableWithPromoCode: v === true })} />
              <Label htmlFor="of-code">Cumulable avec les codes promo</Label>
            </div>
            <p className="text-xs text-muted-foreground">Par défaut, votre client reçoit automatiquement la réduction la plus avantageuse, sans cumul.</p>
          </div>

          {preview && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p>{preview.text}</p>
              <Warnings warnings={preview.warnings} />
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-300 px-3 py-2 text-sm">
              <p className="font-medium">Offre enregistrée. Points à vérifier :</p>
              <Warnings warnings={warnings} />
            </div>
          )}
          {[...errors, ...(act.error ? [act.error] : [])].map((e, i) => (
            <p key={i} className="text-sm text-destructive">{e}</p>
          ))}
        </div>
        <DialogFooter>
          {warnings.length > 0 ? (
            <Button onClick={onClose}>Fermer</Button>
          ) : (
            <Button onClick={submit} disabled={act.pending}>
              {act.pending ? "Enregistrement…" : id ? "Enregistrer" : "Créer (désactivée)"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*  Équivalences                                                               */
/* -------------------------------------------------------------------------- */

function refLabel(ref: ItemRef, services: CatalogItem[], options: CatalogItem[]): string {
  const list = ref.type === "service" ? services : options
  const name = list.find((x) => x.id === ref.id)?.name ?? `#${ref.id}`
  return `${ref.type === "service" ? "Prestation" : "Option"} « ${name} »`
}

function refValue(ref: ItemRef | null) {
  return ref ? `${ref.type}:${ref.id}` : ""
}
function parseRef(v: string): ItemRef | null {
  const [type, id] = v.split(":")
  return (type === "service" || type === "option") && Number(id) > 0 ? { type, id: Number(id) } : null
}

function RefSelect({ id, value, onChange, services, options }: { id: string; value: ItemRef | null; onChange: (r: ItemRef | null) => void; services: CatalogItem[]; options: CatalogItem[] }) {
  return (
    <select id={id} className={selectClass} value={refValue(value)} onChange={(e) => onChange(parseRef(e.target.value))}>
      <option value="">Choisir…</option>
      <optgroup label="Prestations">
        {services.map((s) => <option key={`s${s.id}`} value={`service:${s.id}`}>{s.name}</option>)}
      </optgroup>
      <optgroup label="Options">
        {options.map((o) => <option key={`o${o.id}`} value={`option:${o.id}`}>{o.name}</option>)}
      </optgroup>
    </select>
  )
}

function EquivalencesTab({ lists, canEdit, services, options }: Omit<Props, "timeZone">) {
  const [open, setOpen] = useState(false)
  const [a, setA] = useState<ItemRef | null>(null)
  const [b, setB] = useState<ItemRef | null>(null)
  const [reason, setReason] = useState("")
  const act = useAction()
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Deux éléments qui correspondent au même traitement (ex. une prestation et une option « rénovation des phares »). Sur un même véhicule, votre client n'est facturé qu'une fois. Aucune règle n'est créée automatiquement.
      </p>
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nouvelle équivalence
          </Button>
        </div>
      )}
      {act.error && <p className="text-sm text-destructive">{act.error}</p>}
      {lists.equivalences.length === 0 && <p className="text-sm text-muted-foreground">Aucune équivalence.</p>}
      <div className="space-y-2">
        {lists.equivalences.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{refLabel(r.a, services, options)} = {refLabel(r.b, services, options)}</p>
                <StatusPill active={r.active} />
              </div>
              <p className="text-xs text-muted-foreground">Motif : {r.reason}</p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  aria-label="Activer"
                  checked={r.active}
                  disabled={act.pending}
                  onCheckedChange={(v) => act.run(() => setEquivalenceActiveAction(r.id, v === true))}
                />
                <Button variant="ghost" size="icon" aria-label="Supprimer" disabled={act.pending} onClick={() => confirm("Supprimer cette équivalence ?") && act.run(() => deleteEquivalenceAction(r.id))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle équivalence</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="eq-a">Premier élément</Label>
                <RefSelect id="eq-a" value={a} onChange={setA} services={services} options={options} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eq-b">Second élément</Label>
                <RefSelect id="eq-b" value={b} onChange={setB} services={services} options={options} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eq-reason">Motif (affiché au client)</Label>
                <Input id="eq-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : même rénovation des phares" />
              </div>
              <p className="text-xs text-muted-foreground">L'équivalence est créée désactivée : activez-la ensuite.</p>
              {act.error && <p className="text-sm text-destructive">{act.error}</p>}
            </div>
            <DialogFooter>
              <Button
                disabled={act.pending || !a || !b || !reason.trim()}
                onClick={() =>
                  act.run(
                    () => saveEquivalence({ a: a!, b: b!, reason }),
                    () => {
                      setOpen(false)
                      setA(null)
                      setB(null)
                      setReason("")
                    },
                  )
                }
              >
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Compléments suggérés                                                       */
/* -------------------------------------------------------------------------- */

function UpsellsTab({ lists, canEdit, services, options }: Omit<Props, "timeZone">) {
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState<number | null>(null)
  const [picked, setPicked] = useState<ItemRef[]>([])
  const [message, setMessage] = useState("")
  const act = useAction()
  const toggle = (r: ItemRef) =>
    setPicked((x) => (x.some((y) => y.type === r.type && y.id === r.id) ? x.filter((y) => !(y.type === r.type && y.id === r.id)) : x.length < 5 ? [...x, r] : x))
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Proposés au client quand il choisit une prestation (2 au plus à l'écran). Jamais ajoutés automatiquement.</p>
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nouveau complément
          </Button>
        </div>
      )}
      {act.error && <p className="text-sm text-destructive">{act.error}</p>}
      {lists.upsells.length === 0 && <p className="text-sm text-muted-foreground">Aucun complément suggéré.</p>}
      <div className="space-y-2">
        {lists.upsells.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Avec {refLabel({ type: "service", id: u.whenServiceId }, services, options)}</p>
                <StatusPill active={u.active} masculine />
              </div>
              <p className="text-xs text-muted-foreground">
                Suggérer : {u.suggest.map((r) => refLabel(r, services, options)).join(", ")}
                {u.message ? ` · « ${u.message} »` : ""}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                <Switch aria-label="Activer" checked={u.active} disabled={act.pending} onCheckedChange={(v) => act.run(() => setUpsellActiveAction(u.id, v === true))} />
                <Button variant="ghost" size="icon" aria-label="Supprimer" disabled={act.pending} onClick={() => confirm("Supprimer ce complément ?") && act.run(() => deleteUpsellAction(u.id))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nouveau complément suggéré</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="up-when">Quand le client choisit</Label>
                <select id="up-when" className={selectClass} value={when ?? ""} onChange={(e) => setWhen(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choisir une prestation…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Lui proposer (5 au plus)</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {[...services.filter((s) => s.id !== when).map((s) => ({ ref: { type: "service" as const, id: s.id }, name: s.name })), ...options.map((o) => ({ ref: { type: "option" as const, id: o.id }, name: o.name }))].map(({ ref, name }) => (
                    <label key={`${ref.type}${ref.id}`} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={picked.some((y) => y.type === ref.type && y.id === ref.id)} onChange={() => toggle(ref)} />
                      <span className="truncate">{name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{ref.type === "service" ? "prestation" : "option"}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="up-msg">Message (facultatif)</Label>
                <Input id="up-msg" maxLength={140} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex. : Profitez-en pour rénover vos phares" />
              </div>
              <p className="text-xs text-muted-foreground">Le complément est créé désactivé : activez-le ensuite.</p>
              {act.error && <p className="text-sm text-destructive">{act.error}</p>}
            </div>
            <DialogFooter>
              <Button
                disabled={act.pending || when == null || picked.length === 0}
                onClick={() =>
                  act.run(
                    () => saveUpsell({ whenServiceId: when!, suggest: picked, message: message || null }),
                    () => {
                      setOpen(false)
                      setWhen(null)
                      setPicked([])
                      setMessage("")
                    },
                  )
                }
              >
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

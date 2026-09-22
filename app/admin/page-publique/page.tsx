import type { Metadata } from "next"
import { Globe, Info } from "lucide-react"
import { requireCompanyMember } from "@/lib/admin"
import { getPublicPageConfigRow } from "@/lib/public-page/config"
import { publicPagePath } from "@/lib/tenant-shared"
import { ConfigEditor } from "@/components/public-page/config-editor"

export const metadata: Metadata = { title: "Page publique" }

/**
 * ÉDITEUR DE LA PAGE PUBLIQUE (LOT 2).
 *
 * Configure la présence publique paramétrable (`public_page_config`) du tenant
 * courant : apparence, sections affichées, informations pratiques, SEO,
 * publication — avec aperçu en direct desktop/mobile.
 *
 * ISOLATION : `requireCompanyMember()` résout le tenant côté serveur et vérifie
 * l'appartenance. La lecture de config est scoping `companyId`. Les sites
 * personnalisés (customSiteKey) ne sont PAS éditables ici : ils conservent leur
 * rendu dédié historique et voient un message explicite.
 */
export default async function PagePubliquePage() {
  const ctx = await requireCompanyMember()
  const { tenant } = ctx

  // Garde sites personnalisés : Spirit ACS, Rozan, Cleanyzer et tout futur site
  // à rendu dédié ne sont jamais migrés vers ce configurateur.
  if (tenant.customSiteKey) {
    return (
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <Globe className="size-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Page publique</h1>
        </header>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
          <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="text-sm text-muted-foreground text-pretty">
            <p className="mb-1 font-medium text-foreground">Site personnalisé</p>
            <p>
              Votre site utilise un rendu sur-mesure. Sa présentation est gérée séparément et
              n&apos;est pas modifiable depuis ce configurateur, afin d&apos;en préserver
              l&apos;intégrité.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const row = await getPublicPageConfigRow(tenant.id)
  const previewPath = publicPagePath(tenant.slug)

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center gap-3">
        <Globe className="size-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Page publique</h1>
          <p className="text-sm text-muted-foreground">
            Personnalisez la présentation de votre page publique et prévisualisez-la en direct.
          </p>
        </div>
      </header>

      <ConfigEditor
        slug={tenant.slug}
        previewPath={previewPath}
        initial={{
          layoutVariant: row?.layoutVariant ?? null,
          heroImageUrl: row?.heroImageUrl ?? null,
          heroImagePosition: row?.heroImagePosition ?? null,
          heroOverlay: row?.heroOverlay ?? null,
          accentPrimary: row?.accentPrimary ?? tenant.brandPrimary ?? null,
          accentSecondary: row?.accentSecondary ?? tenant.brandSecondary ?? null,
          theme: (row?.theme as "light" | "dark" | "auto") ?? "auto",
          showGallery: row?.showGallery ?? true,
          showReviews: row?.showReviews ?? true,
          showAbout: row?.showAbout ?? true,
          interventionZone: row?.interventionZone ?? null,
          depositRuleText: row?.depositRuleText ?? null,
          cancellationPolicy: row?.cancellationPolicy ?? null,
          seoIndexable: row?.seoIndexable ?? false,
          isPublished: Boolean(row?.publishedAt),
        }}
      />
    </div>
  )
}

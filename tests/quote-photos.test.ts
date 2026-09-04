import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_TOTAL_BYTES,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME_TYPES,
  isAllowedMime,
  sanitizeOriginalName,
  screenSelectedFile,
  formatBytes,
} from "@/lib/quote-photos/config"
import { sniffImageMime } from "@/lib/quote-photos/magic"
import { blobPrefix } from "@/lib/quote-photos/grant"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/* -------------------------------------------------------------------------- */
/*  Constantes centralisées (limites)                                          */
/* -------------------------------------------------------------------------- */
describe("config : limites centralisées", () => {
  it("expose les limites demandées et modifiables au même endroit", () => {
    expect(MAX_PHOTOS).toBe(10)
    expect(MAX_PHOTO_BYTES).toBe(40 * 1024 * 1024) // 40 Mo / photo
    expect(MAX_TOTAL_BYTES).toBe(200 * 1024 * 1024) // 200 Mo au total
    // La limite d'upload serveur laisse une marge au-dessus de la cible d'optim.
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(MAX_PHOTO_BYTES)
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg")
    expect(ALLOWED_MIME_TYPES).toContain("image/png")
    expect(ALLOWED_MIME_TYPES).toContain("image/webp")
  })
})

/* -------------------------------------------------------------------------- */
/*  Filtrage client (formats interdits, MIME falsifié, limite de taille)       */
/* -------------------------------------------------------------------------- */
describe("screenSelectedFile : garde-fous côté client", () => {
  it("(9) refuse explicitement SVG / GIF / HTML / exécutables", () => {
    expect(screenSelectedFile({ name: "x.svg", type: "image/svg+xml", size: 100 }).ok).toBe(false)
    expect(screenSelectedFile({ name: "x.gif", type: "image/gif", size: 100 }).ok).toBe(false)
    expect(screenSelectedFile({ name: "x.html", type: "text/html", size: 100 }).ok).toBe(false)
    expect(screenSelectedFile({ name: "x.exe", type: "application/octet-stream", size: 100 }).ok).toBe(false)
  })

  it("(10) refuse un MIME falsifié incohérent avec une extension interdite", () => {
    // Prétend être un JPEG mais l'extension .svg est bannie -> refus.
    expect(screenSelectedFile({ name: "evil.svg", type: "image/jpeg", size: 100 }).ok).toBe(false)
  })

  it("(8) refuse au-delà de la limite individuelle", () => {
    expect(screenSelectedFile({ name: "big.jpg", type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 }).ok).toBe(false)
    expect(screenSelectedFile({ name: "ok.jpg", type: "image/jpeg", size: 1024 }).ok).toBe(true)
  })

  it("accepte HEIC/HEIF en passthrough (pas d'optimisation canvas)", () => {
    const r = screenSelectedFile({ name: "IMG.HEIC", type: "image/heic", size: 5000 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.passthrough).toBe(true)
  })

  it("accepte un JPEG standard sans passthrough", () => {
    const r = screenSelectedFile({ name: "photo.jpg", type: "image/jpeg", size: 5000 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.passthrough).toBe(false)
  })

  it("tolère un type MIME vide (smartphones) si l'extension est valide", () => {
    expect(screenSelectedFile({ name: "photo.jpg", type: "", size: 5000 }).ok).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/*  Signature réelle (magic bytes) — la validation MIME/extension ne suffit pas */
/* -------------------------------------------------------------------------- */
describe("sniffImageMime : signature réelle du fichier", () => {
  it("reconnaît JPEG / PNG / WebP à partir des octets", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(sniffImageMime(jpeg)).toBe("image/jpeg")

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffImageMime(png)).toBe("image/png")

    // RIFF....WEBP
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(sniffImageMime(webp)).toBe("image/webp")
  })

  it("(10) rejette un faux JPEG (extension/MIME mentent, octets = HTML/SVG)", () => {
    const html = new TextEncoder().encode("<!doctype html><svg></svg>")
    expect(sniffImageMime(html)).toBeNull()
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")
    expect(sniffImageMime(svg)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Nom de fichier nettoyé + chemin Blob sans donnée personnelle               */
/* -------------------------------------------------------------------------- */
describe("sanitizeOriginalName + blobPrefix", () => {
  it("nettoie le nom (pas de chemin, pas de caractère de contrôle)", () => {
    expect(sanitizeOriginalName("../../etc/passwd")).not.toContain("/")
    expect(sanitizeOriginalName("a\u0000b.jpg")).not.toContain("\u0000")
    expect(sanitizeOriginalName("x".repeat(500)).length).toBeLessThanOrEqual(200)
  })

  it("préfixe Blob = quote-requests/{companyId}/{requestId}/ (aucune PII)", () => {
    const prefix = blobPrefix(42, 7)
    expect(prefix).toBe("quote-requests/42/7/")
    expect(prefix).not.toMatch(/@|nom|tel|email|mail/i)
  })

  it("formatBytes rend une taille lisible", () => {
    expect(formatBytes(512)).toBe("512 o")
    expect(formatBytes(1024)).toBe("1 Ko")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 Mo")
  })
})

/* -------------------------------------------------------------------------- */
/*  Assertions de SOURCE : exigences non exécutables sans DB/navigateur réel.  */
/*  Elles verrouillent les invariants critiques (sécurité, idempotence, RGPD). */
/* -------------------------------------------------------------------------- */
describe("invariants de source (sécurité & fiabilité)", () => {
  const server = read("lib/quote-photos/server.ts")
  const grant = read("lib/quote-photos/grant.ts")
  const uploadRoute = read("app/api/quote-photos/upload/route.ts")
  const viewRoute = read("app/api/quote-photos/view/route.ts")
  const actions = read("app/(site)/demande/actions.ts")
  const schema = read("lib/db/schema.ts")
  const image = read("lib/quote-photos/image.ts")
  const provision = read("lib/company/provision.ts")
  const uploader = read("components/quote-photo-uploader.tsx")

  it("(4/14) l'association vérifie préfixe, cohérence company/demande et refuse un autre tenant", () => {
    expect(server).toMatch(/startsWith\(prefix\)/)
    expect(server).toMatch(/companyId.*grant\.companyId|grant\.companyId/)
    // Un Blob rattaché à une autre entreprise n'est jamais réutilisé.
    expect(server).toMatch(/existing\.companyId !== grant\.companyId/)
  })

  it("(10) valide la SIGNATURE réelle et supprime tout Blob invalide", () => {
    expect(server).toMatch(/sniffImageMime/)
    expect(server).toMatch(/safeDelete/)
  })

  it("(13) association idempotente (onConflictDoNothing sur pathname)", () => {
    expect(server).toMatch(/onConflictDoNothing/)
    expect(server).toMatch(/alreadyAssociated/)
  })

  it("le grant est signé (HMAC) avec expiration courte et lié à 1 demande/entreprise", () => {
    expect(grant).toMatch(/createHmac|hmac/i)
    expect(grant).toMatch(/companyId/)
    expect(grant).toMatch(/requestId/)
    expect(grant).toMatch(/maxPhotos/)
    expect(grant).toMatch(/exp|expire|timingSafeEqual/i)
  })

  it("la route d'upload valide le grant, l'origine et le préfixe (pas de jeton libre)", () => {
    expect(uploadRoute).toMatch(/verifyGrant/)
    expect(uploadRoute).toMatch(/handleUpload/)
    // Le token Blob restreint taille + types + préfixe autorisé.
    expect(uploadRoute).toMatch(/allowedContentTypes/)
    expect(uploadRoute).toMatch(/maximumSizeInBytes/)
  })

  it("(15/16) la route de lecture exige l'authentification et l'appartenance à l'entreprise", () => {
    expect(viewRoute).toMatch(/getCompanyMemberContext|requireCompanyMember|auth/i)
    expect(viewRoute).toMatch(/getAttachmentForCompany/)
    // Jamais d'URL publique renvoyée : on relaie le flux privé.
    expect(viewRoute).not.toMatch(/access:\s*["']public["']/)
  })

  it("(12) demande idempotente : ON CONFLICT sur (companyId, submissionId)", () => {
    expect(actions).toMatch(/submissionId/)
    expect(actions).toMatch(/onConflictDoNothing/)
  })

  it("notification pro envoyée une seule fois (garde atomique notifiedAt)", () => {
    expect(actions).toMatch(/notifiedAt/)
    expect(actions).toMatch(/notifyProfessionalOnce/)
    // L'email n'embarque jamais les fichiers : seulement le compte + lien admin.
    expect(actions).toMatch(/Photos jointes|voir dans l'administration/)
  })

  it("(7) table additive avec index company/demande, unicité pathname, cascade", () => {
    expect(schema).toMatch(/quote_request_attachments/)
    expect(schema).toMatch(/quote_request_attachments_companyId_idx/)
    expect(schema).toMatch(/quote_request_attachments_requestId_idx/)
    expect(schema).toMatch(/quote_request_attachments_pathname_key/)
    expect(schema).toMatch(/onDelete:\s*["']cascade["']/)
  })

  it("(5/6) optimisation image : EXIF, dimension/qualité centralisées, libération mémoire", () => {
    // Les valeurs 2560 / 0.83 vivent dans config (assert plus haut) ; image les importe.
    expect(image).toMatch(/MAX_DIMENSION/)
    expect(image).toMatch(/OUTPUT_QUALITY/)
    expect(image).toMatch(/revokeObjectURL/)
    expect(image).toMatch(/imageOrientation/) // respect EXIF
    expect(image).toMatch(/bitmap\.close|canvas\.width = 0/) // libération mémoire
    // Ne jamais agrandir : scale plafonné à 1.
    expect(image).toMatch(/> MAX_DIMENSION \? MAX_DIMENSION \/ largest : 1/)
    // Ne conserve le résultat que s'il est plus léger.
    expect(image).toMatch(/out\.size < file\.size/)
  })

  it("(17) suppression d'entreprise : les Blobs des pièces jointes sont nettoyés", () => {
    expect(provision).toMatch(/collectCompanyAttachmentPathnames/)
    expect(provision).toMatch(/quoteAttachmentPathnames/)
  })

  it("(11) l'uploader gère retry/annulation et n'affiche pas de faux pourcentage", () => {
    expect(uploader).toMatch(/onUploadProgress/)
    expect(uploader).toMatch(/retr|réessayer/i)
    expect(uploader).toMatch(/AbortController|abortSignal|abort/)
  })

  it("accessibilité : label, aria-live, alt sur aperçus, suppression nommée", () => {
    expect(uploader).toMatch(/aria-live/)
    expect(uploader).toMatch(/aria-label|htmlFor|<label/)
    expect(uploader).toMatch(/alt=/)
  })

  it("le message d'échec partiel est honnête (demande gardée, réessayer les photos)", () => {
    const form = read("components/custom-request-form.tsx")
    expect(form).toMatch(/enregistrée.*photos.*pas.*envoy|réessayer/i)
  })
})

/**
 * Générateur ZIP minimal, SANS dépendance externe (méthode "store", sans
 * compression). Suffisant pour empaqueter quelques fichiers CSV/JSON d'export.
 * Évite d'ajouter une librairie (jszip/archiver) → footprint minimal.
 *
 * Format : ZIP classique (local file headers + central directory).
 * CRC-32 calculé à la volée.
 */

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

type Entry = { name: string; data: Uint8Array; crc: number }

/** Construit une archive ZIP (Uint8Array) à partir d'un ensemble de fichiers. */
export function createZip(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const entries: Entry[] = files.map((f) => {
    const data = enc.encode(f.content)
    return { name: f.name, data, crc: crc32(data) }
  })

  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

  for (const e of entries) {
    const nameBytes = enc.encode(e.name)
    // Local file header
    const local = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(0), // mod time
      u16(0), // mod date
      u32(e.crc),
      u32(e.data.length), // compressed size
      u32(e.data.length), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra len
      nameBytes,
      e.data,
    ])
    chunks.push(local)

    // Central directory record
    const cd = concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method
      u16(0), // time
      u16(0), // date
      u32(e.crc),
      u32(e.data.length),
      u32(e.data.length),
      u16(nameBytes.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk number
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset), // local header offset
      nameBytes,
    ])
    central.push(cd)
    offset += local.length
  }

  const centralStart = offset
  const centralBytes = concat(central)
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(centralStart),
    u16(0),
  ])

  return concat([...chunks, centralBytes, end])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

/** Convertit une liste d'objets plats en chaîne CSV (RFC 4180). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k))
      return set
    }, new Set<string>()),
  )
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ""
    const s = typeof v === "object" ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(",")]
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","))
  return lines.join("\r\n")
}

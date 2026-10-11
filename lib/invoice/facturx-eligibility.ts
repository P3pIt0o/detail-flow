import { buildFacturXXml } from "./facturx/xml"
import type {
  BuildFacturXXmlInput,
  FacturXErrorCode,
} from "./facturx/types"

export type FacturXReadiness =
  | { eligible: true }
  | { eligible: false; codes: FacturXErrorCode[] }

export function checkFacturXReadiness(
  input: BuildFacturXXmlInput
): FacturXReadiness {
  if (input.invoice.documentType !== "invoice") {
    return {
      eligible: false,
      codes: ["UNSUPPORTED_DOCUMENT_TYPE"],
    }
  }

  const result = buildFacturXXml(input)

  if (result.ok) {
    return { eligible: true }
  }

  return {
    eligible: false,
    codes: [...new Set(result.errors.map(e => e.code))],
  }
}

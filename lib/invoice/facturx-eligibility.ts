import { buildFacturXXml } from "./facturx/xml"
import type {
  BuildFacturXXmlInput,
  FacturXError,
  FacturXErrorCode,
} from "./facturx/types"

export type FacturXReadiness =
  | { eligible: true }
  | { eligible: false; codes: FacturXErrorCode[]; errors: FacturXError[] }

/**
 * Éligibilité Factur-X d'une facture ou d'un avoir émis : c'est le générateur
 * XML qui tranche (fail-closed). Un avoir sans échéance est refusé par le
 * générateur (CREDIT_NOTE_SETTLEMENT_UNDECIDED) : aucune règle de règlement
 * n'est inventée ici.
 */
export function checkFacturXReadiness(
  input: BuildFacturXXmlInput
): FacturXReadiness {
  const result = buildFacturXXml(input)

  if (result.ok) {
    return { eligible: true }
  }

  return {
    eligible: false,
    codes: [...new Set(result.errors.map((e) => e.code))],
    errors: result.errors,
  }
}

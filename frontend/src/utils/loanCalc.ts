// Central loan calculation — used everywhere consistently
// principalPaid field stores PRINCIPAL REMAINING (from bank statement)
// If entered → exact figures. Otherwise → proportional estimate.

export function calcLoanSplit(
  amount: number,          // total principal
  emi: number,             // monthly EMI
  tenure: number,          // total months
  paidMonths: number,      // months paid so far
  principalRemaining?: number // from bank statement (optional)
) {
  const totalInterest = Math.max(0, emi * tenure - amount)
  const totalPaid = paidMonths * emi

  if (principalRemaining != null && principalRemaining > 0) {
    // Source of truth: bank statement principal remaining — but you can never owe more principal than the instalments
    // still to come will repay. If the statement figure is higher (stale entry, EMI count drifted), the closer, EMI-based
    // number wins: principal left = EMIs left × EMI, and no interest is left to pay.
    const emisLeft   = Math.max(0, tenure - paidMonths)
    const emiCap     = emi > 0 && tenure > 0 ? Math.round(emi * emisLeft) : Infinity
    const princLeft  = Math.min(principalRemaining, emiCap)
    const capped     = princLeft < principalRemaining
    const principalPaid = Math.max(0, amount - princLeft)
    const intPaid    = Math.max(0, totalPaid - principalPaid)
    const intLeft    = Math.max(0, totalInterest - intPaid)
    return { totalInterest, totalPaid, principalPaid, intPaid, intLeft, princLeft, fromStatement: true, capped, statementPrincipal: principalRemaining }
  } else {
    // Proportional estimate
    const princLeft      = tenure > 0 ? Math.round(amount * (Math.max(0, tenure - paidMonths) / tenure)) : 0
    const principalPaid  = Math.max(0, amount - princLeft)
    const intPaid        = tenure > 0 ? Math.round(totalInterest * (paidMonths / tenure)) : 0
    const intLeft        = Math.max(0, totalInterest - intPaid)
    return { totalInterest, totalPaid, principalPaid, intPaid, intLeft, princLeft, fromStatement: false, capped: false, statementPrincipal: undefined as number | undefined }
  }
}

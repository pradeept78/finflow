import { describe, it, expect } from 'vitest'
import { calcLoanSplit } from '../loanCalc'

describe('calcLoanSplit: statement principal is capped by the EMIs still to pay', () => {
  it('uses EMIs left × EMI when the statement principal is higher', () => {
    const sp = calcLoanSplit(189784, 7834, 36, 32, 40000)
    expect(sp.princLeft).toBe(31336)
    expect(sp.intLeft).toBe(0)
    expect(sp.capped).toBe(true)
  })
  it('keeps the statement figure when it is within the EMIs left', () => {
    const sp = calcLoanSplit(189784, 7834, 36, 20, 90000)
    expect(sp.princLeft).toBe(90000)
    expect(sp.capped).toBe(false)
  })
})

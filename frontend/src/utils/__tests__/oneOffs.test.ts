import { describe, it, expect } from 'vitest'
import { oneOffsIn } from '../oneOffs'
import { advanceAll } from '../projection'
const at = (m: number, day = 15) => { const d = new Date(); d.setMonth(d.getMonth() + m, day); return d.toISOString().slice(0, 10) }
describe('oneOffsIn', () => {
  it('lists one-time items inside the window only', () => {
    const r = oneOffsIn([{ id: 1, label: 'Trip', frequency: 'One-time', amount: 30000, startDate: at(2) }, { id: 2, label: 'Far', frequency: 'One-time', amount: 5, startDate: at(9) }, { id: 3, label: 'Rent', frequency: 'Monthly', amount: 9, startDate: at(2) }], [{ id: 4, name: 'Term', frequency: 'One-time', premium: 8000, startDate: at(1) }], 3)
    expect(r.map(x => x.label)).toEqual(['Term', 'Trip'])
    expect(oneOffsIn([], [], 0)).toEqual([])
  })
})
describe('advanceAll options', () => {
  const base = { loans: [], personal: [], expenses: [], insurance: [], cards: [{ id: 1, outstanding: 5000, spends: [{ amount: 900 }], emis: [] }], savings: [{ id: 1, name: 'RD', monthly: 1000, startDate: at(-3), tenure: 24 }], investments: [{ id: 1, name: 'SIP', monthly: 2000, totalInvested: 6000, currentValue: 6500 }] }
  it('typical spend keeps the cycle spends', () => {
    expect((advanceAll(base as any, 3).cards[0] as any).spends).toEqual([])
    expect((advanceAll(base as any, 3, { typicalSpend: true }).cards[0] as any).spends).toHaveLength(1)
  })
  it('no deposits freezes savings and SIPs', () => {
    const a = advanceAll(base as any, 3, { noDeposits: true })
    expect((a.savings[0] as any).monthly).toBe(0)
    expect((a.savings[0] as any).currentCorpus).toBeGreaterThan(0)
    expect((a.investments[0] as any).monthly).toBe(0)
    expect((a.investments[0] as any).currentValue).toBe(6500)
    expect((advanceAll(base as any, 3).investments[0] as any).currentValue).toBe(6500 + 6000)
  })
})

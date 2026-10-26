import { getEff } from './format'

export interface FriendShare {
  name: string
  /** Everything this friend still owes you: unsettled spends + unpaid instalments of their EMIs. */
  amount: number
  /** …of which unpaid EMI instalments, and of which one-off spends. */
  emi: number
  spends: number
  /** What the bank debits you each month for their running EMIs (they repay you). */
  perMonth: number
  items: number
  oldest?: string
}
export interface FriendsOwe { total: number; items: number; perMonth: number; people: FriendShare[]; oldest?: string }

/**
 * What friends still owe YOU for things that sit on your cards: their unsettled spends plus the unpaid instalments of
 * their EMIs (instalments left × EMI). It is money the bank will charge you and they will pay back — not your debt,
 * and not counted in what you owe, so without a line like this it simply disappears from view.
 */
export function friendsOwe(cards: any[] = []): FriendsOwe {
  const by = new Map<string, FriendShare>()
  const older = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b)
  const note = (name: string, kind: 'emi' | 'spend', amt: number, monthly: number, date?: string) => {
    if (!(amt > 0)) return
    const f = by.get(name) ?? { name, amount: 0, emi: 0, spends: 0, perMonth: 0, items: 0 }
    f.amount += amt; f.items++; f.perMonth += monthly
    if (kind === 'emi') f.emi += amt; else f.spends += amt
    if (date && !isNaN(new Date(date).getTime())) f.oldest = older(f.oldest, date)
    by.set(name, f)
  }
  cards.forEach(c => {
    ;(c.spends ?? []).forEach((s: any) => { if (s.owedBy && !s.owedSettled) note(s.owedBy, 'spend', Number(s.amount ?? 0), 0, s.spendDate) })
    ;(c.emis ?? []).forEach((e: any) => { if (e.owedBy && !e.owedSettled) { const p = getEff(e).pending; if (p > 0) note(e.owedBy, 'emi', p * Number(e.emi ?? 0), Number(e.emi ?? 0), e.startDate) } })
  })
  const people = [...by.values()].sort((a, b) => b.amount - a.amount)
  return {
    total: people.reduce((a, x) => a + x.amount, 0), items: people.reduce((a, x) => a + x.items, 0),
    perMonth: people.reduce((a, x) => a + x.perMonth, 0), people, oldest: people.reduce<string | undefined>((o, x) => older(o, x.oldest), undefined),
  }
}

/**
 * One vocabulary for "what kind of payment is this", shared by the Calendar header, Master's toolbar and
 * Quick Lookup. Each page names rows its own way internally (Calendar by `type`, Master by `MasterRow.type`,
 * Lookup by item key), but the breakdown strip must read — and colour — the same everywhere, so every page
 * maps into these ids and renders through <KindStrip>.
 */
export interface KindMeta { one: string; many: string; color: string; order: number }

/**
 * The money groups, coloured as Overview's "Where your income goes" (IncomeSplitCard) colours them, so a
 * kind is the same colour on every screen: EMIs red, bills blue, insurance pink, savings & SIPs purple,
 * card bill amber, one-offs grey. Kinds used to have nine near-identical colours of their own (two reds,
 * two blues, two purples), and Lookup's bar used yet another set, so bar and chips didn't match.
 */
export const MONEY_GROUPS = {
  emi:       { label: 'EMIs',                color: 'var(--danger)',     order: 1 },
  bill:      { label: 'Bills',               color: 'var(--info)',       order: 2 },
  insurance: { label: 'Insurance',           color: 'var(--pink)',       order: 3 },
  saving:    { label: 'Savings & SIPs',      color: 'var(--purple)',     order: 4 },
  card:      { label: 'Card bill',           color: 'var(--warning)',    order: 5 },
  oneoff:    { label: 'Renewals & one-offs', color: 'var(--text-faint)', order: 6 },
} as const
export type MoneyGroup = keyof typeof MONEY_GROUPS

const k = (one: string, many: string, group: MoneyGroup, n: number): KindMeta =>
  ({ one, many, color: MONEY_GROUPS[group].color, order: MONEY_GROUPS[group].order * 10 + n })

export const KINDS: Record<string, KindMeta> = {
  'loan':        k('loan', 'loans', 'emi', 1),
  'gold-loan':   k('gold loan', 'gold loans', 'emi', 2),
  'card-emi':    k('card EMI', 'card EMIs', 'emi', 3),
  'iowe':        k('I Owe', 'I Owe', 'emi', 4),
  'iowe-int':    k('I Owe (interest)', 'I Owe (interest)', 'emi', 5),
  'chit-repay':  k('chit repay', 'chit repay', 'emi', 6),
  'bill':        k('bill', 'bills', 'bill', 1),
  'insurance':   k('insurance', 'insurance', 'insurance', 1),
  'savings':     k('saving', 'savings', 'saving', 1),
  'sip':         k('SIP', 'SIPs', 'saving', 2),
  'card-out':    k('card outstanding', 'card outstanding', 'card', 1),
  'card-spend':  k('card spend', 'card spends', 'card', 2),
  'one-time':    k('one-time', 'one-time', 'oneoff', 1),
  'iowe-lump':   k('I Owe (lump sum)', 'I Owe (lump sum)', 'oneoff', 2),
  'other':       k('other', 'other', 'oneoff', 9),
}
export const kindMeta = (id: string): KindMeta => KINDS[id] ?? { ...KINDS.other, one: id, many: id }

/** Calendar due-list `type` → kind id. */
export const calendarKind = (t: string): string =>
  t === 'Loan' ? 'loan' : t === 'CC EMI' ? 'card-emi' : t === 'CC Outstanding' ? 'card-out' : t === 'CC Spends' ? 'card-spend'
  : t === 'Insurance' ? 'insurance' : t.startsWith('Bill') ? 'bill' : (t === 'Savings' || t === 'Chit') ? 'savings' : t === 'Chit Repaying' ? 'chit-repay'
  : t === 'I Owe' ? 'iowe' : t === 'SIP' ? 'sip' : t === 'Lump Sum' ? 'iowe-lump' : t === 'One-time' ? 'one-time' : 'other'

/** Master row `type` → kind id. */
export const masterKind = (t: string): string =>
  t === 'Loan' ? 'loan' : t === 'Gold Loan' ? 'gold-loan' : t === 'CC EMI' ? 'card-emi' : t === 'CC Outstanding' ? 'card-out' : t === 'CC Spends' ? 'card-spend'
  : t === 'Insurance' ? 'insurance' : t === 'Expense' ? 'bill' : t === 'Savings/Chit' ? 'savings' : t === 'Chit Repay' ? 'chit-repay'
  : t === 'I Owe' ? 'iowe' : t === 'I Owe (Interest-only)' ? 'iowe-int' : t === 'I Owe (Lump)' ? 'iowe-lump' : t === 'Investment/SIP' ? 'sip' : 'other'

/** Quick Lookup item (identified by key prefix) → kind id. */
export const lookupKind = (it: { key: string; sub: string }): string =>
  it.key.startsWith('loan-') ? 'loan' : it.key.startsWith('card-emi-') ? 'card-emi' : it.key.startsWith('card-out-') ? 'card-out' : it.key.startsWith('spend-') ? 'card-spend'
  : it.key.startsWith('ins-') ? (it.sub.startsWith('One-time') ? 'one-time' : 'insurance') : it.key.startsWith('exp-') ? (it.sub.startsWith('One-time') ? 'one-time' : 'bill')
  : it.key.startsWith('sav-') ? (it.sub === 'Still Owe' ? 'chit-repay' : 'savings') : it.key.startsWith('inv-') ? 'sip' : it.key.startsWith('personal-') ? 'iowe' : 'other'

/**
 * A chit/saving plan that has already paid out and is now being repaid — a debt payment, not a savings
 * contribution. ONE definition, shared by calcOutflow, Master, Calendar and Lookup: each used to test a
 * different subset of these three flags, so the same plan read "savings" on one page and "chit repay" on
 * another.
 */
export const isChitRepaying = (v: any): boolean => v?.mode === 'withdrew' || v?.prizeTaken === true || v?.status === 'Repaying'

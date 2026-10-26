/**
 * One vocabulary for "what kind of payment is this", shared by the Calendar header, Master's toolbar and
 * Quick Lookup. Each page names rows its own way internally (Calendar by `type`, Master by `MasterRow.type`,
 * Lookup by item key), but the breakdown strip must read — and colour — the same everywhere, so every page
 * maps into these ids and renders through <KindStrip>.
 */
export interface KindMeta { one: string; many: string; color: string; order: number }

export const KINDS: Record<string, KindMeta> = {
  'loan':        { one: 'loan',               many: 'loans',               color: '#f87171',            order: 1 },
  'gold-loan':   { one: 'gold loan',          many: 'gold loans',          color: '#d4a017',            order: 2 },
  'card-emi':    { one: 'card EMI',           many: 'card EMIs',           color: '#fbbf24',            order: 3 },
  'card-out':    { one: 'card outstanding',   many: 'card outstanding',    color: '#fb7185',            order: 4 },
  'card-spend':  { one: 'card spend',         many: 'card spends',         color: '#f472b6',            order: 5 },
  'insurance':   { one: 'insurance',          many: 'insurance',           color: '#38bdf8',            order: 6 },
  'bill':        { one: 'bill',               many: 'bills',               color: '#c084fc',            order: 7 },
  'savings':     { one: 'saving',             many: 'savings',             color: '#34d399',            order: 8 },
  'chit-repay':  { one: 'chit repay',         many: 'chit repay',          color: '#a78bfa',            order: 9 },
  'iowe':        { one: 'I Owe',              many: 'I Owe',               color: '#fb923c',            order: 10 },
  'iowe-int':    { one: 'I Owe (interest)',   many: 'I Owe (interest)',    color: '#fb923c',            order: 11 },
  'iowe-lump':   { one: 'I Owe (lump sum)',   many: 'I Owe (lump sum)',    color: '#fb923c',            order: 12 },
  'sip':         { one: 'SIP',                many: 'SIPs',                color: '#60a5fa',            order: 13 },
  'one-time':    { one: 'one-time',           many: 'one-time',            color: '#e879f9',            order: 14 },
  'other':       { one: 'other',              many: 'other',               color: '#94a3b8',            order: 99 },
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

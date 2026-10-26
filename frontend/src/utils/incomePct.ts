/** " (32%)" — an amount as a share of monthly income, for tiles that show money left over. "" when there is no income. */
export const incomePct = (amount: number, income: number): string =>
  income > 0 && Number.isFinite(amount) ? ` (${Math.round((amount / income) * 100)}%)` : ''

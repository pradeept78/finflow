/**
 * "About this page" text for the ⓘ button on every page (components/common/PageHelp). One entry per route:
 * what the page is for, what the numbers on it mean, and anything worth knowing. Plain words, no jargon —
 * the same terms the app uses elsewhere (Committed / month, Free / month, card bill…).
 */
export interface PageHelp { title: string; summary: string; points: string[] }

const COMMITTED = 'Committed / month: what repeats every month — loan EMIs, card EMIs, I Owe payments, bills, monthly insurance, savings and SIPs.'
const FREE = 'Free / month: your income minus Committed. Card bills are not taken off here; "Left this month" is after them.'
const CARD_BILL = "Card bill: what this month's credit-card statements ask you to pay — the statement amount plus spends that fall on that bill."

export const PAGE_HELP: Record<string, PageHelp> = {
  // ── Overview ──
  '/hub/overview': {
    title: 'Home',
    summary: 'Your whole picture on one screen: what you owe, what you own, and what is left each month.',
    points: [
      'Total debt: everything still to repay — loans (with the interest still to come), card balances and EMIs, I Owe and chit repayments.',
      'Net worth: what you own (savings, investments, assets) minus what you owe.',
      COMMITTED, FREE,
      'Debt over time shows how the total falls if every EMI is paid; tap the chart or "Look ahead" to see any future month.',
    ],
  },
  '/dashboard': {
    title: 'Dashboard',
    summary: 'Net worth and its trend, the debt breakdown, which loans to pay off first, and quick insights.',
    points: [
      'Net worth trend comes from monthly snapshots — one is saved automatically each month.',
      'Payoff priority lists loans by interest rate: paying the top one early saves the most.',
      'Smart insights flag things worth a look, like low savings or a high card balance.',
    ],
  },
  '/master': {
    title: 'All commitments',
    summary: 'Every recurring payment in one list — loans, card EMIs, I Owe, bills, insurance, savings, SIPs.',
    points: [
      'Cash needed this month is the same figure as Due and Home.',
      'Group by due date, type or card; tap a type chip to filter.',
      'Planner: tick loans to see what closing them would free up each month.',
      'Not counted: items left out of your totals (for example a friend\'s EMI on your card that they repay).',
    ],
  },
  '/calendar': {
    title: 'Calendar',
    summary: 'Month by month: what you will pay, what is left, and what changes as loans close.',
    points: [
      'Each month adds up to its total; "vs last month" says what changed.',
      'Card bills are counted in the month they are due, not the month you spent.',
      'Closing EMIs show the money they free up from the next month.',
    ],
  },
  '/lookup': {
    title: 'Due this month',
    summary: 'Every payment due this month, by date — tick each one when you pay it.',
    points: [
      'Total due = Committed + card bill + any renewals or one-off payments this month.',
      'Nothing is assumed paid: a payment stays open until you tick it. Past dates turn red as overdue.',
      'Items with no due day sit under "Any day this month".',
      'The coloured bar shows where this month\'s money goes; tap a chip to see just those payments.',
    ],
  },
  '/budget': {
    title: 'Budget rules',
    summary: 'How your money splits across rent, loans, bills, family, savings and more — against limits you set.',
    points: [
      'Each block shows what falls in it this month and its limit as a share of income; tap a block to see the items.',
      'Edit limits to change the percentages; they are saved on this device.',
      'Budget score is how many blocks are within their limit.',
    ],
  },

  // ── Debt ──
  '/hub/debt': {
    title: 'Debt overview',
    summary: 'Everything you owe in one place, and when you will be debt-free at the current pace.',
    points: [
      'Total debt includes the interest still to come on loans.',
      'Monthly EMIs is what goes out each month for loans, card EMIs, I Owe and chit repayments.',
      'Debt free is the month the last EMI ends if every EMI is paid on time.',
    ],
  },
  '/loans': {
    title: 'Loans',
    summary: 'Your bank and app loans: EMI, what is left to clear, and how far along each one is.',
    points: [
      'Instalments paid are counted from the start date, so "left" moves on its own each month.',
      'Prepay first: the loans with the highest interest — clearing these early saves the most.',
      'Next 7 days: EMIs about to be debited, and from which account.',
      'Set a loan\'s last 4 digits so bank SMS about its EMI can be matched to it.',
    ],
  },
  '/cards': {
    title: 'Credit cards',
    summary: 'Each card\'s bill, billing period, EMIs and spends.',
    points: [
      'A statement on day S covers S of last month to S−1 of this month, and is due on the card\'s due day after it.',
      'Spends go on the bill whose period they fall in; card EMIs start on the first bill after you take them.',
      'Outstanding is the statement amount you typed in — it belongs to the statement it was entered for.',
      'Friends\' EMIs on your card are tracked but left out of your own totals.',
    ],
  },
  '/personal': {
    title: 'I Owe',
    summary: 'Money you owe to people — family, friends, hand loans.',
    points: [
      'Interest-only: you pay monthly interest but the amount you borrowed does not go down.',
      'Lump sum: one payment on a date, with nothing monthly.',
      'Monthly payments count in Committed / month.',
    ],
  },
  '/expenses': {
    title: 'Expenses',
    summary: 'Regular bills — rent, utilities, family support, subscriptions.',
    points: [
      'Monthly bills count every month; quarterly and yearly ones only in the months they fall due.',
      'One-time expenses count once, in their own month.',
      'Categories decide which Budget block an expense goes into.',
    ],
  },

  // ── Savings & income ──
  '/hub/savings': {
    title: 'Savings overview',
    summary: 'What you are building: savings and chits, investments, income, insurance and money people owe you.',
    points: [
      'Savings corpus is what your savings plans and chits are worth today.',
      'People owe me is money you have lent and expect back.',
    ],
  },
  '/income': {
    title: 'Income',
    summary: 'Your income sources. Their monthly total is what Free / month is worked out from.',
    points: ['Add salary and any other regular income; set an end date when one stops.'],
  },
  '/savings': {
    title: 'Savings / chit',
    summary: 'Savings plans and chit funds — what you put in each month and what they are worth.',
    points: [
      'A chit you have already taken the payout from becomes a repayment: it moves to what you owe.',
      'Break savings (in History & tools) shows whether breaking a saving to clear a loan is worth it.',
    ],
  },
  '/investments': {
    title: 'Investments',
    summary: 'SIPs, FDs, gold, stocks — invested amount, current value and profit or loss.',
    points: ['Monthly SIPs count in Committed / month.'],
  },
  '/insurance': {
    title: 'Insurance',
    summary: 'Your policies, premiums and cover.',
    points: [
      'Monthly premiums count in Committed / month.',
      'Yearly and half-yearly premiums count only in the month they renew; the page shows the set-aside per month.',
      'A premium paid through a card EMI is counted once, as the card EMI.',
    ],
  },
  '/people-owe': {
    title: 'People owe me',
    summary: 'Money you lent and expect back.',
    points: ['Record part-payments as they come in; mark it collected when it is all back.'],
  },
  '/earnings': {
    title: 'Earnings log',
    summary: 'Your salary history over the years — lifetime earnings and growth.',
    points: ['Add a period for each job or raise; the latest one can feed your income.'],
  },

  // ── History & tools ──
  '/hub/history': {
    title: 'History & tools',
    summary: 'Look back, plan ahead and manage your data.',
    points: ['Payoff plans your debt-free date, History tracks debt month by month, Export downloads everything.'],
  },
  '/messages': {
    title: 'Bank messages',
    summary: 'Bank SMS and alerts FinFlow has read into card spends, card bills, payments and loan EMIs.',
    points: [
      'Sure ones (card or loan matched by its last 4 digits, clear amount) are added automatically, with Undo.',
      'Anything unclear waits under To review for you to confirm, edit or ignore.',
      'OTPs, declined payments, refunds and UPI or bank-account payments are ignored.',
      'Set up the iPhone Shortcut on this page to send bank SMS here by themselves.',
    ],
  },
  '/history': {
    title: 'History',
    summary: 'Month-by-month snapshots: debt, outflow and free money over time.',
    points: ['A snapshot is saved each month; "Save snapshot" saves one now.', 'The big figure is the debt at the last snapshot.'],
  },
  '/closed-loans': {
    title: 'Closed assets',
    summary: 'Loans, chits and investments that have finished — what you paid, the interest, and what you got back.',
    points: ['Net P&L is what you got back minus what you paid in.'],
  },
  '/payoff': {
    title: 'Payoff plan',
    summary: 'When you will be debt-free, and how much sooner with extra payments.',
    points: [
      'Current pace: every EMI paid as scheduled.',
      'Snowball: when a loan closes, its EMI goes to the next loan.',
      'Extra payment: add a monthly amount on top to see the new date and the interest saved.',
      'What if I refinance: try a lower rate on selected loans.',
    ],
  },
  '/break-savings': {
    title: 'Break savings',
    summary: 'Should you withdraw a saving or chit early to clear a loan?',
    points: ['Compares the interest you would save against what breaking the saving costs you.'],
  },
  '/export': {
    title: 'Export',
    summary: 'Download your data — a full backup or a CSV per section.',
    points: ['The JSON backup includes everything; keep it somewhere safe.'],
  },
  '/admin': {
    title: 'Admin',
    summary: 'Accounts on this FinFlow and invite codes.',
    points: ['Admins see account details only — never anyone\'s loans, cards or balances.', 'Sign-up needs an invite: create one and send its link.'],
  },
  '/account': {
    title: 'Your account',
    summary: 'Change your password or delete your account.',
    points: ['Changing the password signs you out on every other device.', 'Deleting removes the account and all its data for good — export first if you want a copy.'],
  },

  // ── Statements ──
  '/statements/overview': {
    title: 'Statements',
    summary: 'What your uploaded bank and card statements say about where your money actually went.',
    points: ['Upload statements under Data; profiles keep different people\'s statements apart.', 'Actual spending leaves out transfers and card bill payments, so nothing is counted twice.'],
  },
  '/statements/spending': {
    title: 'Spending analysis',
    summary: 'Spending by month, year and category from your statements.',
    points: ['Switch between money out and money in.'],
  },
  '/statements/people': {
    title: 'People & merchants',
    summary: 'Who you pay most — people by UPI, shops and banks.',
    points: ['Tap a name to see its transactions.'],
  },
  '/statements/accounts': {
    title: 'Accounts & cards',
    summary: 'Every account and card found in your statements.',
    points: ['Rename an account to make the rest of the Statements pages easier to read.'],
  },
  '/statements/transactions': {
    title: 'Transactions',
    summary: 'Every transaction from your statements — search, filter, fix categories.',
    points: ['Tap a transaction to change its category or exclude it from spending.'],
  },
  '/statements/ledger': {
    title: 'Lending & loans',
    summary: 'Money moving between you and people or lenders, from your statements.',
    points: ['Helps spot loans and hand loans you have not added yet.'],
  },
  '/statements/debt-match': {
    title: 'Debt matching',
    summary: 'Matches EMI and card payments in your statements to the loans and cards in FinFlow.',
    points: ['Unmatched payments may be a loan you have not added.'],
  },
  '/statements/data': {
    title: 'Data & imports',
    summary: 'Upload bank and card statements, and manage what has been imported.',
    points: ['Re-uploading the same statement is safe: duplicates are skipped.'],
  },
}

export const GLOSSARY = [COMMITTED, FREE, CARD_BILL]

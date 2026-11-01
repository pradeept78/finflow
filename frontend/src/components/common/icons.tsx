import type { LucideIcon } from 'lucide-react'
import {
  Archive, BadgeIndianRupee, CalendarDays, CheckCircle2, CreditCard, Download, Flag, History, Home, Landmark,
  PiggyBank, Receipt, RotateCcw, Scissors, ShieldCheck, ShoppingBag, Target, TrendingUp, UserCog, UserMinus,
  UserPlus, Users, Wallet, Car, Lightbulb, Coins, Utensils, Package, Mail, Gem,
  Search, FileText, Building2, Inbox, User, ListChecks, PieChart, Pencil, Check,
} from 'lucide-react'

/**
 * One icon per meaning, used by every icon block (Home's lists, Budget blocks, Export, Quick add, search,
 * Due rows) and matching the tab icons in hubTabs. These were emoji: 🏦 meant loans, savings and bank
 * accounts depending on the page, 📈 meant investments and history, 🛡️ insurance and admin.
 */
export const ICON = {
  loan: Landmark,
  card: CreditCard,
  cardSpend: ShoppingBag,
  iowe: UserMinus,
  oweMe: UserPlus,
  chitRepay: RotateCcw,
  bill: Receipt,
  savings: PiggyBank,
  gold: Gem,
  investment: TrendingUp,
  income: Wallet,
  insurance: ShieldCheck,
  earnings: BadgeIndianRupee,
  closed: Archive,
  payoff: Flag,
  history: History,
  breakSavings: Scissors,
  export: Download,
  admin: UserCog,
  lookup: CheckCircle2,
  calendar: CalendarDays,
  budget: Target,
  housing: Home,
  vehicle: Car,
  utilities: Lightbulb,
  family: Users,
  food: Utensils,
  lifestyle: ShoppingBag,
  other: Package,
  oneOff: Coins,
  messages: Mail,
  search: Search,
  file: FileText,
  bank: Building2,
  empty: Inbox,
  person: User,
  list: ListChecks,
  summary: PieChart,
  edit: Pencil,
  done: Check,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICON

/** Draws a line icon, or an emoji string where a page still passes one. */
export function Glyph({ icon, size = 16, className = '' }: { icon: LucideIcon | string; size?: number; className?: string }) {
  if (typeof icon === 'string') return <span className={className} aria-hidden>{icon}</span>
  const I = icon
  return <I size={size} strokeWidth={2} aria-hidden className={className} />
}

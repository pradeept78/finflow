import { useQuery } from '@tanstack/react-query'
import { investTotals } from '../utils/investValue'
import { loansApi, cardsApi, personalEmiApi, savingsApi, investmentsApi, incomeApi, expensesApi, insuranceApi } from '../api'
import { getEff } from '../utils/format'
import { calcLoanSplit } from '../utils/loanCalc'
import axiosApi from '../api/axios'
import { debtFreeMonths, addMonthsLabel } from '../utils/debtFree'

const peopleOweApi = { getAll: () => axiosApi.get<{data:any[]}>('/people-owes').then(r=>r.data.data) }

export function useFinancials() {
  const { data: loans = [],       isLoading: l1 } = useQuery({ queryKey: ['loans'],       queryFn: loansApi.getAll })
  const { data: cards = [],       isLoading: l2 } = useQuery({ queryKey: ['cards'],       queryFn: cardsApi.getAll })
  const { data: personal = [],    isLoading: l3 } = useQuery({ queryKey: ['personal'],    queryFn: personalEmiApi.getAll })
  const { data: savings = [],     isLoading: l4 } = useQuery({ queryKey: ['savings'],     queryFn: savingsApi.getAll })
  const { data: investments = [], isLoading: l5 } = useQuery({ queryKey: ['investments'], queryFn: investmentsApi.getAll })
  const { data: income = [],      isLoading: l6 } = useQuery({ queryKey: ['income'],      queryFn: incomeApi.getAll })
  const { data: expenses = [],    isLoading: l7 } = useQuery({ queryKey: ['expenses'],    queryFn: expensesApi.getAll })
  const { data: insurance = [],   isLoading: l8 } = useQuery({ queryKey: ['insurance'],   queryFn: insuranceApi.getAll })
  const { data: peopleOwe = [],   isLoading: l9 } = useQuery({ queryKey: ['people-owes'], queryFn: peopleOweApi.getAll })

  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8||l9

  // ── LOANS ──
  const activeLoans = (loans as any[]).filter(l => getEff(l).pending > 0)
  const loanEmi = activeLoans.reduce((s:number, l:any) => s + Number(l.emi ?? 0), 0)
  const loanPrincipal = activeLoans.reduce((s:number, l:any) => {
    const e=getEff(l), t=l.tenure??(e.paid+e.pending)
    return s + calcLoanSplit(l.amount??0, l.emi??0, t, e.paid, l.principalPaid??undefined).princLeft
  }, 0)
  const loanIntLeft = activeLoans.reduce((s:number, l:any) => {
    const e=getEff(l), t=l.tenure??(e.paid+e.pending)
    return s + calcLoanSplit(l.amount??0, l.emi??0, t, e.paid, l.principalPaid??undefined).intLeft
  }, 0)
  const loanIntPaid = activeLoans.reduce((s:number, l:any) => {
    const e=getEff(l), t=l.tenure??(e.paid+e.pending)
    return s + calcLoanSplit(l.amount??0, l.emi??0, t, e.paid, l.principalPaid??undefined).intPaid
  }, 0)
  const maxLoanPending = activeLoans.reduce((m:number, l:any) => Math.max(m, getEff(l).pending), 0)
  const debtFreeDate = addMonthsLabel(debtFreeMonths(loans as any[], cards as any[], personal as any[], savings as any[]))
  const ownedAssets = (loans as any[]).reduce((s:number, l:any) => s + Number(l.currentValue ?? 0), 0)
  const ownedPending = (loans as any[]).filter((l:any) => Number(l.currentValue??0)>0).reduce((s:number,l:any) => s + getEff(l).pending * Number(l.emi??0), 0)
  const netOwnedAssets = ownedAssets - ownedPending

  // ── CREDIT CARDS ──
  const ccOutstanding = (cards as any[]).reduce((s:number, c:any) => s + Number(c.outstanding ?? 0), 0)
  const ccEmiMonthly  = (cards as any[]).reduce((s:number, c:any) => s + (c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+Number(e.emi??0),0), 0)
  const ccEmiPending  = (cards as any[]).reduce((s:number, c:any) => s + (c.emis??[]).filter((e:any)=>getEff(e).pending>0).reduce((a:number,e:any)=>a+getEff(e).pending*Number(e.emi??0),0), 0)
  const ccSpends      = (cards as any[]).reduce((s:number, c:any) => s + (c.spends??[]).reduce((a:number,sp:any)=>a+Number(sp.amount??0),0), 0)
  const ccLimit       = (cards as any[]).reduce((s:number, c:any) => s + Number(c.cardLimit ?? 0), 0)
  const ccUtilization = ccLimit > 0 ? Math.round((ccOutstanding + ccSpends + ccEmiPending) / ccLimit * 100) : 0

  // ── PERSONAL (I OWE) ──
  const iOweTotal   = (personal as any[]).reduce((s:number, p:any) => s + Number(p.amount ?? 0), 0)
  const iOweMo      = (personal as any[]).reduce((s:number, p:any) => s + Number(p.emi ?? 0), 0)

  // ── SAVINGS ──
  const buildingChits  = (savings as any[]).filter((v:any) => v.mode!=='withdrew' && !v.prizeTaken && getEff(v).pending>0)
  const repayingChits  = (savings as any[]).filter((v:any) => (v.mode==='withdrew'||v.prizeTaken) && getEff(v).pending>0)
  const savingsCorpus  = buildingChits.reduce((s:number,v:any) => s + getEff(v).paid * Number(v.monthly??0), 0)
  const savMo          = buildingChits.reduce((s:number,v:any) => s + Number(v.monthly??0), 0)
  const chitRepayMo    = repayingChits.reduce((s:number,v:any) => s + Number(v.monthly??0), 0)
  const chitRepayTotal = repayingChits.reduce((s:number,v:any) => s + getEff(v).pending * Number(v.monthly??0), 0)

  // ── INVESTMENTS ──
  const investValue    = investTotals(investments as any[]).value
  const investedTotal  = (investments as any[]).reduce((s:number, v:any) => s + Number(v.totalInvested ?? v.monthly??0), 0)
  const investMo       = (investments as any[]).filter((v:any)=>Number(v.monthly??0)>0).reduce((s:number,v:any)=>s+Number(v.monthly??0), 0)
  const investPnL      = investValue - investedTotal

  // ── INCOME & EXPENSES ──
  const monthlyIncome  = (income as any[]).filter((v:any) => v.active!==false).reduce((s:number,v:any) => s + Number(v.amount??0), 0)
  const monthlyExpenses= (expenses as any[]).filter((v:any) => v.active!==false).reduce((s:number,v:any) => s + Number(v.amount??0), 0)
  const insuranceMo    = (insurance as any[]).filter((v:any) => v.active!==false).reduce((s:number,v:any) => s + Number(v.premium??0)/12, 0)

  // ── PEOPLE OWE ME ──
  const peopleOweTotal = (peopleOwe as any[]).filter((p:any) => p.status!=='Paid'&&p.status!=='Settled').reduce((s:number,p:any) => s + Number(p.amount??0) - Number(p.paidAmount??0), 0)

  // ── TOTALS ──
  const totalDebt    = loanPrincipal + ccOutstanding + ccEmiPending + ccSpends + iOweTotal + chitRepayTotal
  const totalAssets  = savingsCorpus + investValue + netOwnedAssets + peopleOweTotal
  const netWorth     = totalAssets - totalDebt

  const totalOutflow = loanEmi + ccEmiMonthly + iOweMo + savMo + chitRepayMo + investMo + monthlyExpenses + insuranceMo
  const freeCash     = monthlyIncome - totalOutflow
  const dti          = monthlyIncome > 0 ? Math.round((loanEmi + ccEmiMonthly) / monthlyIncome * 100) : 0
  const savingsRate  = monthlyIncome > 0 ? Math.round((savMo + investMo) / monthlyIncome * 100) : 0

  return {
    // Raw data
    loans, cards, personal, savings, investments, income, expenses, insurance, peopleOwe,
    isLoading,

    // Loan metrics
    activeLoans, loanEmi, loanPrincipal, loanIntLeft, loanIntPaid,
    maxLoanPending, debtFreeDate, netOwnedAssets, ownedAssets, ownedPending,

    // CC metrics
    ccOutstanding, ccEmiMonthly, ccEmiPending, ccSpends, ccLimit, ccUtilization,

    // Personal
    iOweTotal, iOweMo,

    // Savings
    buildingChits, repayingChits, savingsCorpus, savMo, chitRepayMo, chitRepayTotal,

    // Investments
    investValue, investedTotal, investMo, investPnL,

    // Income
    monthlyIncome, monthlyExpenses, insuranceMo,

    // People owe
    peopleOweTotal,

    // Summary
    totalDebt, totalAssets, netWorth,
    totalOutflow, freeCash, dti, savingsRate,

    // Debt breakdown
    debtBreakdown: {
      loans: loanPrincipal,
      loansWithInt: loanPrincipal + loanIntLeft,
      cc: ccOutstanding + ccEmiPending + ccSpends,
      iOwe: iOweTotal,
      chit: chitRepayTotal,
    },

    // Asset breakdown
    assetBreakdown: {
      savings: savingsCorpus,
      investments: investValue,
      owned: netOwnedAssets,
      peopleOwe: peopleOweTotal,
    }
  }
}

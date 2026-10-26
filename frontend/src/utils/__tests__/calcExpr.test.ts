import { describe, it, expect } from 'vitest'
import { evalAmount, isExpression } from '../calcExpr'

describe('evalAmount', () => {
  it('adds, subtracts, multiplies, divides with precedence and brackets', () => {
    expect(evalAmount('15000+2500')).toBe(17500)
    expect(evalAmount('1,20,000 - 4500')).toBe(115500)
    expect(evalAmount('4500*3')).toBe(13500)
    expect(evalAmount('(1200+800)/2')).toBe(1000)
    expect(evalAmount('100+20*2')).toBe(140)
    expect(evalAmount('₹2,500')).toBe(2500)
    expect(evalAmount('12.5+0.25')).toBe(12.75)
  })
  it('returns null for empty, partial or non-arithmetic input — never evaluates code', () => {
    for (const t of ['', '   ', '15000+', '+', 'abc', '1+alert(1)', '2**3', '1/0', '(1+2', '5)', '1e5']) expect(evalAmount(t)).toBeNull()
  })
  it('tells a calculation from a plain number', () => {
    expect(isExpression('15000+2500')).toBe(true)
    expect(isExpression('1,20,000')).toBe(false)
    expect(isExpression('-5')).toBe(false)
    expect(isExpression('5-3')).toBe(true)
  })
})

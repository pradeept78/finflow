/**
 * Evaluate a typed amount that may be a small sum — "15000+2500", "1,20,000 - 4500", "4500*3", "(1200+800)/2".
 * Only digits, + - * / ( ) . , ₹ and spaces are accepted; anything else (letters, symbols) returns null, so
 * nothing is ever executed — this is a tiny hand-written parser, not eval.
 * Returns null for empty or invalid input, and for a result that is not a finite number.
 */
export function evalAmount(text: string): number | null {
  const src = String(text ?? '').replace(/[₹,\s]/g, '')
  if (!src) return null
  if (!/^[0-9+\-*/().]+$/.test(src)) return null
  let i = 0
  const peek = () => src[i]
  const number = (): number => {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i))
    if (!m) throw new Error('num')
    i += m[0].length
    return parseFloat(m[0])
  }
  const factor = (): number => {
    if (peek() === '-') { i++; return -factor() }
    if (peek() === '+') { i++; return factor() }
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('paren'); i++; return v }
    return number()
  }
  const term = (): number => {
    let v = factor()
    while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = factor(); v = op === '*' ? v * r : v / r }
    return v
  }
  const expr = (): number => {
    let v = term()
    while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r }
    return v
  }
  try {
    const v = expr()
    if (i !== src.length || !Number.isFinite(v)) return null
    return Math.round(v * 100) / 100
  } catch { return null }
}

/** True when the text is a calculation (has an operator after the first character), not a plain number. */
export const isExpression = (text: string): boolean => /[+*/()]|.-/.test(String(text ?? '').replace(/[₹,\s]/g, ''))

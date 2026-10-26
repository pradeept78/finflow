/**
 * A bill, premium or SIP can carry an end date. Once that date has passed it is over, whether or not anyone remembered to
 * switch it off — so it must stop counting toward what leaves your account each month. (Before, only the on/off switch was
 * checked, so a bill that ended in March still sat in October's outflow and quietly lowered Free / Month.)
 */
export const hasEnded = (v: any, now: Date = new Date()): boolean => {
  if (!v?.endDate) return false
  const e = new Date(v.endDate)
  if (isNaN(e.getTime())) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return e.getTime() < today.getTime()
}
/** Switched on and not past its end date. */
export const isLive = (v: any, now?: Date): boolean => v?.active !== false && !hasEnded(v, now)

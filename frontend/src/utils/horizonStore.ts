import { useSyncExternalStore } from 'react'

/**
 * The "Look ahead" choice, shared by every page that offers it (Hub, Dashboard, Budget, Master): pick +6 months on one and
 * the others follow. Lives in memory for the session — a full reload goes back to Today, so the app never opens showing a
 * projection by surprise.
 */
export interface HorizonState { horizon: number; typicalSpend: boolean; noDeposits: boolean }
let state: HorizonState = { horizon: 0, typicalSpend: false, noDeposits: false }
const subs = new Set<() => void>()

export const getHorizonState = () => state
export function setHorizonState(patch: Partial<HorizonState>) {
  state = { ...state, ...patch }
  subs.forEach(f => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export const useHorizonState = (): HorizonState => useSyncExternalStore(subscribe, getHorizonState, getHorizonState)

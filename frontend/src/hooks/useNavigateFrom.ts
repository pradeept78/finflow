import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Drop-in replacement for `useNavigate()` for pages whose rows/cards are hyperlinks to other
 * pages (Hub, Dashboard, Budget Rules, Quick Lookup). Each navigation carries `{ from: <this page's
 * path> }` in router state, and PageHeader on the destination uses it to offer "← Back to <page>" —
 * the same behavior All Commitments has always had, without editing every link individually.
 * Sidebar and tab-bar navigation don't go through this, so they never show a back link.
 */
export function useNavigateFrom() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return useCallback((to: string | number, opts?: { state?: unknown; replace?: boolean }) => {
    if (typeof to === 'number') return navigate(to)
    return navigate(to, { replace: opts?.replace, state: { from: pathname, ...(opts?.state as object | undefined) } })
  }, [navigate, pathname])
}

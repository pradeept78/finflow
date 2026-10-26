import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('ff_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * A 401 means two unrelated things depending on which endpoint returned it.
 *
 * From /auth/login it means "wrong email or password" — the user is trying to get IN, and the whole
 * point is to tell them what went wrong. From anywhere else it means the token we just sent is no
 * longer valid, i.e. the session ended.
 *
 * The old interceptor treated both as the second case: it computed the server's message, threw it
 * away, wiped localStorage and hard-navigated to /login. Since login is the only endpoint that
 * answers 401 on user error, a wrong password reloaded the page back to an empty form with no
 * explanation whatsoever — the exact symptom of "UI reset to login without any error".
 */
const isAuthAttempt = (url?: string) => /\/auth\/(login|register)\b/.test(url ?? '')

/**
 * "Your session is no good" arrives in more shapes than a clean 401 — a 403, a 400 or a 500 whose message says
 * "invalid session" / "token expired" / "JWT ...". Each of those used to be treated as an ordinary error, so every
 * API the page called in parallel (a dozen on a hub page) raised its own red toast, one after another.
 * Anything that says the session is dead is handled as one sign-out instead.
 */
const SESSION_MSG = /(invalid|expired|missing|malformed)[^a-z]{0,3}(session|token|jwt|credentials?)|(session|token|jwt)[^a-z]{0,3}(is |has )?(invalid|expired|not found)|unauthori[sz]ed|not authenticated/i
const isSessionError = (status: number | undefined, msg: string) =>
  status === 401 || ((status === 400 || status === 403 || status === 500) && SESSION_MSG.test(msg))
let signingOut = false

export const SIGNED_OUT_REASON = 'ff_signed_out_reason'

api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    const url: string = err.config?.url ?? ''
    const msg = err.response?.data?.message || err.message || 'Something went wrong'

    if (!isAuthAttempt(url) && isSessionError(status, String(msg))) {
      // Several calls fail at once; only the first does the sign-out, the rest just reject quietly.
      if (signingOut) return Promise.reject(err)
      signingOut = true
      localStorage.removeItem('ff_token')
      localStorage.removeItem('ff_user')
      // The redirect below reloads the whole app, which destroys a toast before it can paint.
      // Leave the reason where LoginPage can pick it up after the remount.
      sessionStorage.setItem(SIGNED_OUT_REASON, 'Your session expired. Please sign in again.')
      // Guard the redirect: without this, a 401 fired while already sitting on /login sends the
      // page into a reload loop.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    } else if (/\/auth\/login\b/.test(url)) {
      // LoginPage renders this inline, right above the form. A toast as well would say the same
      // thing twice.
    } else {
      // One id per message: a dozen calls failing with the same text (backend down, "Network Error") show one toast, not a stack.
      toast.error(msg, { id: `api:${msg}` })
    }
    return Promise.reject(err)
  }
)

export default api

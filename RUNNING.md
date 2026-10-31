# FinFlow — running it, and what to check before trusting it

## Short answer on production readiness

**Close, with three real items left.** The backend compiles — verified by extracting the actual
build artifact and recompiling the changed files against it with full symbol resolution, not just a
syntax check — and all 25 screens have been walked in a real browser against realistic fixture data
covering the awkward cases (a loan with no due day, a card with both EMIs and unbilled spends,
insurance on three different billing frequencies including a one-off, a chit still building next to
one being repaid). 24 of 25 rendered cleanly; the one failure (`/history`) is fixed below.

What's actually left:

1. **Which database holds your real data is still unconfirmed.** See "Two databases" below — this
   is the one that can make backups quietly cover the wrong thing.
2. **The auth code has never been reviewed.** Token validation and expiry, the password-reset flow,
   and the raw `JdbcTemplate` SQL surface — nobody has read these end to end.
3. **`/admin`'s rewritten chit SQL has compiled but never executed.** Nothing else exercises that
   query path; load the page once against real data and watch for a `BadSqlGrammarException`.

Everything else that was ever a blocker — the missing CORS config, the login page swallowing failed
attempts, the JWT default, the hardcoded backup password, three dead files, one React key bug — is
fixed and verified below.

---

## Running locally — day to day

Two terminals, from the repo root. No flags needed; ports were deliberately chosen so this never
collides with the Docker stack (see "Running both at once" below).

**Terminal 1 — backend:**
```bash
cd backend
set -a && . ../.env && set +a
mvn spring-boot:run -Dspring-boot.run.profiles=local
```
Binds **8080**. The `local` profile (`application-local.yml`) points it at your native MySQL on
3306; sourcing `.env` first supplies `JWT_SECRET`, which has no fallback value anymore (see
"Secrets" below) — skip that step and the backend refuses to start, which is the point.

**Terminal 2 — frontend:**
```bash
cd frontend
npm run dev
```
Serves **http://localhost:3000**. A small badge in the bottom-left corner names which backend
you're talking to (`dev :3000 → api localhost:8080` by default) — it only exists in dev and never
ships in a production build.

---

## Running the Docker stack

```bash
docker compose up -d --build
```
Then **http://localhost:3100**. `--build` matters whenever backend or frontend source changed —
without it you're running whatever image was last built, however old.

Host ports are offset from local on purpose, so both stacks can run at the same time:

| | local (no flags) | docker |
|---|---|---|
| frontend | 3000 | **3100** |
| backend  | 8080 | **8180** |
| mysql    | 3306 (your native install) | **3307** |

Only the *host* side moved — inside the compose network the containers still talk on 8080 and 3306,
so `nginx.conf` and the backend's own `SPRING_DATASOURCE_URL` are unchanged.

To view the Docker backend's data from your live dev frontend instead of the built one:
```bash
npm run dev:docker-api    # serves on 3001, proxies to localhost:8180
```

Watch the first boot — **Flyway owns the schema, not Hibernate.** `ddl-auto` is `validate`, so
Hibernate only checks the tables match; it will not create them. The 18 migrations in
`src/main/resources/db/migration` run V1→V18 against an empty database. A schema mismatch or a bad
column name surfaces here:
```bash
docker compose logs -f backend
```

To stop: `docker compose down`. Avoid `docker compose down -v` unless you mean it — the `-v` deletes
the `mysql_data` volume and everything in Docker's database with it.

---

## Two databases — the thing most likely to bite you

Local and Docker are wired to **separate MySQL instances with separate data**. A loan entered on
`:3000` will not appear on `:3100`, and vice versa. You'll also be logged in separately on each,
since browsers scope stored tokens by origin including port.

**Real data lives in Docker** (since 31 Oct 2026). The native database on 3306 was copied into
`finflow-mysql` (row counts matched, schema V25) and Docker is the one to use day to day at `:3100`.
The native copy on 3306 is now a dev sandbox: anything entered on `:3000` does **not** reach Docker.

---

## Phone access (Tailscale)

The Docker stack is reachable from your own devices at **https://admins-macbook-pro-5.tail372646.ts.net**
(tailnet only, not public). Open it on the phone and use *Add to Home Screen*. HTTPS is what lets the
service worker register, so the installed app opens offline.

```bash
tailscale serve --bg 3100            # set up once; persists across reboots
tailscale serve status
tailscale serve --https=443 off      # stop sharing
```
The Mac must be awake, with Docker and Tailscale running. On this Mac `accept-dns` is off
(`tailscale set --accept-dns=false`): with it on, Tailscale's own DNS lookups failed and it couldn't
fetch the certificate. The side effect is that the Mac itself doesn't resolve `*.ts.net` names; use
`http://localhost:3100` there. Tailscale renews the certificate itself.

The API only accepts browser requests from listed origins, so the phone address must be in
`CORS_ALLOWED_ORIGINS` in `.env` (compose passes it to the backend), or the page opens but sign-in fails
with `Invalid CORS request`:
```
CORS_ALLOWED_ORIGINS='http://localhost:[*],http://127.0.0.1:[*],https://admins-macbook-pro-5.tail372646.ts.net'
```
Then `docker compose up -d backend`.

---

## Sign-up and admins

Sign-up is **invite-only** by default. An admin creates a single-use code on `/admin` → Invites and sends
its link (`/register?invite=XXXX-XXXX-XXXX`, which fills the code in). Change it with `SIGNUP_MODE` in `.env`
(compose passes it to the backend), then `docker compose up -d backend`:

| `SIGNUP_MODE` | Who can create an account |
|---|---|
| `invite` (default) | someone with an unused invite code |
| `open` | anyone who can reach the app |
| `closed` | nobody |

Admins see **account details only** (name, email, role, joined, last seen) and can reset passwords, change
roles, delete accounts and manage invites. They cannot see anyone's loans, cards, balances or totals.

---

## Secrets

`JWT_SECRET` and `SPRING_DATASOURCE_PASSWORD` have **no fallback value** in `application.yml`
anymore. Previously they defaulted to `default-secret-change-in-production` and `finflow123` —
strings that are sitting in this repo's history and therefore public to anyone who has ever cloned
it. Any launch path that didn't go through `docker compose` (a bare `mvn spring-boot:run`, an IDE
run config, a stray jar) silently fell through to them. Now every path fails loudly at startup
instead — verified directly against Spring's own placeholder resolution: unset, it throws
`Could not resolve placeholder 'JWT_SECRET'`; set, it resolves normally; every other property with
a real default (expiration, CORS origins, username) is untouched.

```bash
cp .env.example .env
# fill in MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD, SPRING_DATASOURCE_PASSWORD (same as MYSQL_PASSWORD)
openssl rand -base64 48    # → JWT_SECRET
```
`docker compose` reads `.env` automatically. A local `mvn spring-boot:run` needs it sourced into the
shell first (`set -a && . ../.env && set +a`) — `application-local.yml` supplies its own DB
credentials but relies on `.env` for `JWT_SECRET`.

`.env` itself has one sharp edge: any value containing `& ? * $ \` | ; < >` or a space **must be
single-quoted**. `docker compose` parses the file itself and doesn't care, but sourcing it runs the
file through the shell, and an unquoted `&` is the background-job operator — zsh refuses outright
with `parse error near '&'`; bash is worse and silently sets an empty value. This bit a
`SPRING_DATASOURCE_URL` override once already; `.env.example` documents the rule.

---

## CORS

One definition now, in `CorsConfig.java`, registered on `/**` with a port-wildcard pattern
(`http://localhost:[*]`) so it doesn't matter which port Vite happens to land on. There used to be
**two** — a second one in `SecurityConfig.java` with a different, shorter origin list — which had
already drifted apart and is how a working proxy still produced "Invalid CORS request": the browser's
`Origin` header survives the dev proxy untouched (`changeOrigin` rewrites `Host`, not `Origin`), so
Spring saw the real port and checked it against whichever list happened to be enforced.

Override the allow-list for a real deployment, where the frontend is served same-origin behind nginx
and localhost should not be on the list at all:
```
CORS_ALLOWED_ORIGINS=https://finflow.example.com
```

---

## Verifying a fresh deployment

`preflight.sh` runs from the repo root and checks, in order: the backend compiles, the frontend
typechecks and builds cleanly, all three Docker containers reach a running state, the API answers,
the database has its tables, and every route loads with no JS error and no `NaN` / `Infinity` /
`undefined` / `[object Object]` rendered into the page.

```bash
chmod +x preflight.sh
./preflight.sh
```
It targets the **Docker** stack specifically (`localhost:8180` / `localhost:3100`), matching the
offset ports above — running it against local dev ports would validate the wrong thing.

For the route walk it needs Playwright and a login:
```bash
cd frontend && npm i -D playwright && npx playwright install chromium && cd ..
SMOKE_EMAIL=you@example.com SMOKE_PASSWORD=... ./preflight.sh
```

### Checks worth doing by hand after it passes

Automation can't judge whether a number is *right*, only that it rendered. Confirm on real data that
these agree to the rupee — each group is computed from one shared module, so any disagreement means
something regressed:

- `/lookup`, `/dashboard`, `/budget`, `/calendar`, `/hub/overview` — the same **locked + card**
- `/hub/debt`, `/dashboard`, `/overview`, `/payoff` — the same **Total Debt**

And confirm `/admin` loads without a red banner or a 500 — see item 3 at the top.

---

## Backup

`/export` produces a JSON export covering all eleven entities plus snapshots and paid-marks.
**There is no restore** — nothing in the app reads that file back. It is an export, not a recovery
mechanism. Building an import is real work: id remapping, referential ordering (cards before card
EMIs), a merge-versus-replace decision.

The reliable backup is a database dump. `backup.sh` takes its credentials from the `finflow-mysql`
container itself (no `.env` needed) and keeps the last 7 dumps in `~/finflow-backups/`:
```bash
./backup.sh                          # dumps Docker's finflow-mysql
```

**Nightly schedule (installed 31 Oct 2026).** `scripts/com.finflow.backup.plist` runs it daily at 21:30
via launchd (not cron: a run missed while the Mac sleeps happens on wake). Docker must be running.
macOS blocks background jobs from reading `~/Downloads`, so the job runs an installed copy at
`~/finflow-backups/backup.sh`. **After changing `backup.sh`, re-copy it.** To install or reinstall:
```bash
install -m 755 backup.sh ~/finflow-backups/backup.sh
cp scripts/com.finflow.backup.plist ~/Library/LaunchAgents/
launchctl bootout gui/$(id -u)/com.finflow.backup 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.finflow.backup.plist
launchctl kickstart gui/$(id -u)/com.finflow.backup     # run now; check ~/finflow-backups/backup.log
```

**Restore** (tested 31 Oct 2026 into a scratch database: every table count matched):
```bash
docker stop finflow-backend
docker exec finflow-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE finflow; CREATE DATABASE finflow;"'
docker exec -i finflow-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot finflow' < ~/finflow-backups/finflow_YYYYMMDD_HHMMSS.sql
docker start finflow-backend
```

---

## What changed and why (fixed this session)

| Item | Was | Now |
|---|---|---|
| Vite dev proxy | absent — every `/api` call 404'd in `npm run dev` | proxies to the local backend, port-aware |
| CORS | two conflicting definitions, exact-origin match | one definition, port-wildcard pattern |
| Login on wrong password | hard-redirected to a blank `/login`, no message | shows the server's message inline, no reload |
| `application.yml` secrets | fell back to a repo-public password and JWT secret | no fallback — fails loudly if unset |
| `backup.sh` | hardcoded `finflow123` | reads `MYSQL_PASSWORD` from `.env` |
| Docker/local ports | both wanted 3000/8080 | offset — Docker on 3100/8180/3307, local unchanged |
| `docker-compose.yml` | `version:` key (obsolete, warns on every run) | removed |
| `BreakSavingsPage` | list items keyed on an inner `div`, not the fragment map returns — React warning, occasional misrender | keyed on `<Fragment key={s.id}>` |
| `useFinancials.ts`, `amortize.ts`, `OutflowSummary.tsx` | dead code, zero importers | moved to `_to_delete/` |

Full screen walk: 24/25 clean on first pass; `/history` failed with a real crash
(`snapshots.sort` calling `.localeCompare` on a field the fixture had misnamed relative to the
actual `MonthlySnapshot` entity) — confirmed against `entity/MonthlySnapshot.java` and it was a
fixture error, not an app bug; corrected and re-verified clean.

---

## Two open product decisions

Neither is a bug; both change numbers, so they're yours to make.

**Should Calendar group by card?** Calendar creates a row per card EMI plus one per statement
balance; Lookup shows one chip per card covering both. That's the entire reason their counts can
differ by one or two.

**Should Net Worth include future interest?** Debt is *total still to pay*, so net worth carries
interest that hasn't accrued yet. `calcDebt().totalPrincipal` is available if you want Net Worth to
use the settle-today reading while the debt headlines keep the interest-inclusive one.

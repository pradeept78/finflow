# FinFlow — one-time setup

For how to actually run the app day to day (local vs Docker, ports, secrets, backups), see
**RUNNING.md** — this file previously duplicated that content with its own port numbers and
sample credentials, and the two drifted out of sync. This one now covers only what RUNNING.md
doesn't: installing prerequisites once, and IDE setup.

## Prerequisites

**Docker Desktop** (for the Docker path) — https://www.docker.com/products/docker-desktop

**Java 21, Maven, Node 20+** (for the local path):
```bash
brew install openjdk@21 maven node
java -version    # confirm 21
mvn -version     # confirm it reports Java 21, not an older JDK Maven happens to be using
node -v          # confirm 20+
```
If `mvn -version` reports an older Java than `java -version` does, point `JAVA_HOME` at the newer
one explicitly — Maven doesn't always pick the JDK you'd expect:
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

**A database.** Either Docker's MySQL (nothing to install — `docker compose` brings it up) or a
native MySQL install for local development. Note there is no `mvnw` wrapper committed to this repo,
so local runs use whatever `mvn` resolves on your `PATH`, not a pinned version.

## First-time configuration

```bash
git clone <repo> && cd finflow-clean
cp .env.example .env
```
Fill in `.env` — see **RUNNING.md → Secrets** for exactly what's required and why nothing in it has
a working default anymore. Do this once; both the Docker and local paths read the same file.

## IntelliJ (optional)

1. **File → Open** → select `finflow-clean/backend`. IntelliJ auto-detects the Maven project.
2. Run configuration for `FinFlowApplication`: add `local` under **Active profiles**, and under
   **Environment variables** add `JWT_SECRET` (from `.env`) — IntelliJ run configs don't source
   your shell's `.env`, so without this the backend fails to start with `Could not resolve
   placeholder 'JWT_SECRET'`, which is correct behaviour, not a bug to work around by hardcoding a
   value into `application.yml`.
3. Frontend: open `finflow-clean/frontend` in VS Code (or a second IntelliJ window) and run
   `npm run dev` from its terminal.

## Troubleshooting

**Port already in use:**
```bash
lsof -nP -iTCP:<port> -sTCP:LISTEN     # e.g. 3000, 8080, 3306, 3100, 8180, 3307
kill -9 <PID>
```
Local and Docker use different ports by design (see RUNNING.md), so this is usually a leftover
process from an earlier session rather than a real conflict between the two stacks.

**Backend won't start, complains about a placeholder:** that's `JWT_SECRET` or
`SPRING_DATASOURCE_PASSWORD` missing from the environment — see RUNNING.md → Secrets. This is
intentional; the fix is to supply the value, not to add a default back into `application.yml`.

**Flyway migration error:**
```bash
mysql -u root -p -e "DROP DATABASE finflow; CREATE DATABASE finflow;"   # WARNING: deletes all data
```
Then restart the backend — Flyway re-runs every migration against the empty schema.

**Frontend can't reach the backend:** confirm the backend is actually up on the port the frontend
expects (the dev badge in the bottom-left corner names it), and that `frontend/vite.config.ts` still
has its `server.proxy['/api']` block.

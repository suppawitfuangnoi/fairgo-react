# FairGo Rollout Checklist — Phase 10

> Covers the full deployment lifecycle from local verification through production smoke testing and rollback procedures.
>
> **Legend:** `[ ]` = not done, `[x]` = done, `[!]` = blocked / needs attention

---

## 1. Local Development Verification

### Code quality

- [ ] `pnpm tsc --noEmit` — zero TypeScript errors in all workspaces
- [ ] `pnpm vitest run` — all test suites pass (target: 317+ tests)
- [ ] No `console.error` output from test run except expected mock fallbacks
- [ ] ESLint passes (if configured): `pnpm lint`

### Environment

- [ ] `.env.local` set with at minimum:
  - `DATABASE_URL` (local PostgreSQL)
  - `JWT_SECRET` (≥ 32 random chars)
  - `JWT_REFRESH_SECRET` (≥ 32 random chars, different from above)
  - `NODE_ENV=development`
- [ ] `BOOTSTRAP_SECRET` set to ≥ 16 char random string for dev use
- [ ] `OTP_PROVIDER=mock` (or equivalent) so real SMS not sent during dev

### Database

- [ ] `npx prisma migrate dev` applies all pending migrations cleanly
- [ ] `npx prisma generate` completes without errors
- [ ] Seed data present if required (`npx prisma db seed`)

### End-to-end local smoke

- [ ] `pnpm dev` starts all apps without errors
- [ ] Socket.IO server starts on correct port (default: 3001)
- [ ] POST `/api/v1/auth/request-otp` returns `{ success: true }`
- [ ] Background scheduler starts (check log: `[Scheduler] Starting all background jobs`)
- [ ] Admin monitoring endpoint responds: GET `/api/v1/admin/monitoring`

---

## 2. Staging Verification Checklist

### Infrastructure

- [ ] Railway (or equivalent) staging project configured
- [ ] PostgreSQL (Aiven or Railway Postgres) accessible from staging app
- [ ] Environment variables set in staging (see Operational Docs for full list)
- [ ] `NODE_ENV=production` set in staging to exercise production code paths
- [ ] `BOOTSTRAP_SECRET` set with a staging-specific value (not same as prod)

### Deployment

- [ ] `npx prisma migrate deploy` runs as part of deploy pipeline — no errors
- [ ] All 5 migrations applied successfully (`prisma migrate status`)
- [ ] Migration 000005 (`job_runs` table) confirmed applied
- [ ] App starts without crashing (check Railway logs for startup errors)
- [ ] No "CRITICAL:" JWT secret warnings in logs (confirms non-default secrets)
- [ ] No "CRITICAL: CORS wildcard" warnings when `CUSTOMER_APP_URL` is set to a real domain

### Connectivity

- [ ] Customer app (staging URL) loads in browser, no CORS errors in console
- [ ] Driver app (staging URL) loads in browser
- [ ] Admin app (staging URL) loads, login works
- [ ] WebSocket connects from customer app (check browser network tab for `ws://` or `wss://`)

### Feature validation

- [ ] Run through complete ride flow: request → offer → accept → trip → complete
- [ ] Run QA checklists from `phase10-qa-checklists.md` (abbreviated pass on critical paths)
- [ ] Background jobs confirmed running (check `job_runs` table for recent entries)
- [ ] Rate limiting working: 11 OTP requests from same IP in under 10 min → 429

---

## 3. Production Verification Checklist

### Pre-deploy checklist (run before deploying)

- [ ] All staging tests passed
- [ ] Git tag created for the release: `git tag v1.0.0-rc1`
- [ ] Database backup taken (Aiven: create manual backup before migration)
- [ ] Current prod traffic monitored — deploy during low-traffic window
- [ ] Team notified of deploy window
- [ ] Rollback branch/commit SHA noted: `____________________________`

### Environment variables (production)

- [ ] `DATABASE_URL` points to production database
- [ ] `JWT_SECRET` is a new, strong random secret (not the dev default)
- [ ] `JWT_REFRESH_SECRET` is a new, strong random secret (not the dev default)
- [ ] `JWT_EXPIRES_IN=86400` (24h) confirmed
- [ ] `JWT_REFRESH_EXPIRES_IN=604800` (7d) confirmed
- [ ] `BOOTSTRAP_SECRET` either unset (to disable) or set to a strong value
- [ ] `CUSTOMER_APP_URL` set to production customer app domain (not `*`)
- [ ] `DRIVER_APP_URL` set to production driver app domain
- [ ] `NODE_ENV=production`
- [ ] OTP provider configured (Twilio / DTAC / AIS / etc.) with real credentials

### Deployment

- [ ] `npx prisma migrate deploy` — zero errors
- [ ] App replicas come up without crash-loops
- [ ] Logs show `[Scheduler] Starting all background jobs` within 60 s of startup
- [ ] No CRITICAL warnings in first 5 minutes of logs

---

## 4. Post-Deploy Smoke Tests

Run these immediately after every production deployment.

### Health

- [ ] GET `/api/v1/health` → `{ status: "ok" }` within 2 s
- [ ] GET `/api/v1/admin/monitoring` (admin JWT) → 200 with system stats
- [ ] Socket.IO handshake succeeds (open browser console, confirm no WS errors)

### Auth flow

- [ ] POST `/api/v1/auth/request-otp` with a real Thai phone → OTP SMS received
- [ ] POST `/api/v1/auth/verify-otp` with correct code → `{ accessToken, refreshToken }`
- [ ] POST `/api/v1/auth/refresh` with valid refresh token → new token pair

### Ride creation

- [ ] POST `/api/v1/rides` (customer token) with valid body → 201 Created
- [ ] GET `/api/v1/rides` → rides array returned, no 5xx

### Rate limit

- [ ] OTP endpoint returns `Retry-After` header after 10 requests from same IP

### Security headers

- [ ] Response headers include `X-Content-Type-Options: nosniff`
- [ ] Response headers include `X-Frame-Options: DENY`

### Background jobs

- [ ] After 2 min: `job_runs` table has entries for at least `otp-cleanup` and `driver-presence-cleanup`

---

## 5. Rollback Checklist

Use if any smoke test fails or a critical bug is discovered post-deploy.

### Immediate decision gate

- [ ] Severity assessed: is this a data-corruption risk? → immediate rollback
- [ ] Severity assessed: is this a complete service outage? → immediate rollback
- [ ] Severity assessed: is this a partial degradation only? → consider hotfix path

### Railway rollback procedure

1. [ ] In Railway dashboard: navigate to the **API** service → **Deployments**
2. [ ] Find the last-known-good deployment
3. [ ] Click **Redeploy** on that deployment
4. [ ] Monitor logs — app should start without errors within 90 s
5. [ ] Re-run smoke tests (Section 4) against the rolled-back version

### Database rollback (if migration was involved)

> **Note:** Prisma does not support automatic down-migrations. Manual SQL is required.

- [ ] Identify which migration introduced the breaking change
- [ ] Restore from the pre-deploy backup taken in Section 3
- [ ] Or write a compensating migration (preferred for additive-only changes):
  - `npx prisma migrate dev --name rollback_migration_name`
  - Apply to prod with `npx prisma migrate deploy`
- [ ] Confirm `prisma migrate status` matches expected state

### Post-rollback

- [ ] All smoke tests passing on rolled-back version
- [ ] Incident documented in team channel with: deploy time, rollback time, root cause
- [ ] Hotfix branch created for the failing change
- [ ] Stakeholders notified of service interruption and resolution

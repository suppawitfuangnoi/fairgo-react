# FairGo Operational Documentation — Phase 10

---

## 1. Environment Variable Reference

All variables are required unless marked **optional**.

### Database

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/fairgo?sslmode=require` | Full Prisma-compatible Postgres URL |
| `DIRECT_URL` | Same as `DATABASE_URL` | Used by Prisma for migrations; may differ for connection-pooling setups |

### JWT / Auth

| Variable | Example | Notes |
|----------|---------|-------|
| `JWT_SECRET` | `<64 random hex chars>` | Signs access tokens. **Never** use the default dev value in production — startup will warn if detected |
| `JWT_REFRESH_SECRET` | `<64 random hex chars, different from JWT_SECRET>` | Signs refresh tokens |
| `JWT_EXPIRES_IN` | `86400` | Access token lifetime in seconds (default: 24 h) |
| `JWT_REFRESH_EXPIRES_IN` | `604800` | Refresh token lifetime in seconds (default: 7 d) |

### CORS / Origins

| Variable | Example | Notes |
|----------|---------|-------|
| `CUSTOMER_APP_URL` | `https://customer.fairgo.app` | Allowed CORS origin for customer frontend. `*` is accepted in dev only; rejected in production |
| `DRIVER_APP_URL` | `https://driver.fairgo.app` | Allowed CORS origin for driver frontend |
| `ADMIN_APP_URL` | `https://admin.fairgo.app` | **optional** — allowed CORS origin for admin frontend |

### OTP / SMS

| Variable | Example | Notes |
|----------|---------|-------|
| `OTP_PROVIDER` | `twilio` or `mock` | Set to `mock` in development to skip real SMS; `mock` also returns `debugCode` in the API response |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx` | **optional** — required if `OTP_PROVIDER=twilio` |
| `TWILIO_AUTH_TOKEN` | `xxxxxxxx` | **optional** — required if `OTP_PROVIDER=twilio` |
| `TWILIO_PHONE_NUMBER` | `+14155551234` | **optional** — Twilio sender number |

### Security

| Variable | Example | Notes |
|----------|---------|-------|
| `BOOTSTRAP_SECRET` | `<16+ random chars>` | Enables the `/api/v1/dev/bootstrap` endpoint. Unset or short (< 16 chars) → endpoint returns 403 |
| `NODE_ENV` | `production` | Must be `production` in live environments to activate security guards |

### Server

| Variable | Example | Notes |
|----------|---------|-------|
| `PORT` | `3000` | HTTP/Socket.IO port (default: 3000) |
| `SOCKET_CORS_ORIGIN` | `https://customer.fairgo.app` | **optional** — Socket.IO CORS origin override |

---

## 2. Migration Checklist

FairGo uses Prisma Migrate. Migrations are in `apps/api/prisma/migrations/`.

### Current migrations (as of Phase 10)

| # | Name | Description |
|---|------|-------------|
| 000001 | `init` | Base schema: users, profiles, vehicles |
| 000002 | `ride_flow` | RideRequest, RideOffer, Trip |
| 000003 | `ratings_notifications` | Rating, Notification models |
| 000004 | `audit_refresh_tokens` | AuditLog, RefreshToken models |
| 000005 | `job_runs` | JobRun model for distributed background job locking |

### Applying migrations

**Development:**
```bash
cd apps/api
npx prisma migrate dev
```

**Staging / Production:**
```bash
cd apps/api
npx prisma migrate deploy
```

> `migrate deploy` applies only pending migrations and never creates new ones. Safe to run in CI/CD pipelines.

### Connection pool note (Aiven free tier)

Aiven free-tier PostgreSQL limits connections to 25. `prisma migrate deploy` briefly opens its own connection. If the app is running with several replicas, you may hit the limit during deployment.

**Mitigation:**
- Deploy during low-traffic, or
- Stop one replica before deploying, or
- Use `pgbouncer` connection pooling (Aiven Pro feature)

### Rolling back a migration

Prisma does not auto-generate down-migrations. Options:

1. **Restore from backup** (safest for destructive changes)
2. **Compensating migration:** add a new migration that reverses the change (suitable for additive-only changes like adding a table)
3. **Manual SQL:** connect to the DB and execute the reverse DDL, then delete the migration record from `_prisma_migrations`

---

## 3. Background Job Schedule & Cleanup Checklist

All jobs are managed by `apps/api/src/lib/jobs/scheduler.ts` and start automatically when the Next.js custom server starts.

### Job schedule

| Job | First run (after startup) | Interval | What it does |
|-----|--------------------------|----------|--------------|
| `otp-cleanup` | 10 s | 30 min | Deletes expired OTP records from the database |
| `driver-presence-cleanup` | 10 s | 2 min | Sets `isOnline = false` for drivers whose last heartbeat is > 5 min old, unless they have an active trip |
| `offer-cleanup` | 30 s | 5 min | Moves expired RideOffers to `EXPIRED` status, emits WebSocket events |
| `ride-request-cleanup` | 30 s | 5 min | Expires stale RideRequests (`PENDING`/`NEGOTIATING` past `expiresAt`) |
| `trip-stuck-detection` | 30 s | 10 min | Logs and emits admin WebSocket alert for trips stuck in a status beyond their threshold |

### Trip stuck thresholds

| Status | Threshold |
|--------|-----------|
| `DRIVER_ASSIGNED` | 30 min |
| `DRIVER_EN_ROUTE` | 45 min |
| `DRIVER_ARRIVED` | 20 min |
| `IN_PROGRESS` | 240 min (4 h) |
| `AWAITING_CASH_CONFIRMATION` | 30 min |

### Monitoring jobs

Query the `job_runs` table to verify jobs are running:

```sql
SELECT job_name, last_run_at, last_duration_ms, last_result
FROM job_runs
ORDER BY last_run_at DESC;
```

Check the admin monitoring API:
```
GET /api/v1/admin/monitoring
Authorization: Bearer <admin_token>
```

The response includes a `jobStats` object with each job's last run time and result.

### Distributed lock safety

Jobs use atomic `ON CONFLICT DO UPDATE WHERE` on the `job_runs` table to prevent concurrent runs across multiple replicas. If a job is already running (lock TTL not expired), a second instance will skip that cycle and log `[JobName] Lock not acquired — skipping`.

---

## 4. Support Team Troubleshooting Guide

### "User can't log in — OTP not received"

1. Check OTP provider logs (Twilio dashboard or SMS gateway)
2. Confirm the phone number is in Thai format (`+66` prefix or `0XXXXXXXXX`)
3. Check rate limit: `SELECT * FROM audit_logs WHERE action = 'OTP_IP_RATE_LIMIT_EXCEEDED' ORDER BY created_at DESC LIMIT 10`
4. Verify `OTP_PROVIDER` env var is not `mock` in production

### "User gets 403 on every request"

Most likely the account is suspended:
```sql
SELECT id, phone, status, role FROM users WHERE phone = '+66XXXXXXXXX';
```
To reactivate: Admin app → Users → find user → Change Status → Active

Or via API (admin token required):
```
PATCH /api/v1/admin/users/:id/status
{ "status": "ACTIVE" }
```

### "Driver not receiving ride requests"

1. Confirm `isOnline = true` and `isVerified = true`:
   ```sql
   SELECT is_online, is_verified, current_latitude, current_longitude
   FROM driver_profiles WHERE user_id = '<uid>';
   ```
2. Confirm driver is within zone of ride request (crude 10 km check via lat/lon ± 0.09°)
3. Check driver's WebSocket connection — they must be in the correct Socket.IO room `zone:{lat10}:{lon10}`
4. Check `driver-presence-cleanup` logs — if heartbeat gap > 5 min, driver was auto-offlined

### "Trip is stuck / driver went offline mid-trip"

1. `trip-stuck-detection` will emit `monitor:trip_stuck` to `admin:monitor` room within 10 min
2. Admin can force-cancel via `PATCH /api/v1/admin/trips/:id/force-cancel`
3. To investigate: query the `audit_logs` for `TRIP_STUCK_WARNING` with the trip ID

### "Duplicate payment confirmation (customer pressed twice)"

The `confirm-payment` endpoint uses an atomic `UPDATE WHERE status = 'AWAITING_CASH_CONFIRMATION'` guard. Only one confirmation can win. If a second request comes in after the first succeeds, it will return 409 Conflict. No duplicate `COMPLETED` records will be created.

### "Rate limit 429 — customer locked out"

Rate limits are in-memory per server instance and reset after the window (10 min for OTP). If the customer is legitimately locked:
1. Wait 10 minutes for the window to expire (no admin reset mechanism currently)
2. If behind a NAT/shared IP, note that IP-based limits affect all users sharing the IP

### "Background jobs not running"

1. Check that `startScheduler()` was called — look for `[Scheduler] Starting all background jobs` in startup logs
2. If multiple replicas: check `job_runs` table to confirm at least one replica acquired the lock
3. If no lock acquired in > 2× the interval: check if `job_runs` table exists (migration 000005 may be pending)

### "WebSocket not connecting"

1. Confirm `PORT` env var matches the Socket.IO server port
2. Confirm `SOCKET_CORS_ORIGIN` (or `CUSTOMER_APP_URL`) matches the frontend origin exactly (no trailing slash)
3. Check browser console for CORS errors on the WebSocket handshake
4. Railway: ensure the service does not have a response timeout shorter than the WebSocket keep-alive interval

---

## 5. Known Limitations

These are deliberate constraints of the current MVP. Each is marked with a suggested Phase 2 resolution.

### L1: No real SMS OTP in development/staging
**Current behavior:** `OTP_PROVIDER=mock` returns `debugCode` in the API response body. In production, set a real SMS provider.
**Phase 2:** Integrate a Thai SMS gateway (AIS/DTAC/NTTD) or Twilio with `+66` numbers.

### L2: Cash-only payment
**Current behavior:** The schema accepts `CARD` and `WALLET` payment methods, but only the `CASH` confirm-payment flow is fully implemented.
**Phase 2:** Integrate Omise or PromptPay for digital payments.

### L3: No push notifications (FCM/APNs)
**Current behavior:** Notifications are persisted to the `notifications` table and delivered via WebSocket to connected clients. Offline users miss real-time events but see them on next load.
**Phase 2:** Integrate Firebase Cloud Messaging for background push notifications.

### L4: In-memory rate limiter (no Redis)
**Current behavior:** `rate-limit.ts` uses a Node.js in-memory store. On multi-replica deployments, each replica has its own counter — a client can make N requests to each replica.
**Phase 2:** Replace with a Redis-backed rate limiter (e.g., `rate-limiter-flexible` with Redis adapter).

### L5: No JWT token blacklist
**Current behavior:** When a user is suspended, their existing access token (up to 24 h remaining) still passes JWT verification. The `requireActiveAuth` middleware catches this via a DB status check on every sensitive write, but stateless reads (`GET /rides`, etc.) can still proceed.
**Phase 2:** Add a Redis token blacklist or reduce JWT TTL to 15 min with mandatory refresh.

### L6: Zone-based driver matching is crude
**Current behavior:** Drivers are matched to ride requests using a ±0.09° lat/lon bounding box (~10 km). This does not account for city geography or road networks.
**Phase 2:** Integrate PostGIS for proper geospatial queries, or use a dedicated matching service.

### L7: No dispute resolution UI
**Current behavior:** Disputes can be created and resolved via API, but there is no admin UI panel for dispute management.
**Phase 2:** Add a disputes queue to the admin app with evidence attachment support.

### L8: No document upload for driver verification
**Current behavior:** `isVerified` can be set by admin without uploading or reviewing actual license/vehicle documents.
**Phase 2:** Integrate S3/Cloudflare R2 for document storage; add admin document review workflow.

### L9: Scheduler runs only within the API server process
**Current behavior:** Background jobs run via `setInterval` inside `server.ts`. On zero-downtime deploys, there is a brief window where two scheduler instances overlap.
**Phase 2:** Move jobs to a dedicated worker process or use a distributed job queue (BullMQ with Redis).

### L10: No audit log pagination/search UI
**Current behavior:** Audit logs are stored in the `audit_logs` table and available via DB query but not surfaced in the admin app.
**Phase 2:** Add an audit log viewer in the admin app with date range and event type filters.

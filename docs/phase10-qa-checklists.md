# FairGo Manual QA Checklists — Phase 10

> **Scope:** Manual end-to-end QA covering all four surfaces (customer app, driver app, admin app, backend API) plus cross-cutting scenarios (reconnect, stale data, security).
>
> **Environment prerequisites:** Staging environment running with real PostgreSQL, Socket.IO server, and at least one verified driver account.
>
> **Legend:** `[ ]` = not tested, `[x]` = passed, `[!]` = failed/blocked

---

## 1. Customer App QA Checklist

### 1.1 Authentication

- [ ] Request OTP with a valid Thai phone number (0XXXXXXXXX format)
- [ ] Request OTP with +66 format — same code sent, normalised server-side
- [ ] Request OTP with invalid number — error message shown, no OTP sent
- [ ] Enter correct 6-digit OTP — logged in, redirected to home
- [ ] Enter wrong OTP — error shown, retry counter decremented
- [ ] Enter wrong OTP 5 times — account locked / too many attempts shown
- [ ] Wait for OTP cooldown (60 s) before re-requesting — re-request button re-enables
- [ ] OTP expires after 5 minutes — expired error shown on late submission
- [ ] New device login creates new JWT pair; old token still works until it expires
- [ ] Logout clears tokens from storage; protected routes redirect to login

### 1.2 Ride Request Flow

- [ ] Home screen loads map and shows user's current location
- [ ] Pick a pickup location by map pin drag or address search
- [ ] Pick a dropoff location — estimated fare range shown
- [ ] Switch vehicle type (TAXI / MOTORCYCLE / TUKTUK) — fare range updates
- [ ] Submit ride request — confirmation shown, status changes to PENDING
- [ ] Cancel ride while PENDING — status changes to CANCELLED_BY_PASSENGER
- [ ] Cannot submit a second ride request while one is PENDING (UI blocks)

### 1.3 Offer Negotiation

- [ ] Receive a driver offer in real time (WebSocket push)
- [ ] View offer details: driver name, avatar, vehicle, fare, ETA
- [ ] Accept driver offer — status transitions to MATCHING → DRIVER_ASSIGNED
- [ ] Reject driver offer — offer marked rejected, ride stays NEGOTIATING
- [ ] Counter-offer with a different fare — driver sees counter in their app
- [ ] Receive driver counter-offer — ACCEPT / REJECT / COUNTER options shown
- [ ] Offer expires (after configured timeout) — expired banner shown, no action possible

### 1.4 Active Trip

- [ ] DRIVER_EN_ROUTE: driver location shown on map updating in real time
- [ ] DRIVER_ARRIVED: arrival notification displayed
- [ ] PICKUP_CONFIRMED: trip timer starts
- [ ] IN_PROGRESS: live route shown, distance and fare ticking
- [ ] ARRIVED_DESTINATION: "You have arrived" shown
- [ ] Cash payment flow: "Confirm cash paid" button → COMPLETED
- [ ] Cannot press "Confirm cash paid" twice (idempotency guard)
- [ ] Trip detail screen available after completion with final fare

### 1.5 Post-Trip

- [ ] Rating screen appears automatically after COMPLETED
- [ ] Submit 1–5 star rating with optional tags and comment
- [ ] Cannot rate the same trip twice — already-rated message shown
- [ ] Trip appears in ride history list with correct status and fare

### 1.6 Profile

- [ ] Update display name — saved and reflected in header
- [ ] Update email — validation on invalid format
- [ ] Change locale between `th` and `en` — UI language switches
- [ ] Upload profile avatar — new image shown

---

## 2. Driver App QA Checklist

### 2.1 Authentication & Onboarding

- [ ] Register with Thai phone number — DRIVER role assigned
- [ ] Complete profile: license number, vehicle registration
- [ ] Upload required documents (if document upload UI is present)
- [ ] Unverified driver sees "pending verification" banner
- [ ] Verified driver (approved by admin) can go online

### 2.2 Going Online / Offline

- [ ] Toggle online — isOnline set to true, location shared
- [ ] Toggle offline — isOnline set to false, stops receiving ride requests
- [ ] App killed while online — presence cleanup job sets offline after 5 min heartbeat gap
- [ ] Driver with an active trip: presence cleanup job does NOT set offline regardless of heartbeat gap

### 2.3 Receiving Ride Requests

- [ ] New ride request notification appears (push + in-app banner)
- [ ] Ride request card shows pickup, dropoff, fare range, vehicle type, distance
- [ ] Multiple simultaneous requests shown as a list
- [ ] Expired request disappears from list automatically
- [ ] Only PENDING requests shown (MATCHING/MATCHED not listed)

### 2.4 Offer Negotiation

- [ ] Submit offer at a fare within the customer's min–max range
- [ ] Submit offer outside range — API returns 422, error shown
- [ ] Receive customer counter-offer in real time
- [ ] Accept counter-offer — ride transitions to DRIVER_ASSIGNED
- [ ] Reject customer counter-offer — back to NEGOTIATING

### 2.5 Active Trip

- [ ] Accept ride — map shows route to pickup
- [ ] Update status to DRIVER_ARRIVED when at pickup
- [ ] Confirm passenger pickup — PICKUP_CONFIRMED
- [ ] Trip moves to IN_PROGRESS on pickup confirmation
- [ ] Update location every few seconds — visible on customer's map
- [ ] Mark as ARRIVED_DESTINATION
- [ ] Request cash confirmation from passenger
- [ ] Trip completes after passenger confirms cash payment
- [ ] Cannot mark same status twice (e.g., double ARRIVED_DESTINATION)

### 2.6 Earnings & History

- [ ] Completed trip appears in earnings history
- [ ] Correct fare shown
- [ ] Rating received from customer visible on profile

---

## 3. Admin App QA Checklist

### 3.1 Authentication

- [ ] Admin login with email + password
- [ ] Wrong password — error shown, no token issued
- [ ] Admin JWT includes `role: "ADMIN"`; accessing customer endpoints returns 403
- [ ] Admin profile section in `/users/me` — `adminProfile` object included (not in customer/driver responses)

### 3.2 User Management

- [ ] View paginated user list — all roles visible
- [ ] Filter by role (CUSTOMER / DRIVER / ADMIN)
- [ ] Filter by status (ACTIVE / INACTIVE / SUSPENDED)
- [ ] Search by name or phone
- [ ] View individual user detail
- [ ] Suspend a user — status changes to SUSPENDED
- [ ] Suspended user cannot log in (new login attempt blocked)
- [ ] Suspended user with active JWT gets 403 on next sensitive write
- [ ] Reactivate suspended user — status changes to ACTIVE

### 3.3 Driver Verification

- [ ] Pending verification requests listed in driver queue
- [ ] Approve driver — `isVerified: true`, `verificationStatus: APPROVED`
- [ ] Reject driver with a reason — rejection reason saved
- [ ] Approved driver receives notification

### 3.4 Ride & Trip Oversight

- [ ] View all ride requests with filters (status, vehicle type)
- [ ] View all trips with filters (status)
- [ ] View individual trip detail: driver, customer, fare, timeline
- [ ] Force-cancel a trip from any status — CANCELLED status, `cancelledAt` set
- [ ] Forced cancellation appears in admin audit log

### 3.5 Monitoring Dashboard

- [ ] `/api/v1/admin/monitoring` returns system stats
- [ ] Active trips count accurate
- [ ] Online drivers count accurate
- [ ] Background job stats visible (last run, lock acquired)
- [ ] No 5xx errors on the monitoring endpoint

### 3.6 Audit Log

- [ ] `AUTH_LOGIN` events logged on successful login
- [ ] `AUTH_OTP_VERIFY_FAILED` logged on wrong OTP
- [ ] `SUSPENDED_USER_ACCESS_ATTEMPT` logged when suspended user hits protected endpoint
- [ ] `BOOTSTRAP_SECRET_MISMATCH` logged on bad bootstrap attempt
- [ ] Admin-initiated user status changes logged

---

## 4. Backend Operations QA Checklist

### 4.1 Background Jobs

- [ ] `otp-cleanup`: expired OTP records removed from DB after job run (verify via DB query)
- [ ] `offer-cleanup`: expired offers moved to EXPIRED status
- [ ] `ride-request-cleanup`: expired ride requests moved to EXPIRED
- [ ] `trip-stuck-detection`: trip stuck in DRIVER_EN_ROUTE > 45 min triggers `monitor:trip_stuck` WebSocket event to admin room
- [ ] `driver-presence-cleanup`: driver offline > 5 min without an active trip → `isOnline` set to false
- [ ] Driver with active trip NOT set offline by presence cleanup regardless of heartbeat gap
- [ ] Job lock prevents duplicate runs across replicas (deploy two instances, confirm only one lock acquired per cycle)

### 4.2 Rate Limiting

- [ ] OTP request: 10 requests per IP per 10 minutes — 11th returns 429
- [ ] OTP verify: 20 requests per IP per 10 minutes — 21st returns 429
- [ ] Bootstrap endpoint: 5 requests per IP per 15 minutes — 6th returns 429
- [ ] Rate limit resets after the window expires (wait 10 min, 11th request now succeeds)

### 4.3 Security Headers

- [ ] All API responses include `X-Content-Type-Options: nosniff`
- [ ] All API responses include `X-Frame-Options: DENY`
- [ ] All API responses include `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] HTTPS responses include `Strict-Transport-Security`
- [ ] OPTIONS preflight returns 204 with CORS headers

### 4.4 CORS

- [ ] Customer origin in `CUSTOMER_APP_URL` allowed; others rejected
- [ ] `CUSTOMER_APP_URL=*` in staging allows localhost:3001
- [ ] `CUSTOMER_APP_URL=*` in production — startup warning logged, wildcard NOT reflected

### 4.5 Database

- [ ] All migrations applied (`prisma migrate status` shows no pending)
- [ ] `job_runs` table exists and populated after first scheduler run
- [ ] Connection pool not exhausted under concurrent load (monitor Aiven connection count)

---

## 5. Reconnect & Real-Time Scenarios

- [ ] Customer disconnects mid-negotiation — on reconnect, current offer state pushed via `ride:state_recovery`
- [ ] Driver disconnects while IN_PROGRESS — on reconnect, current trip state pushed
- [ ] Driver location updates resume after reconnect (no stale location shown)
- [ ] Admin monitoring room re-subscribed after page refresh
- [ ] Trip stuck event (`monitor:trip_stuck`) emitted to admin room even when admin was offline and reconnects
- [ ] Socket rooms re-joined correctly on reconnect (`user:{id}`, `driver:{id}`, `admin:monitor`)

---

## 6. Stale Data Scenarios

- [ ] Customer holds expired access token — API returns 401; refreshes token; retry succeeds
- [ ] Offer accepted by customer after driver withdrew — conflict handled gracefully (409 or optimistic failure)
- [ ] Driver goes offline between offer creation and customer accept — offer still processable
- [ ] Ride request expires while customer is looking at it — UI shows "expired" without page refresh
- [ ] Admin views a trip that was force-cancelled while viewing — refresh shows CANCELLED status

---

## 7. Security Checks

- [ ] Non-customer cannot POST to `/rides` — returns 403
- [ ] Non-driver cannot POST to `/offers` — returns 403
- [ ] Non-admin cannot access `/admin/*` endpoints — returns 403
- [ ] CUSTOMER cannot access another customer's ride requests (filtered by `customerProfileId`)
- [ ] Refresh token from a different user cannot be used — token validated by `userId` match
- [ ] Pagination `limit=9999` capped at 100 — no DoS via huge page fetch
- [ ] SQL injection via `status` query param — rejected by Zod enum allowlist
- [ ] Bootstrap endpoint with wrong secret — 403 returned, mismatch logged to AuditLog
- [ ] Bootstrap endpoint disabled when `BOOTSTRAP_SECRET` env var not set
- [ ] JWT signed with non-default secret in production — startup warning if default detected

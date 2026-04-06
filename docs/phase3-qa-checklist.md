# Phase 3 — Real-Time Resilience: Manual QA Checklist

> Tester: run through every scenario on a real mobile device (or Chrome DevTools → throttle to "Slow 3G" + toggle offline).
> Mark each row ✅ Pass / ❌ Fail / ⚠️ Partial.

---

## 1. Driver Heartbeat & Presence

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 1.1 | Driver logs in, toggles Online | `driver:online` emitted; DB `isOnline = true`; admin sees driver in socket-health | |
| 1.2 | Driver stays connected for 25 s with no user action | `driver:heartbeat` emitted automatically every 20 s (check browser console) | |
| 1.3 | Driver app tab sits idle for 5 min | Admin `/api/v1/admin/socket-health` response moves driver from `onlineDrivers` → `staleDrivers` (heartbeat age > 2 min) | |
| 1.4 | Driver heartbeat stops for 90+ s (kill tab) | Stale sweep fires; driver auto-marked `isOnline = false` in DB; admin `driver:status:change` received with `reason: heartbeat_timeout` | |
| 1.5 | Driver is mid-trip; kill tab for 2 min | Driver NOT auto-marked offline (`isInTrip = true` exempts them from stale sweep) | |
| 1.6 | Driver toggles Offline manually | `driver:offline` emitted; DB `isOnline = false` immediately | |

---

## 2. Socket Reconnect Resilience

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 2.1 | Driver app: toggle network off for 10 s, back on | Socket reconnects automatically; console shows `[Driver Socket] Connected`; `driver:online` re-emitted | |
| 2.2 | Customer app: toggle network off for 10 s, back on | Socket reconnects; no "5 attempts exceeded" error; console shows reconnect | |
| 2.3 | Admin app: toggle network off, back on | Admin socket reconnects; `drivers:snapshot` received (server sends on every connect) | |
| 2.4 | Driver: access token expires mid-session (manually set short TTL for test) | On reconnect auth error → token refresh call → reconnects with new token | |
| 2.5 | Customer: access token expires mid-session | Same refresh flow | |

---

## 3. Active Trip Restoration

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 3.1 | Customer is on `/trip-active` → hard-refresh browser | App fetches `/trips/active`; navigates back to `/trip-active/:id`; map loads | |
| 3.2 | Driver is on `/trip-active` → hard-refresh browser | Same: fetches `/trips/active`; navigates back; trip room rejoined | |
| 3.3 | Customer on home page → but has active trip in DB | `useActiveSession` detects trip on mount → auto-redirects to `/trip-active/:id` | |
| 3.4 | Driver on home page → but has active trip in DB | `useActiveSession` detects trip on mount → auto-redirects to `/trip-active/:id`; `setOnline()` called | |
| 3.5 | Customer mid-trip: network drops 30 s, comes back | Trip room rejoined on reconnect (`trip:join` emitted); driver location updates resume | |
| 3.6 | Driver mid-trip: network drops 30 s, comes back | Trip room rejoined; `driver:online` re-emitted with `tripId`; `isInTrip = true` on server | |

---

## 4. Active Negotiation Restoration

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 4.1 | Customer is on `/matching` (offers visible) → hard-refresh | `useActiveSession` routes to `/matching?rideId=...`; MatchingPage fetches `/rides/active`; offers list restored | |
| 4.2 | Customer on matching, offers present, offer has 60 s countdown → refresh | Countdown resumes from correct remaining seconds (offer `expiresAt` is used) | |
| 4.3 | Driver submitted offer, waiting → hard-refresh | `useActiveSession` fetches `/offers/driver-pending`; routes to `/submit-offer/:rideId` with `state.restored=true`; waiting screen shows with remaining countdown | |
| 4.4 | Driver submitted offer; customer countered; driver refreshes | `driver-pending` endpoint returns `customerCounter`; SubmitOfferPage shows counter-offer panel with correct fare and round number | |
| 4.5 | Driver on `/submit-offer/:rideId` → network drops 30 s, back | Socket listeners re-attach on reconnect; `offer:counter` / `offer:accepted` still received | |
| 4.6 | Customer on matching; network drops; driver submits offer while offline | On reconnect customer fetches `/rides/active` (via `useActiveSession`); sees the new offer | |

---

## 5. Missed Event Recovery

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 5.1 | Driver gets a new ride request while app is backgrounded (network drop) | On reconnect, `useActiveSession` fetches `/notifications` → notification badge updates; driver sees the request in notification bell | |
| 5.2 | Customer trip status changes (e.g. DRIVER_ARRIVED) while offline | On reconnect, `useActiveSession` fetches notifications + `/trips/active` → UI reflects correct status | |
| 5.3 | Admin is offline; 3 drivers go online/offline | On reconnect, server sends `drivers:snapshot` event → admin dashboard reflects current state | |

---

## 6. Online / Offline State Hardening

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 6.1 | Driver goes online, refreshes app | localStorage `fg_driver_online = true`; on mount `setOnline()` called → `driver:online` emitted | |
| 6.2 | Driver goes offline (manual toggle), refreshes app | localStorage cleared; on mount presence NOT restored (driver stays offline) | |
| 6.3 | Driver goes online, then force-kills Chrome entirely, reopens | `fg_driver_online` flag persists in localStorage → `driver:online` re-emitted on next mount | |
| 6.4 | Two drivers go online, one refreshes page | Refreshed driver re-emits online; admin sees both as online (no flap to offline during reconnect) | |
| 6.5 | Transport-level disconnect (e.g. wifi roam) | Driver NOT immediately marked offline; admin sees `reconnecting: true`; stale timer handles cleanup if they don't return | |

---

## 7. Admin Monitoring

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 7.1 | GET `/api/v1/admin/socket-health` | Returns `{ totalOnlineSockets, onlineDrivers[], staleDrivers[], snapshot_at }` | |
| 7.2 | Stale driver detection | Driver with last heartbeat > 2 min moves from `onlineDrivers` → `staleDrivers` in response | |
| 7.3 | Admin WebSocket events | Admin receives `driver:status:change` with `reason` field on auto-offline | |
| 7.4 | Admin receives heartbeat events | `driver:heartbeat` event fires in admin:monitor room every 20 s per connected driver | |
| 7.5 | Admin on wrong room (old bug) | Verify admin socket no longer emits `join:room 'admin'`; check console shows no manual join | |

---

## 8. Room Rejoin

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 8.1 | Customer joins ride room, disconnects, reconnects | `join:room { room: 'ride:...' }` emitted on reconnect | |
| 8.2 | Driver joins trip room, disconnects, reconnects | `join:room trip:...` emitted on reconnect | |
| 8.3 | `join:room` security: driver tries to join `user:other-id` | Server denies join (not in allowlist for that userId); no room join | |
| 8.4 | Zone room re-registration | Driver emits `driver:location` after reconnect → re-joins correct zone room automatically | |

---

## Regression Checks

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| R1 | Normal ride booking flow (no reconnect) | Works as before | |
| R2 | Normal negotiation flow (no reconnect) | Works as before | |
| R3 | Customer cancels ride | Navigation to `/home` | |
| R4 | Trip completes normally | Navigation to `/trip-summary` | |
| R5 | Admin dashboard loads | No console errors | |

---

## Known Limitations / Out of Scope (Phase 3)

- No FCM / push notifications for true background recovery (would need Phase 4)
- Zone room cleanup after extended driver idle is manual (rely on disconnect or new location ping)
- `reconnecting: true` flag in admin is best-effort (no guaranteed delivery)

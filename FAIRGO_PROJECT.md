# FairGo React — Project Documentation

> **Fair-pricing ride-hailing platform** — Monorepo ที่ประกอบด้วย Web Admin, Customer App, Driver App และ Backend API
> GitHub: `https://github.com/suppawitfuangnoi/fairgo-react`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Tech Stack](#4-tech-stack)
5. [Apps — รายละเอียดแต่ละ App](#5-apps)
6. [API Endpoints](#6-api-endpoints)
7. [Socket.IO Events](#7-socketio-events)
8. [Design System](#8-design-system)
9. [Phase Summary — สิ่งที่ทำไปแล้ว](#9-phase-summary)
10. [สิ่งที่ต้องทำเพิ่ม (Backlog)](#10-backlog)
11. [Environment Variables](#11-environment-variables)
12. [Deploy Manual](#12-deploy-manual)
13. [Local Development](#13-local-development)

---

## 1. Project Overview

FairGo คือแอป ride-hailing ที่ผู้โดยสารสามารถ **ต่อราคา** กับคนขับได้โดยตรง (Fair Negotiated Price) ไม่ใช่ราคาตายตัวจากระบบ

### User Types

| Type | Platform | Description |
|---|---|---|
| **Customer** | Web App (Mobile PWA) | เรียกรถ เลือก offer ติดตามรถ |
| **Driver** | Web App (Mobile PWA) | รับงาน ส่ง offer ขับส่ง |
| **Admin** | Web Dashboard | จัดการระบบ ดู analytics |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      FAIRGO MONOREPO                        │
│                   (pnpm workspaces)                         │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  apps/admin  │   │  apps/customer   │   │  apps/driver     │
│  React+Vite  │   │  React+Vite PWA  │   │  React+Vite PWA  │
│  Port: 5173  │   │  Port: 5174      │   │  Port: 5175      │
└──────┬───────┘   └───────┬──────────┘   └────────┬─────────┘
       │                   │                        │
       │          VITE_API_URL / VITE_SOCKET_URL    │
       └───────────────────┼────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │      apps/api          │
              │  Next.js 14 + Socket.IO│
              │  Railway (Port 4000)   │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Aiven PostgreSQL      │
              │  (via Prisma ORM)      │
              └────────────────────────┘

Shared packages:
  packages/ui          — Reusable React components
  packages/api-client  — TypeScript types + Socket hooks + apiFetch
```

### Request Flow

```
Browser → apiFetch() → VITE_API_URL/api/v1/... → Next.js Route Handler
                                                → Prisma → PostgreSQL

Browser ↔ Socket.IO → VITE_SOCKET_URL → server.ts (Custom Node HTTP + Socket.IO)
                                      → emitToRoom() → Broadcast to rooms
```

### Authentication Flow

```
1. POST /api/v1/auth/request-otp  (phone number)
2. POST /api/v1/auth/verify-otp   → { accessToken, refreshToken, user }
3. Store tokens in localStorage   (fg_access_token, fg_refresh_token, fg_user)
4. apiFetch() auto-attaches Bearer token
5. On 401 → auto-refresh via /api/v1/auth/refresh
```

---

## 3. Monorepo Structure

```
fairgo-react/
├── package.json              # pnpm workspaces root
├── pnpm-workspace.yaml       # workspace config
├── pnpm-lock.yaml
│
├── apps/
│   ├── admin/                # Web Admin Dashboard
│   │   ├── index.html        # PWA meta + SW registration
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── sw.js         # Service Worker
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx      # ErrorBoundary + Toaster
│   │       ├── App.tsx       # Router + ProtectedRoute
│   │       ├── components/
│   │       │   ├── AdminLayout.tsx    # Sidebar + top bar
│   │       │   ├── Toaster.tsx
│   │       │   └── ErrorBoundary.tsx
│   │       ├── pages/
│   │       │   ├── LoginPage.tsx
│   │       │   ├── DashboardPage.tsx  # Live stats + real-time socket
│   │       │   ├── UsersPage.tsx      # จัดการ users
│   │       │   ├── DriversPage.tsx    # Verify/manage drivers
│   │       │   ├── TripsPage.tsx      # Trip history
│   │       │   ├── PricingPage.tsx    # ตั้งราคา base fare
│   │       │   ├── DisputesPage.tsx   # จัดการข้อพิพาท
│   │       │   └── AnalyticsPage.tsx  # Charts & analytics
│   │       ├── lib/
│   │       │   ├── api.ts             # apiFetch (VITE_API_URL)
│   │       │   ├── socket.ts          # Socket.IO client (admin room)
│   │       │   └── toast.ts           # Toast event bus
│   │       └── store/
│   │           └── auth.store.ts      # Zustand auth state
│   │
│   ├── customer/             # Customer Web PWA
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── sw.js
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── Toaster.tsx
│   │       │   └── ErrorBoundary.tsx
│   │       ├── pages/
│   │       │   ├── SplashPage.tsx
│   │       │   ├── OnboardingPage.tsx
│   │       │   ├── LoginPage.tsx       # OTP Login
│   │       │   ├── HomePage.tsx        # แผนที่ + เรียกรถ
│   │       │   ├── RideRequestPage.tsx # ตั้งราคา + เลือก vehicle
│   │       │   ├── MatchingPage.tsx    # รอ offer (Socket real-time)
│   │       │   ├── TripActivePage.tsx  # ติดตามรถ (Socket real-time)
│   │       │   ├── TripSummaryPage.tsx # Receipt หลังถึงที่หมาย
│   │       │   ├── RatingPage.tsx      # ให้คะแนนคนขับ
│   │       │   ├── ProfilePage.tsx     # ข้อมูลส่วนตัว
│   │       │   └── HistoryPage.tsx     # ประวัติการเดินทาง
│   │       ├── lib/
│   │       │   ├── api.ts
│   │       │   └── toast.ts
│   │       └── store/
│   │           └── auth.store.ts
│   │
│   ├── driver/               # Driver Web PWA
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── sw.js
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── BottomNav.tsx       # Nav bar (Home/History/Earnings/Profile)
│   │       │   ├── Toaster.tsx
│   │       │   └── ErrorBoundary.tsx
│   │       ├── pages/
│   │       │   ├── SplashPage.tsx
│   │       │   ├── OnboardingPage.tsx
│   │       │   ├── OnboardingProfilePage.tsx  # กรอกข้อมูลคนขับ+รถ
│   │       │   ├── LoginPage.tsx
│   │       │   ├── HomePage.tsx        # รายการงาน (Socket real-time)
│   │       │   ├── SubmitOfferPage.tsx # ส่ง offer ราคา
│   │       │   ├── TripActivePage.tsx  # ขับส่ง + update status
│   │       │   ├── TripSummaryPage.tsx # สรุปรายได้จาก trip
│   │       │   ├── RatingPage.tsx      # ให้คะแนน customer
│   │       │   ├── EarningsPage.tsx    # รายได้ + bar chart + withdraw
│   │       │   ├── HistoryPage.tsx     # ประวัติ trips ทั้งหมด
│   │       │   └── ProfilePage.tsx     # ข้อมูลส่วนตัว + รถ + logout
│   │       ├── lib/
│   │       │   ├── api.ts
│   │       │   └── toast.ts
│   │       └── store/
│   │           └── auth.store.ts
│   │
│   └── api/                  # Next.js 14 Backend (App Router)
│       ├── server.ts         # Custom HTTP server + Socket.IO
│       ├── railway.json      # Railway deploy config
│       ├── next.config.js
│       ├── prisma/
│       │   └── schema.prisma
│       └── src/
│           ├── app/api/v1/   # Route Handlers
│           │   ├── auth/     # OTP, login, refresh, logout
│           │   ├── rides/    # Create, active, nearby, fare-estimate
│           │   ├── offers/   # Submit, accept/reject
│           │   ├── trips/    # Active, status update, location
│           │   ├── users/    # Profile, driver-profile, location
│           │   ├── wallet/   # Balance, withdraw
│           │   ├── ratings/  # Rate driver/customer
│           │   ├── notifications/ # List, mark-read
│           │   ├── payments/ # Payment records
│           │   ├── vehicles/ # Vehicle registration
│           │   └── admin/    # Dashboard, users, drivers, trips, pricing, disputes, analytics
│           ├── lib/
│           │   ├── prisma.ts
│           │   ├── jwt.ts
│           │   ├── socket.ts     # emitToRoom() helper
│           │   ├── pricing.ts    # Fare calculation
│           │   ├── otp.ts
│           │   ├── validation.ts # Zod schemas
│           │   └── api-response.ts
│           └── middleware/
│               ├── auth.ts       # requireRole()
│               └── validate.ts
│
└── packages/
    ├── ui/                   # Shared React components
    │   └── src/
    │       ├── tokens.ts     # Design tokens
    │       ├── index.ts      # Exports
    │       └── components/
    │           ├── Button.tsx
    │           ├── Input.tsx
    │           ├── Card.tsx
    │           ├── Modal.tsx
    │           ├── Toast.tsx
    │           ├── Spinner.tsx
    │           ├── Badge.tsx
    │           ├── Avatar.tsx
    │           ├── BottomSheet.tsx
    │           ├── MapContainer.tsx
    │           ├── FareSlider.tsx
    │           ├── GoogleMap.tsx
    │           └── StatusBadge.tsx
    │
    └── api-client/           # Shared TypeScript types + utilities
        └── src/
            ├── types.ts      # User, Trip, RideRequest, Offer, etc.
            ├── auth.ts       # localStorage token helpers
            ├── client.ts     # apiFetch<T>() with auto 401 refresh
            ├── socket.ts     # socketClient + socketEvents constants
            ├── index.ts
            └── hooks/
                └── useSocket.ts  # useSocket() + useSocketEvent() React hooks
```

---

## 4. Tech Stack

### Frontend (3 Apps)

| Category | Tech |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 (custom theme) |
| Routing | React Router v6 |
| State | Zustand |
| Real-time | Socket.IO Client 4.x |
| Font | Plus Jakarta Sans (Google Fonts) |
| Icons | Material Symbols Outlined |
| PWA | manifest.json + Service Worker (custom) |

### Backend (apps/api)

| Category | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| HTTP Server | Custom Node.js + next() (server.ts) |
| WebSocket | Socket.IO Server 4.x |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Aiven) |
| Auth | JWT (access 15m + refresh 30d) |
| Validation | Zod |
| Password | bcryptjs |
| Hosting | Railway |

### Infrastructure

| Service | Provider |
|---|---|
| API + Socket.IO | Railway |
| Admin Dashboard | Vercel |
| Customer App | Vercel |
| Driver App | Vercel |
| Database | Aiven PostgreSQL |
| Package Manager | pnpm 9 (workspaces) |
| Source Control | GitHub |

---

## 5. Apps

### 5.1 Admin Dashboard

| Route | Page | Features |
|---|---|---|
| `/login` | LoginPage | Email + password login (admin only) |
| `/dashboard` | DashboardPage | Live stats (users, drivers, trips, revenue), recent trips table, Socket real-time |
| `/users` | UsersPage | รายชื่อ users + ban/unban + search/filter |
| `/drivers` | DriversPage | รายชื่อ drivers + verify/reject + filter status |
| `/trips` | TripsPage | ประวัติ trips ทั้งหมด + filter status + search |
| `/pricing` | PricingPage | ตั้ง base fare, multipliers ตาม vehicle type |
| `/disputes` | DisputesPage | จัดการ disputes + resolve/escalate |
| `/analytics` | AnalyticsPage | Charts: revenue/trips/users trends |

### 5.2 Customer App

| Route | Page | Features |
|---|---|---|
| `/` | SplashPage | Logo animation → auto-redirect |
| `/onboarding` | OnboardingPage | สไลด์แนะนำแอป |
| `/login` | LoginPage | OTP via phone |
| `/home` | HomePage | แผนที่ + ปุ่มเรียกรถ + ประวัติ |
| `/ride-request` | RideRequestPage | กรอก pickup/dropoff + ตั้งราคา min/max/offer |
| `/matching` | MatchingPage | รอ offer (Socket `offer:new`) + radar animation + accept/reject |
| `/trip-active` | TripActivePage | ติดตามรถ real-time (Socket `trip:status`) + call/chat driver |
| `/trip-summary/:id` | TripSummaryPage | Receipt: เส้นทาง + fare breakdown |
| `/rating/:tripId` | RatingPage | ให้คะแนนคนขับ 5 ดาว + feedback chips |
| `/profile` | ProfilePage | ข้อมูลส่วนตัว + แก้ไข + logout |
| `/history` | HistoryPage | ประวัติ trips พร้อม filter + load more |

### 5.3 Driver App

| Route | Page | Features |
|---|---|---|
| `/` | SplashPage | Logo animation |
| `/onboarding` | OnboardingPage | แนะนำแอปคนขับ |
| `/login` | LoginPage | OTP via phone |
| `/onboarding-profile` | OnboardingProfilePage | กรอกข้อมูลส่วนตัว + รถ + ใบขับขี่ |
| `/home` | HomePage | Toggle online/offline + รายการงาน real-time (Socket `ride:new_request`) |
| `/submit-offer/:rideId` | SubmitOfferPage | ดูรายละเอียดงาน + ส่ง offer ราคา |
| `/trip-active` | TripActivePage | ขับส่ง + update status ทีละขั้น + Socket sync |
| `/trip-summary/:id` | TripSummaryPage | สรุปรายได้จาก trip |
| `/rating/:tripId` | RatingPage | ให้คะแนน customer |
| `/earnings` | EarningsPage | Wallet balance + bar chart + withdraw modal |
| `/history` | HistoryPage | ประวัติ trips + filter All/Completed/Cancelled |
| `/profile` | ProfilePage | ข้อมูลส่วนตัว + รถ + edit form + logout |

---

## 6. API Endpoints

Base URL: `https://[RAILWAY_URL]/api/v1`

### Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/request-otp` | Public | ส่ง OTP ไปยังเบอร์โทร |
| POST | `/auth/verify-otp` | Public | ยืนยัน OTP → tokens |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | Auth | Logout + revoke token |
| POST | `/auth/admin-login` | Public | Admin email+password login |

### Rides

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/rides` | Customer | สร้างคำขอเรียกรถ |
| GET | `/rides/active` | Customer | ดู active ride request + offers |
| DELETE | `/rides/:id` | Customer | ยกเลิกคำขอ |
| GET | `/rides/nearby` | Driver | ดูคำขอรอบข้าง |
| GET | `/rides/fare-estimate` | Auth | ประมาณราคา |

### Offers

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/offers` | Driver | ส่ง offer ราคา |
| POST | `/offers/:id/respond` | Customer | Accept / Reject offer |

### Trips

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/trips` | Auth | ดู trip history (paginated) |
| GET | `/trips/active` | Auth | ดู active trip |
| GET | `/trips/:id` | Auth | ดู trip detail |
| PATCH | `/trips/:id/status` | Driver | อัปเดตสถานะ trip |
| POST | `/trips/:id/rate` | Auth | Rate driver/customer |
| PATCH | `/trips/:id/location` | Driver | Update driver location |

### Users

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users/me` | Auth | ดูข้อมูลตัวเอง |
| PATCH | `/users/me` | Auth | แก้ไขข้อมูล |
| PATCH | `/users/me/driver-profile` | Driver | Toggle online + ข้อมูลรถ |
| PATCH | `/users/me/location` | Driver | อัปเดต GPS location |

### Wallet & Payments

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/wallet` | Driver | ดู balance + earnings |
| POST | `/wallet/withdraw` | Driver | ถอนเงิน |
| GET | `/payments` | Auth | ประวัติการชำระเงิน |

### Notifications

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/notifications` | Auth | รายการ notifications |
| PATCH | `/notifications/:id/read` | Auth | Mark as read |
| PATCH | `/notifications/read-all` | Auth | Mark all as read |

### Admin (role: ADMIN)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/dashboard` | Stats: users, drivers, trips, revenue today |
| GET/PATCH | `/admin/users` | จัดการ users |
| GET | `/admin/drivers` | รายชื่อ drivers + pending verification |
| PATCH | `/admin/drivers/:id/verify` | Approve/Reject driver |
| GET | `/admin/trips` | ดู trips ทั้งหมด |
| GET/PATCH | `/admin/pricing` | ตั้ง/แก้ไข fare rules |
| GET | `/admin/disputes` | รายการ disputes |
| PATCH | `/admin/disputes/:id` | Resolve dispute |
| GET | `/admin/analytics` | Revenue/trips/users trends |
| GET | `/admin/rides` | รายการ ride requests |

---

## 7. Socket.IO Events

Server ใช้ custom HTTP server (`server.ts`) ที่รัน Next.js + Socket.IO รวมกัน

### Events ที่ Server Emit (Server → Client)

| Event | Payload | ผู้รับ | Trigger |
|---|---|---|---|
| `ride:new_request` | `RideRequest` | Driver (online) | Customer สร้างคำขอ |
| `offer:new` | `Offer` | Customer | Driver ส่ง offer |
| `offer:accepted` | `{ tripId }` | Driver | Customer accept |
| `offer:rejected` | `{ offerId }` | Driver | Customer reject |
| `trip:created` | `{ tripId }` | Customer + Driver | หลัง accept offer |
| `trip:status` | `{ id, status, eta? }` | Customer + Driver | Driver อัปเดต status |
| `trip:driver:location` | `{ lat, lng, heading }` | Customer | Driver ส่ง GPS |
| `ride:cancelled` | `{}` | Customer | Customer ยกเลิก |
| `admin:trip` | `Trip` | Admin room | Trip events ทุกชนิด |

### Events ที่ Client Emit (Client → Server)

| Event | Payload | ผู้ส่ง | Description |
|---|---|---|---|
| `join:room` | `roomId: string` | ทุก client | เข้า room |
| `leave:room` | `roomId: string` | ทุก client | ออก room |
| `driver:location` | `{ lat, lng, heading }` | Driver | ส่ง GPS ทุก 3 วินาที |
| `driver:online` | `{ vehicleType }` | Driver | Toggle online |
| `driver:offline` | — | Driver | Toggle offline |

### Socket Rooms

```
user:{userId}     → ทุก user มี private room
trip:{tripId}     → customer + driver ใน trip เดียวกัน
admin             → Admin dashboard
```

---

## 8. Design System

### Colors

```css
--primary:        #13c8ec   /* Cyan (FairGo Blue) */
--primary-dark:   #0ea5c6
--bg-light:       #f6f8f8
--bg-dark:        #101f22
--surface-light:  #ffffff
--surface-dark:   #162a2e
--text-primary:   #0d1f22
--text-secondary: #64748b
```

### Typography

- Font: **Plus Jakarta Sans** (400, 500, 600, 700, 800)
- Thai Font: **IBM Plex Sans Thai** (ทับซ้อนกัน)
- Icons: **Material Symbols Outlined**

### Components (packages/ui)

| Component | Description |
|---|---|
| `Button` | variant: primary/secondary/ghost, loading state |
| `Input` | label, error, icon prefix/suffix |
| `Card` | shadow-sm wrapper |
| `Modal` | portal + backdrop |
| `Toast` | ToastProvider context |
| `Spinner` | loading indicator |
| `Badge` | status badges |
| `Avatar` | user photo with fallback |
| `BottomSheet` | mobile bottom drawer |
| `MapContainer` | Google Maps wrapper |
| `FareSlider` | min/max/offer slider |
| `StatusBadge` | trip status chip |

### Tailwind Custom Config

```js
colors: {
  primary: '#13c8ec',
  'primary-dark': '#0ea5c6',
  'bg-light': '#f6f8f8',
  'bg-dark': '#101f22',
}
boxShadow: {
  soft: '0 4px 20px -2px rgba(19,200,236,0.1)',
  card: '0 2px 10px rgba(0,0,0,0.03)',
}
```

---

## 9. Phase Summary

### ✅ Phase 1 — Monorepo Scaffold
**Commit:** `0f7f2a3`

- สร้าง pnpm workspaces monorepo (`apps/` + `packages/`)
- `packages/ui` — Design tokens + 12 shared components
- `packages/api-client` — TypeScript types, apiFetch, socketClient
- `apps/api` — คัดลอก + เพิ่ม endpoints ใหม่ (active ride, active trip, notifications)
- `apps/admin`, `apps/customer`, `apps/driver` — Vite + React + Tailwind scaffold
- Design system: tokens, Tailwind config, global CSS

---

### ✅ Phase 2 — Admin App (Complete)
**Commit:** `0ff2e27`

- **LoginPage** — Email + password → JWT
- **DashboardPage** — Live stats cards + recent trips table + Socket real-time updates
- **UsersPage** — Paginated user list + ban/unban + search
- **DriversPage** — Driver list + verify/reject approval flow
- **TripsPage** — Trip history + status filter + search
- **PricingPage** — Base fare + multiplier settings per vehicle type
- **DisputesPage** — Dispute list + resolve/escalate
- **AnalyticsPage** — Revenue trend chart + trip stats
- **AdminLayout** — Sidebar nav + mobile collapse + top bar

---

### ✅ Phase 3 — Customer App (Complete)
**Commit:** `6ecc207`

- **SplashPage** — Animated logo + auto-redirect
- **OnboardingPage** — Feature slides
- **LoginPage** — Phone OTP flow
- **HomePage** — Map background + book ride button + recent trips
- **RideRequestPage** — Pickup/dropoff input + fare slider (min/max/offer) + vehicle selector + Google Maps fare estimate
- **MatchingPage** — Driver offer cards + accept/reject + cancel
- **TripActivePage** — Map + driver info + status + call button + cancel
- **TripSummaryPage** — Receipt: route timeline + fare breakdown + rating link
- **RatingPage** — 5-star + feedback chips + comment + submit
- **ProfilePage** — Info + edit + logout
- **HistoryPage** — Paginated trip list + status filter

---

### ✅ Phase 4 — Driver App (Complete)
**Commit:** `f857d04`

- **SplashPage, OnboardingPage, LoginPage** — Same flow as customer
- **OnboardingProfilePage** — กรอกชื่อ, เบอร์, รูป, ใบขับขี่, ข้อมูลรถ
- **HomePage** — Toggle online/offline + job list + earnings summary
- **SubmitOfferPage** — ดูรายละเอียดงาน + FareSlider + ส่ง offer
- **TripActivePage** — Step-by-step status update (EN_ROUTE → ARRIVED → PICKUP → IN_PROGRESS → COMPLETED)
- **TripSummaryPage** — Earnings receipt + rate customer
- **RatingPage** — 5-star + chips + submit
- **EarningsPage** — Wallet balance + weekly bar chart + recent trips + withdraw modal
- **HistoryPage** — Paginated trips + All/Completed/Cancelled filter
- **ProfilePage** — Driver info + vehicle + edit form + menu + logout
- **BottomNav** — Home / History / Earnings / Profile

---

### ✅ Phase 5 — Real-time, PWA, Polish
**Commit:** `e58485f`

**Socket.IO Real-time (แทนที่ polling ทั้งหมด):**
- `useSocket` + `useSocketEvent` hooks ใน `packages/api-client`
- Customer **MatchingPage** — Socket `offer:new` รับ offer ทันที + radar animation + toast
- Customer **TripActivePage** — Socket `trip:status` + toast แจ้ง "คนขับมาถึง"
- Driver **HomePage** — Socket `ride:new_request` + `offer:accepted` → redirect
- Driver **TripActivePage** — Socket `trip:status` sync + toast "เดินทางเสร็จสิ้น"
- Admin **Dashboard** — Toast แจ้งเตือน live events
- Polling fallback ทุก app (8–12s) สำหรับกรณี socket unavailable

**PWA:**
- `manifest.json` ทั้ง 3 apps (name, theme_color, icons, display: standalone)
- `sw.js` — Network-first สำหรับ API, Cache-first สำหรับ static assets
- Push notification support ใน service worker
- Apple PWA meta tags (mobile home screen install)

**Polish:**
- Toast system (success/error/info/warning) — overlay ด้านบนหน้าจอ
- `ErrorBoundary` ครอบทุก app root
- `animate-fade-in` CSS utility

---

## 10. Backlog

สิ่งที่ยังไม่ได้ทำ / ทำต่อได้ในอนาคต:

### 🔴 Critical (ต้องทำก่อน Go-Live)

| # | Item | รายละเอียด |
|---|---|---|
| 1 | **PWA App Icons** | สร้าง `icon-192.png` + `icon-512.png` ใส่ใน `public/` ทุก app (ตอนนี้แค่ reference) |
| 2 | **OTP SMS Provider** | เชื่อม Twilio / AWS SNS / True Move H สำหรับส่ง OTP จริง |
| 3 | **Google Maps API Key** | เพิ่ม `VITE_GOOGLE_MAPS_KEY` สำหรับ Maps ใน customer/driver |
| 4 | **Payment Gateway** | เชื่อม Omise หรือ Stripe สำหรับชำระเงินจริง |
| 5 | **CORS Production** | ตั้ง `ADMIN_WEB_URL` + `CUSTOMER_APP_URL` ใน Railway ให้ตรงกับ domain จริง |
| 6 | **DB Migration** | รัน `prisma migrate deploy` บน production database |

### 🟡 Important (Phase 6 แนะนำ)

| # | Item | รายละเอียด |
|---|---|---|
| 7 | **Driver Location Real-time** | Customer map แสดง marker รถเคลื่อนที่ตาม Socket `trip:driver:location` |
| 8 | **In-app Chat** | Socket-based messaging ระหว่าง customer ↔ driver ระหว่างเดินทาง |
| 9 | **Push Notifications** | Integrate Web Push API กับ service worker + backend |
| 10 | **Admin Dashboard Charts** | เพิ่ม chart library (recharts) สำหรับ AnalyticsPage |
| 11 | **Customer Favorite Drivers** | บันทึก driver ที่ชอบ → ขอ driver คนนั้นซ้ำได้ |
| 12 | **Promo Code System** | Admin สร้าง code → customer ใช้ตอนเรียกรถ |

### 🟢 Nice to Have (Phase 7+)

| # | Item | รายละเอียด |
|---|---|---|
| 13 | **Dark Mode** | ระบบ theme toggle (โครงสร้าง Tailwind darkMode: 'class' รองรับอยู่แล้ว) |
| 14 | **Multi-language** | เพิ่ม i18n (EN/TH) |
| 15 | **Driver Earnings Report** | Export PDF/CSV รายงานรายได้รายเดือน |
| 16 | **Admin Real-time Map** | แผนที่แสดงตำแหน่ง drivers ทั้งหมดแบบ live |
| 17 | **Rate Limiting** | เพิ่ม rate limit บน API routes |
| 18 | **E2E Tests** | Playwright tests สำหรับ critical flows |
| 19 | **CI/CD Pipeline** | GitHub Actions: lint → typecheck → deploy |

---

## 11. Environment Variables

### Railway — `apps/api`

```env
# Database
DATABASE_URL="postgres://user:password@host:port/dbname?sslmode=require"

# JWT (สร้างด้วย: openssl rand -base64 64)
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."

# Server
PORT=4000
NODE_ENV=production

# CORS — ใส่ URL จริงหลัง deploy Vercel
ADMIN_WEB_URL="https://fairgo-admin.vercel.app"
CUSTOMER_APP_URL="https://fairgo-customer.vercel.app"
```

### Vercel — `apps/admin`

```env
VITE_API_URL="https://[your-railway-url].up.railway.app"
VITE_SOCKET_URL="https://[your-railway-url].up.railway.app"
```

### Vercel — `apps/customer`

```env
VITE_API_URL="https://[your-railway-url].up.railway.app"
VITE_SOCKET_URL="https://[your-railway-url].up.railway.app"
VITE_GOOGLE_MAPS_KEY="AIza..."   # optional
```

### Vercel — `apps/driver`

```env
VITE_API_URL="https://[your-railway-url].up.railway.app"
VITE_SOCKET_URL="https://[your-railway-url].up.railway.app"
VITE_GOOGLE_MAPS_KEY="AIza..."   # optional
```

---

## 12. Deploy Manual

### Deploy Order

```
1. Railway  → apps/api       (ได้ URL ก่อน)
2. Vercel   → apps/admin
3. Vercel   → apps/customer
4. Vercel   → apps/driver
5. Railway  → ใส่ CORS URLs ที่ได้จาก Vercel
```

---

### Railway — `apps/api`

1. ไปที่ [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. เลือก repo `fairgo-react`
3. Railway จะอ่าน `apps/api/railway.json` อัตโนมัติ:
   ```json
   {
     "build": {
       "buildCommand": "pnpm install --frozen-lockfile && pnpm --filter @fairgo/api run db:generate && pnpm --filter @fairgo/api run build"
     },
     "deploy": {
       "startCommand": "pnpm --filter @fairgo/api run start:socket"
     }
   }
   ```
4. ตั้ง **Root Directory** เป็น `/` (root ของ repo)
5. เพิ่ม Environment Variables ตาม [ข้อ 11](#11-environment-variables)
6. รัน DB Migration (ครั้งแรก):
   ```bash
   # Railway → Settings → Deploy → Add command ชั่วคราว หรือใช้ Railway CLI
   pnpm --filter @fairgo/api run db:push
   ```
7. **Deploy** → รอ build สำเร็จ → ได้ URL เช่น `https://fairgo-react-api.up.railway.app`

---

### Vercel — Admin / Customer / Driver

แต่ละ app deploy แยกกัน (3 projects บน Vercel):

1. ไปที่ [vercel.com](https://vercel.com) → **Add New Project** → Import `fairgo-react`
2. ตั้งค่า:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/admin` (หรือ `apps/customer` / `apps/driver`)
   - **Build Command**: `pnpm --filter @fairgo/admin build`
   - **Output Directory**: `apps/admin/dist`
   - **Install Command**: `pnpm install --frozen-lockfile`
3. เพิ่ม Environment Variables
4. **Deploy**

**Build Commands แต่ละ app:**

| App | Root Dir | Build Command | Output Dir |
|---|---|---|---|
| Admin | `apps/admin` | `pnpm --filter @fairgo/admin build` | `apps/admin/dist` |
| Customer | `apps/customer` | `pnpm --filter @fairgo/customer build` | `apps/customer/dist` |
| Driver | `apps/driver` | `pnpm --filter @fairgo/driver build` | `apps/driver/dist` |

> **Note**: Vercel ต้องการ `pnpm-workspace.yaml` ที่ root — มีอยู่แล้วใน repo

---

## 13. Local Development

### Prerequisites

```bash
node >= 18
pnpm >= 9
```

### Setup

```bash
git clone https://github.com/suppawitfuangnoi/fairgo-react.git
cd fairgo-react
pnpm install
```

### สร้าง `.env` ใน `apps/api/`

```bash
cp apps/api/.env.example apps/api/.env
# แก้ไข DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
```

### Run DB Migration

```bash
pnpm --filter @fairgo/api run db:push
pnpm --filter @fairgo/api run db:seed   # optional: seed ข้อมูลตัวอย่าง
```

### Start All Apps

```bash
pnpm dev   # รัน admin + customer + driver + api พร้อมกัน
```

หรือรันแยก:

```bash
pnpm dev:api        # Port 4000
pnpm dev:admin      # Port 5173
pnpm dev:customer   # Port 5174
pnpm dev:driver     # Port 5175
```

### Local ENV สำหรับ Frontend

สร้าง `.env.local` ใน `apps/admin/`, `apps/customer/`, `apps/driver/`:

```env
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

---

## Git History

| Commit | Phase | Description |
|---|---|---|
| `0f7f2a3` | Phase 1 | Monorepo scaffold + shared packages + API enhanced |
| `0ff2e27` | Phase 2 | Admin app — all 8 pages complete |
| `6ecc207` | Phase 3 | Customer app — all 11 pages complete |
| `f857d04` | Phase 4 | Driver app — all 12 pages complete |
| `e58485f` | Phase 5 | Socket.IO real-time + PWA + Toasts + Error Boundary |

---

*Last updated: April 2026*

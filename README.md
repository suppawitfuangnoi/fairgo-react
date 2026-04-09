# FairGo — Fair-Pricing Ride-Hailing Platform

> แอปเรียกรถที่ผู้โดยสารสามารถ **ต่อราคากับคนขับได้โดยตรง** (Bidirectional Negotiation Model)

[![Deploy on Railway](https://img.shields.io/badge/API-Railway-blueviolet)](https://fairgo-react-production.up.railway.app)
[![Deploy on Vercel](https://img.shields.io/badge/Apps-Vercel-black)](https://vercel.com)

---

## Live URLs

| App | URL |
|---|---|
| Customer | https://fairgo-react-customer.vercel.app |
| Driver | https://fairgo-react-driver.vercel.app |
| Admin | https://fairgo-react-admin.vercel.app |
| API | https://fairgo-react-production.up.railway.app |

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Apps & Pages](#apps--pages)
6. [API Endpoints](#api-endpoints)
7. [Socket.IO Events](#socketio-events)
8. [Trip Status State Machine](#trip-status-state-machine)
9. [Design System](#design-system)
10. [Environment Variables](#environment-variables)
11. [Local Development](#local-development)
12. [Deploy](#deploy)
13. [Test Coverage](#test-coverage)
14. [Backlog](#backlog)

---

## Overview

FairGo คือแพลตฟอร์ม ride-hailing สำหรับประเทศไทย จุดเด่นคือระบบ **Fair Negotiation** ที่ให้ผู้โดยสารและคนขับต่อราคากันได้แบบ real-time (สูงสุด 5 รอบ) ก่อนยืนยันการเดินทาง

### User Roles

| Role | Platform | หน้าที่ |
|---|---|---|
| **Customer** | Web PWA (Mobile) | เรียกรถ เสนอราคา ต่อราคา ติดตามรถ chat |
| **Driver** | Web PWA (Mobile) | รับงาน ส่ง offer ต่อราคา ขับส่ง |
| **Admin** | Web Dashboard | จัดการระบบ ดู analytics อนุมัติ driver |

---

## Architecture

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
              │       apps/api         │
              │  Next.js 14 + Socket.IO│
              │  Railway (Port 4000)   │
              └────────────┬───────────┘
                           │  Prisma ORM
                           ▼
              ┌────────────────────────┐
              │   Aiven PostgreSQL     │
              │  (SSL, connection_limit=3 per instance) │
              └────────────────────────┘

Shared packages:
  packages/ui          — Reusable React components (13 components)
  packages/api-client  — TypeScript types + apiFetch + socketClient + useSocket hooks
```

### Request Flow

```
Browser → apiFetch() → VITE_API_URL/api/v1/... → Next.js Route Handler → Prisma → PostgreSQL

Browser ↔ Socket.IO → VITE_SOCKET_URL → server.ts → emitToRoom() → broadcast
```

### Authentication Flow

```
1. POST /api/v1/auth/request-otp  { phone }
2. POST /api/v1/auth/verify-otp   { phone, otp } → { accessToken, refreshToken, user }
3. Tokens stored in localStorage   (fg_access_token, fg_refresh_token, fg_user)
4. apiFetch() auto-attaches Bearer token on every request
5. On 401 → auto-refresh via POST /api/v1/auth/refresh
```

> **Dev mode:** OTP mock is `123456` (ตั้งค่า `MOCK_OTP_ENABLED=true`)

---

## Tech Stack

### Frontend (3 Apps)

| Category | Tech |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 (custom theme) |
| Routing | React Router v6 |
| State | Zustand |
| Real-time | Socket.IO Client 4.x |
| Maps | Google Maps JavaScript API (AdvancedMarkerElement + Directions API) |
| Font | Plus Jakarta Sans + IBM Plex Sans Thai |
| Icons | Material Symbols Outlined |
| PWA | manifest.json + Service Worker v3 |

### Backend (apps/api)

| Category | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| HTTP Server | Custom Node.js + next() (server.ts) |
| WebSocket | Socket.IO Server 4.x |
| ORM | Prisma 5.22 |
| Database | PostgreSQL (Aiven) |
| Auth | JWT (access 24h + refresh 7d) |
| Validation | Zod |
| Hashing | bcryptjs |

### Infrastructure

| Service | Provider |
|---|---|
| API + Socket.IO | Railway |
| Admin Dashboard | Vercel |
| Customer App | Vercel |
| Driver App | Vercel |
| Database | Aiven PostgreSQL |

---

## Project Structure

```
fairgo-react/
├── package.json              # pnpm workspaces root
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── test_full_e2e.sh          # E2E test script (56 tests)
│
├── apps/
│   ├── admin/                # Web Admin Dashboard
│   │   └── src/
│   │       └── pages/
│   │           ├── LoginPage.tsx
│   │           ├── DashboardPage.tsx   # Live stats + socket
│   │           ├── UsersPage.tsx
│   │           ├── DriversPage.tsx     # Verify / approve
│   │           ├── TripsPage.tsx
│   │           ├── PricingPage.tsx     # Base fare settings
│   │           ├── DisputesPage.tsx
│   │           └── AnalyticsPage.tsx
│   │
│   ├── customer/             # Customer Web PWA
│   │   └── src/
│   │       ├── components/
│   │       │   └── GoogleMap.tsx       # Map ID: a9d68526588d406f39c9cc17
│   │       ├── hooks/
│   │       │   └── useActiveSession.ts # Session restore + redirect guard
│   │       └── pages/
│   │           ├── SplashPage.tsx
│   │           ├── OnboardingPage.tsx
│   │           ├── LoginPage.tsx       # OTP login
│   │           ├── HomePage.tsx        # แผนที่ + เรียกรถ
│   │           ├── RideRequestPage.tsx # เสนอราคา + vehicle type
│   │           ├── MatchingPage.tsx    # รอ offer (real-time)
│   │           ├── TripActivePage.tsx  # ติดตามรถ + ETA + chat
│   │           ├── TripSummaryPage.tsx # Receipt
│   │           ├── RatingPage.tsx
│   │           ├── ProfilePage.tsx
│   │           └── HistoryPage.tsx
│   │
│   ├── driver/               # Driver Web PWA
│   │   └── src/
│   │       ├── components/
│   │       │   └── GoogleMap.tsx       # Map ID: a9d68526588d406f3c630bbb
│   │       ├── hooks/
│   │       │   └── useActiveSession.ts
│   │       └── pages/
│   │           ├── SplashPage.tsx
│   │           ├── OnboardingPage.tsx
│   │           ├── OnboardingProfilePage.tsx   # ข้อมูลคนขับ + รถ
│   │           ├── LoginPage.tsx
│   │           ├── HomePage.tsx        # รายการงาน (real-time)
│   │           ├── SubmitOfferPage.tsx # ส่ง + ต่อราคา
│   │           ├── TripActivePage.tsx  # ขับส่ง + update status
│   │           ├── TripSummaryPage.tsx # สรุปรายได้
│   │           ├── RatingPage.tsx
│   │           ├── EarningsPage.tsx    # รายได้ + bar chart + ถอนเงิน
│   │           ├── HistoryPage.tsx
│   │           └── ProfilePage.tsx
│   │
│   └── api/                  # Next.js 14 Backend
│       ├── server.ts         # Custom HTTP + Socket.IO server
│       ├── prisma/
│       │   └── schema.prisma
│       └── src/
│           ├── app/api/v1/   # REST Route Handlers
│           └── lib/
│               ├── prisma.ts         # Singleton + connection_limit=3
│               ├── jwt.ts
│               ├── socket.ts         # emitToRoom()
│               ├── pricing.ts        # Fare calculation
│               ├── otp.ts
│               └── validation.ts     # Zod schemas
│
├── packages/
│   ├── ui/                   # Shared React components
│   │   └── src/components/
│   │       ├── Button, Input, Card, Modal, Toast
│   │       ├── Spinner, Badge, Avatar, BottomSheet
│   │       ├── MapContainer, FareSlider, GoogleMap, StatusBadge
│   │
│   └── api-client/           # Shared TS types + utilities
│       └── src/
│           ├── types.ts       # User, Trip, RideRequest, Offer...
│           ├── client.ts      # apiFetch<T>() with auto-refresh
│           ├── socket.ts      # socketClient + socketEvents
│           └── hooks/useSocket.ts
│
└── docs/                     # Additional documentation
```

---

## Apps & Pages

### Customer App — `apps/customer`

| Page | Route | Description |
|---|---|---|
| Splash | `/` | โลโก้ + auto-redirect |
| Onboarding | `/onboarding` | แนะนำฟีเจอร์ |
| Login | `/login` | OTP phone login |
| Home | `/home` | แผนที่ + ปุ่มเรียกรถ |
| Ride Request | `/ride-request` | ใส่ปลายทาง เสนอราคา เลือกประเภทรถ |
| Matching | `/matching` | รอ offer จากคนขับ + ต่อราคา |
| Trip Active | `/trip-active` | ดู driver บนแผนที่ + ETA + chat + SOS |
| Trip Summary | `/trip-summary/:id` | Receipt + ให้คะแนน |
| History | `/history` | ประวัติการเดินทาง |
| Profile | `/profile` | ข้อมูลส่วนตัว |

### Driver App — `apps/driver`

| Page | Route | Description |
|---|---|---|
| Splash | `/` | โลโก้ + auto-redirect |
| Onboarding | `/onboarding` | แนะนำฟีเจอร์ |
| Login | `/login` | OTP phone login |
| Onboarding Profile | `/onboarding-profile` | กรอกข้อมูลคนขับ + รถ |
| Home | `/home` | Toggle online/offline + รายการงานใหม่ |
| Submit Offer | `/submit-offer/:rideId` | ดู trip detail + ส่ง/ต่อราคา |
| Trip Active | `/trip-active` | แผนที่ + update trip status + chat |
| Trip Summary | `/trip-summary/:id` | สรุปรายได้ trip |
| Earnings | `/earnings` | รายได้ทั้งหมด + ถอนเงิน |
| History | `/history` | ประวัติ trips |
| Profile | `/profile` | ข้อมูลส่วนตัว + รถ |

### Admin Dashboard — `apps/admin`

| Page | Route | Description |
|---|---|---|
| Login | `/login` | Email + password |
| Dashboard | `/dashboard` | Live stats + socket monitor |
| Users | `/users` | จัดการ users ทั้งหมด |
| Drivers | `/drivers` | Verify + approve drivers |
| Trips | `/trips` | Trip history + status |
| Pricing | `/pricing` | ตั้งค่า base fare |
| Disputes | `/disputes` | จัดการข้อพิพาท |
| Analytics | `/analytics` | Charts + reports |

---

## API Endpoints

Base URL: `/api/v1`

### Auth
```
POST   /auth/request-otp       ขอ OTP
POST   /auth/verify-otp        ยืนยัน OTP → tokens
POST   /auth/refresh            Refresh access token
POST   /auth/logout
POST   /auth/admin-login        Email+password (admin only)
```

### Rides
```
POST   /rides                   สร้าง ride request
GET    /rides/active            ดู ride ที่ active ของ customer
GET    /rides/nearby            rides รอบๆ สำหรับ driver
GET    /rides/:id
GET    /rides/fare-estimate     ประมาณค่าโดยสาร
```

### Offers (Negotiation)
```
POST   /offers                          ส่ง offer (driver)
POST   /offers/:id/accept               customer ยอมรับ
POST   /offers/:id/reject               customer ปฏิเสธ
POST   /offers/:id/counter              customer ต่อราคา
POST   /offers/:id/driver-counter       driver ต่อราคากลับ
GET    /offers/driver-pending           ดู offer ค้างของ driver
```

### Trips
```
GET    /trips/active                    ดู trip ที่กำลัง active
PATCH  /trips/:id/status               update status (driver)
POST   /trips/:id/location             อัพเดท GPS location (driver)
POST   /trips/:id/confirm-payment      ยืนยันรับเงินสด
POST   /trips/:id/dispute              แจ้งข้อพิพาท
```

### Users / Drivers
```
GET    /users/me
PATCH  /users/me
GET    /users/driver-profile
PATCH  /users/driver-profile
POST   /users/location
```

### Other
```
GET    /wallet/balance
POST   /wallet/withdraw
POST   /ratings
GET    /notifications           ?page=&limit=
PATCH  /notifications/:id/read
GET    /vehicles
POST   /vehicles
GET    /payments
```

### Admin
```
GET    /admin/dashboard
GET    /admin/users
GET    /admin/drivers
PATCH  /admin/drivers/:id/verify
GET    /admin/trips
GET    /admin/pricing
PATCH  /admin/pricing
GET    /admin/disputes
PATCH  /admin/disputes/:id
GET    /admin/analytics
```

---

## Socket.IO Events

### Rooms

| Room | Members | ใช้สำหรับ |
|---|---|---|
| `user:{userId}` | เฉพาะ user นั้น | private notifications |
| `trip:{tripId}` | customer + driver | real-time trip updates |
| `admin:monitor` | admin only | live dashboard |
| `drivers:online` | drivers ทั้งหมดที่ online | broadcast ride requests |

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `driver:online` | `{ vehicleType }` | driver เปิดรับงาน |
| `driver:offline` | — | driver ปิดรับงาน |
| `driver:location` | `{ tripId, lat, lng, heading }` | อัพเดท GPS ทุก 3 วิ |
| `chat:send` | `{ tripId, text, fromRole }` | ส่งข้อความ in-app chat |
| `join:room` | `{ room }` | เข้า room |

### Server → Client

| Event | Description |
|---|---|
| `ride:new_request` | มีงานใหม่ (→ drivers) |
| `offer:received` | customer ได้รับ offer จาก driver |
| `offer:countered` | ต่อราคากลับ |
| `offer:accepted` | ยืนยัน offer → trip เริ่ม |
| `trip:status_update` | status เปลี่ยน (→ ทั้ง customer & driver) |
| `driver:location_update` | GPS driver ใหม่ (→ customer) |
| `chat:message` | ข้อความ chat |
| `trip:payment_confirmed` | passenger ยืนยันจ่ายเงิน |

---

## Trip Status State Machine

```
DRIVER_ASSIGNED
    │  driver กด "นำทางไปรับ"
    ▼
DRIVER_EN_ROUTE
    │  driver กด "ถึงจุดรับแล้ว"
    ▼
DRIVER_ARRIVED
    │  driver กด "ผู้โดยสารขึ้นรถแล้ว"
    ▼
PICKUP_CONFIRMED
    │  driver กด "เริ่มการเดินทาง"
    ▼
IN_PROGRESS
    │  driver กด "ถึงปลายทางแล้ว"
    ▼
ARRIVED_DESTINATION
    │  driver กด "แจ้งผู้โดยสารชำระเงิน"
    ▼
AWAITING_CASH_CONFIRMATION
    │  driver กด "ได้รับเงินสดแล้ว"
    ▼
COMPLETED ✓

Terminal statuses (จากทุก state):
  CANCELLED | CANCELLED_BY_PASSENGER | CANCELLED_BY_DRIVER
  NO_SHOW_PASSENGER | NO_SHOW_DRIVER
```

---

## Design System

| Token | Value |
|---|---|
| Primary color | `#13c8ec` (FairGo Cyan) |
| Font (Latin) | Plus Jakarta Sans |
| Font (Thai) | IBM Plex Sans Thai |
| Icons | Material Symbols Outlined |
| Border radius | `rounded-xl` (12px), `rounded-2xl` (16px) |

---

## Environment Variables

### apps/api (Railway)

```env
DATABASE_URL=postgres://...?sslmode=require
JWT_SECRET=...
JWT_REFRESH_SECRET=...
ADMIN_JWT_SECRET=...
NEXT_PUBLIC_API_URL=https://fairgo-react-production.up.railway.app
MOCK_OTP_ENABLED=true          # false ใน production จริง
OTP_EXPIRY_MINUTES=5
NODE_ENV=production
```

### apps/customer + apps/driver + apps/admin (Vercel)

```env
VITE_API_URL=https://fairgo-react-production.up.railway.app
VITE_SOCKET_URL=https://fairgo-react-production.up.railway.app
VITE_GOOGLE_MAPS_KEY=...
```

---

## Local Development

### Prerequisites
- Node.js 18+
- pnpm 8+

### Setup

```bash
# Clone
git clone https://github.com/suppawitfuangnoi/fairgo-react.git
cd fairgo-react

# Install dependencies
pnpm install

# Setup DB
cd apps/api
cp .env.example .env   # ใส่ DATABASE_URL + JWT secrets
pnpm prisma migrate dev
pnpm prisma db seed    # (ถ้ามี seed)
```

### Run

```bash
# รัน API server
cd apps/api && pnpm dev        # port 4000

# รัน Customer app
cd apps/customer && pnpm dev   # port 5174

# รัน Driver app
cd apps/driver && pnpm dev     # port 5175

# รัน Admin app
cd apps/admin && pnpm dev      # port 5173
```

### Test

```bash
# E2E tests (ต้องรัน API ก่อน)
bash test_full_e2e.sh

# Unit tests
cd apps/api && pnpm test
```

---

## Deploy

### API → Railway

1. Push to `main` branch → Railway auto-deploy
2. Build command: `pnpm --filter api build`
3. Start command: `node apps/api/server.js`

### Frontend → Vercel

1. Push to `main` → Vercel auto-deploy (3 projects)
2. แต่ละ app ตั้งค่า Root Directory ใน Vercel:
   - Admin: `apps/admin`
   - Customer: `apps/customer`
   - Driver: `apps/driver`

---

## Test Coverage

| Suite | Tests | Status |
|---|---|---|
| E2E Full Flow | 56 | Passing |
| OTP Security Unit | 41 | Passing |
| Notification Unit | 34 | Passing |
| High-Risk Security Unit | 40 | Passing |
| **Total** | **171** | **Passing** |

Manual QA Checklist: 349 test cases (planned)

---

## Backlog

สิ่งที่ต้องทำก่อน go-live จริง:

| # | Item | Priority |
|---|---|---|
| 1 | OTP SMS Provider (Twilio / AWS SNS) — ตอนนี้ใช้ mock `123456` | Critical |
| 2 | Payment Gateway (Omise / Stripe) | Critical |
| 3 | CORS Production URLs ตั้งค่าใน Railway | Critical |
| 4 | PWA App Icons (icon-192.png + icon-512.png) | High |
| 5 | Google Maps Billing ตั้งค่า + quota | High |
| 6 | Push Notification (FCM / Web Push) | Medium |
| 7 | Rate limiting per-user (Redis) | Medium |
| 8 | Admin analytics charts (recharts) | Low |
| 9 | Integration tests (Playwright) | Low |

---

## Google Maps

| App | Map ID |
|---|---|
| Customer | `a9d68526588d406f39c9cc17` |
| Driver | `a9d68526588d406f3c630bbb` |
| Admin | `a9d68526588d406f11a350b6` |

Map IDs ลิงก์กับ style ใน [Google Cloud Console → Map Management](https://console.cloud.google.com/google/maps-apis/client-maps)

---

*FairGo — Built with React 18 + Next.js 14 + Socket.IO + Prisma + PostgreSQL*

#!/bin/bash
# FairGo Full E2E Test Suite v3.0 - All Features
# Tests ALL spec features including new trip statuses, cash confirm, earnings, audit logs

set +e  # Don't exit on errors - tests should continue even if individual checks fail

BASE_URL="${BASE_URL:-https://fairgo-react-production.up.railway.app}"
PASS=0
FAIL=0
SKIP=0
FAILED_TESTS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() {
  PASS=$((PASS+1))
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  FAIL=$((FAIL+1))
  FAILED_TESTS+=("$1")
  echo -e "  ${RED}✗${NC} $1"
  if [ -n "$2" ]; then
    echo -e "    ${RED}Response: ${NC}$(echo "$2" | head -c 250)"
  fi
}

skip() {
  SKIP=$((SKIP+1))
  echo -e "  ${YELLOW}⊘${NC} $1 (SKIPPED)"
}

section() {
  echo ""
  echo -e "${BOLD}${BLUE}━━━ $1 ━━━${NC}"
}

info() {
  echo -e "  ${CYAN}ℹ${NC} $1"
}

api() {
  # Helper: make API call and return response
  curl -s "$@" 2>/dev/null
}

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    FairGo Full E2E Test Suite v3.0         ║${NC}"
echo -e "${BOLD}║    Testing ALL features including new spec  ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════╝${NC}"
echo -e "  Base URL: ${CYAN}$BASE_URL${NC}"
echo ""

# ============================================================
section "T01 - Health Check"
# ============================================================
R=$(api "$BASE_URL/api/v1/health")
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
if [ "$STATUS" = "ok" ]; then
  pass "API health check returns ok"
else
  fail "API health check" "$R"
fi

# ============================================================
section "T02 - Auth: OTP Request & Verify (Customer)"
# ============================================================
TS=$(date +%s)
CUST_PHONE="+6681${TS: -7}"

R=$(api -X POST "$BASE_URL/api/v1/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$CUST_PHONE\"}")
MSG=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null)
if echo "$MSG" | grep -qi "otp\|sent"; then
  pass "Customer OTP request success"
else
  fail "Customer OTP request" "$R"
fi

R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$CUST_PHONE\",\"code\":\"123456\",\"role\":\"CUSTOMER\",\"name\":\"Test Customer $TS\"}")
CUST_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
CUST_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null)
if [ -n "$CUST_TOKEN" ] && [ "$CUST_TOKEN" != "None" ]; then
  pass "Customer OTP verify returns access token"
  info "Customer ID: $CUST_ID"
else
  fail "Customer OTP verify" "$R"
fi

# ============================================================
section "T03 - Auth: OTP Request & Verify (Driver)"
# ============================================================
DRIV_PHONE="+6682${TS: -7}"
api -X POST "$BASE_URL/api/v1/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$DRIV_PHONE\"}" > /dev/null

R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$DRIV_PHONE\",\"code\":\"123456\",\"role\":\"DRIVER\",\"name\":\"Test Driver $TS\"}")
DRIV_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
DRIV_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null)
if [ -n "$DRIV_TOKEN" ] && [ "$DRIV_TOKEN" != "None" ]; then
  pass "Driver OTP verify returns access token"
  info "Driver User ID: $DRIV_ID"
else
  fail "Driver OTP verify" "$R"
fi

# ============================================================
section "T04 - Profile (/users/me)"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/users/me" \
  -H "Authorization: Bearer $CUST_TOKEN")
ROLE=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('role',''))" 2>/dev/null)
if [ "$ROLE" = "CUSTOMER" ]; then
  pass "Customer /users/me returns CUSTOMER role"
else
  fail "Customer /users/me" "$R"
fi

R=$(api -X GET "$BASE_URL/api/v1/users/me" \
  -H "Authorization: Bearer $DRIV_TOKEN")
ROLE=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('role',''))" 2>/dev/null)
if [ "$ROLE" = "DRIVER" ]; then
  pass "Driver /users/me returns DRIVER role"
else
  fail "Driver /users/me" "$R"
fi

# ============================================================
section "T05 - Fare Estimate (POST)"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/rides/fare-estimate" \
  -H "Authorization: Bearer $CUST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vehicleType":"TAXI","pickupLatitude":13.7563,"pickupLongitude":100.5018,"dropoffLatitude":13.7470,"dropoffLongitude":100.5353}')
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Fare estimate returns success"
  ESTIMATE=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); est=d.get('data',{}).get('estimates',[]); print(est[0].get('suggestedFare',0) if est else 'N/A')" 2>/dev/null)
  info "TAXI estimate: $ESTIMATE THB"
else
  fail "Fare estimate" "$R"
fi

# ============================================================
section "T06 - Driver: Register Vehicle"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/vehicles" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"TAXI\",\"make\":\"Toyota\",\"model\":\"Camry\",\"color\":\"White\",\"year\":2022,\"plateNumber\":\"กข-${TS: -4}\"}")
VEHICLE_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$VEHICLE_ID" ] && [ "$VEHICLE_ID" != "None" ]; then
  pass "Driver registers vehicle"
  info "Vehicle ID: $VEHICLE_ID"
else
  fail "Driver register vehicle" "$R"
fi

# ============================================================
section "T07 - Admin Login + Driver Verification"
# ============================================================
ADMIN_R=$(api -X POST "$BASE_URL/api/v1/auth/admin-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fairgo.th","password":"admin123"}')
ADMIN_TOKEN=$(echo "$ADMIN_R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "None" ]; then
  pass "Admin login success"
else
  fail "Admin login" "$ADMIN_R"
fi

# Find driver profile ID for this driver
R=$(api -X GET "$BASE_URL/api/v1/admin/drivers?page=1&limit=100" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
DRIV_PROFILE_ID=$(echo "$R" | python3 -c "
import json, sys
d = json.load(sys.stdin)
drivers = d.get('data', {}).get('drivers', [])
for dr in drivers:
    if dr.get('userId') == '$DRIV_ID':
        print(dr.get('id',''))
        break
" 2>/dev/null)

if [ -n "$DRIV_PROFILE_ID" ] && [ "$DRIV_PROFILE_ID" != "None" ]; then
  info "Driver Profile ID: $DRIV_PROFILE_ID"

  # Approve driver
  R=$(api -X POST "$BASE_URL/api/v1/admin/drivers/$DRIV_PROFILE_ID/verify" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"APPROVED"}')
  IS_VERIFIED=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('isVerified',''))" 2>/dev/null)
  if [ "$IS_VERIFIED" = "True" ]; then
    pass "Admin verifies driver (APPROVED) - isVerified=true"
  else
    fail "Admin verify driver" "$R"
  fi
else
  skip "Admin driver verification (driver profile not found)"
fi

# ============================================================
section "T08 - Driver: Go Online"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/users/me/driver-profile" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isOnline":true}')
ONLINE=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('isOnline',''))" 2>/dev/null)
if [ "$ONLINE" = "True" ]; then
  pass "Driver goes online"
  # Get profile ID from response if not already set
  if [ -z "$DRIV_PROFILE_ID" ] || [ "$DRIV_PROFILE_ID" = "None" ]; then
    DRIV_PROFILE_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
  fi
  info "Driver Profile ID: $DRIV_PROFILE_ID"
else
  fail "Driver go online" "$R"
fi

# ============================================================
section "T09 - Ride Request Creation"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/rides" \
  -H "Authorization: Bearer $CUST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleType":"TAXI",
    "pickupLatitude":13.7563,
    "pickupLongitude":100.5018,
    "pickupAddress":"Siam Station, Bangkok",
    "dropoffLatitude":13.7470,
    "dropoffLongitude":100.5353,
    "dropoffAddress":"Asok Station, Bangkok",
    "fareOffer":100,
    "fareMin":80,
    "fareMax":150,
    "paymentMethod":"CASH"
  }')
RIDE_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$RIDE_ID" ] && [ "$RIDE_ID" != "None" ]; then
  pass "Customer creates ride request"
  info "Ride Request ID: $RIDE_ID"
else
  fail "Create ride request" "$R"
fi

# ============================================================
section "T10 - Driver Makes Initial Offer"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/offers" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"rideRequestId\":\"$RIDE_ID\",\"fareAmount\":120,\"estimatedPickupMinutes\":5,\"message\":\"I can pick you up in 5 minutes\"}")
OFFER_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$OFFER_ID" ] && [ "$OFFER_ID" != "None" ]; then
  pass "Driver makes initial offer (120 THB)"
  info "Offer ID: $OFFER_ID"
else
  fail "Driver makes offer" "$R"
fi

# ============================================================
section "T11 - Negotiation: Customer Counter-Offers"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/offers/$OFFER_ID/respond" \
  -H "Authorization: Bearer $CUST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"COUNTER","counterFareAmount":90,"message":"Too expensive, how about 90?"}')
COUNTER_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$COUNTER_ID" ] && [ "$COUNTER_ID" != "None" ]; then
  pass "Customer counter-offers (90 THB) - round 2"
  info "Counter Offer ID: $COUNTER_ID"
else
  fail "Customer counter-offer" "$R"
fi

# ============================================================
section "T12 - Negotiation: Driver Counter-Counter"
# ============================================================
# Driver responds by creating a new offer via POST /offers with parentOfferId
R=$(api -X POST "$BASE_URL/api/v1/offers" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"rideRequestId\":\"$RIDE_ID\",\"fareAmount\":105,\"parentOfferId\":\"$COUNTER_ID\",\"message\":\"How about 105?\"}")
D_COUNTER_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$D_COUNTER_ID" ] && [ "$D_COUNTER_ID" != "None" ]; then
  pass "Driver counter-counter-offers (105 THB) via POST /offers with parentOfferId - round 3"
  info "Driver Counter Offer ID: $D_COUNTER_ID"
else
  fail "Driver counter-counter offer" "$R"
fi

# ============================================================
section "T13 - Negotiation: Customer Accepts"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/offers/$D_COUNTER_ID/respond" \
  -H "Authorization: Bearer $CUST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"ACCEPT"}')
TRIP_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
LOCKED_FARE=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('trip',{}).get('lockedFare',''))" 2>/dev/null)
if [ -n "$TRIP_ID" ] && [ "$TRIP_ID" != "None" ]; then
  pass "Customer accepts offer - trip created (locked fare: $LOCKED_FARE THB)"
  info "Trip ID: $TRIP_ID"
else
  fail "Customer accept offer" "$R"
fi

# ============================================================
section "T14 - Active Trip Enforcement"
# ============================================================
if [ -n "$RIDE_ID" ] && [ "$RIDE_ID" != "None" ] && [ -n "$TRIP_ID" ] && [ "$TRIP_ID" != "None" ]; then
  # Create another ride request
  R=$(api -X POST "$BASE_URL/api/v1/rides" \
    -H "Authorization: Bearer $CUST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"vehicleType":"TAXI","pickupLatitude":13.7563,"pickupLongitude":100.5018,"pickupAddress":"Test","dropoffLatitude":13.7470,"dropoffLongitude":100.5353,"dropoffAddress":"Test dest","fareOffer":100,"fareMin":80,"fareMax":150}')
  RIDE2_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
  if [ -n "$RIDE2_ID" ] && [ "$RIDE2_ID" != "None" ]; then
    R2=$(api -X POST "$BASE_URL/api/v1/offers" \
      -H "Authorization: Bearer $DRIV_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"rideRequestId\":\"$RIDE2_ID\",\"fareAmount\":100}")
    OFFER2_ID=$(echo "$R2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
    if [ -n "$OFFER2_ID" ] && [ "$OFFER2_ID" != "None" ]; then
      R3=$(api -X POST "$BASE_URL/api/v1/offers/$OFFER2_ID/respond" \
        -H "Authorization: Bearer $CUST_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"action":"ACCEPT"}')
      ERR_MSG=$(echo "$R3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','') or d.get('message',''))" 2>/dev/null)
      if echo "$ERR_MSG" | grep -qi "active\|already"; then
        pass "Active trip enforcement: cannot accept when passenger/driver has active trip"
      else
        fail "Active trip enforcement" "Expected conflict error, got: $R3"
      fi
    else
      skip "Active trip enforcement (offer 2 failed)"
    fi
  else
    skip "Active trip enforcement (ride 2 creation failed)"
  fi
else
  skip "Active trip enforcement (no active trip to test against)"
fi

# ============================================================
section "T15 - Trip Status: DRIVER_EN_ROUTE"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DRIVER_EN_ROUTE"}')
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
if [ "$STATUS" = "DRIVER_EN_ROUTE" ]; then
  pass "Driver sets status: DRIVER_EN_ROUTE"
else
  fail "Trip status DRIVER_EN_ROUTE" "$R"
fi

# ============================================================
section "T16 - Trip Status: DRIVER_ARRIVED"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DRIVER_ARRIVED"}')
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
if [ "$STATUS" = "DRIVER_ARRIVED" ]; then
  pass "Driver sets status: DRIVER_ARRIVED"
else
  fail "Trip status DRIVER_ARRIVED" "$R"
fi

# ============================================================
section "T17 - Trip Status: PICKUP_CONFIRMED"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"PICKUP_CONFIRMED"}')
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
if [ "$STATUS" = "PICKUP_CONFIRMED" ]; then
  pass "Driver sets status: PICKUP_CONFIRMED"
else
  fail "Trip status PICKUP_CONFIRMED" "$R"
fi

# ============================================================
section "T18 - Trip Status: IN_PROGRESS"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"IN_PROGRESS"}')
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
if [ "$STATUS" = "IN_PROGRESS" ]; then
  pass "Driver sets status: IN_PROGRESS"
else
  fail "Trip status IN_PROGRESS" "$R"
fi

# ============================================================
section "T19 - Trip Status: ARRIVED_DESTINATION (New)"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ARRIVED_DESTINATION"}')
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
if [ "$STATUS" = "ARRIVED_DESTINATION" ]; then
  pass "Driver sets status: ARRIVED_DESTINATION (new)"
else
  fail "Trip status ARRIVED_DESTINATION" "$R"
fi

# ============================================================
section "T20 - Trip Status: AWAITING_CASH_CONFIRMATION (New)"
# ============================================================
R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"AWAITING_CASH_CONFIRMATION"}')
STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
if [ "$STATUS" = "AWAITING_CASH_CONFIRMATION" ]; then
  pass "Driver sets status: AWAITING_CASH_CONFIRMATION (new)"
else
  fail "Trip status AWAITING_CASH_CONFIRMATION" "$R"
fi

# ============================================================
section "T21 - Cash Payment Confirmation (New)"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/trips/$TRIP_ID/confirm-payment" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
TRIP_COMPLETED=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('tripCompleted',''))" 2>/dev/null)
DRIV_CONFIRMED=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('driverConfirmed',''))" 2>/dev/null)
if [ "$TRIP_COMPLETED" = "True" ] || [ "$DRIV_CONFIRMED" = "True" ]; then
  pass "Driver confirms cash receipt - tripCompleted=$TRIP_COMPLETED, driverConfirmed=$DRIV_CONFIRMED"
else
  fail "Cash payment confirmation" "$R"
fi

# ============================================================
section "T22 - Driver Location Update"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/users/me/location" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude":13.7470,"longitude":100.5353,"speed":30,"heading":90}')
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Driver location update (/users/me/location)"
else
  fail "Driver location update" "$R"
fi

# ============================================================
section "T23 - Rating Submission"
# ============================================================
R=$(api -X POST "$BASE_URL/api/v1/ratings" \
  -H "Authorization: Bearer $CUST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tripId\":\"$TRIP_ID\",\"score\":5,\"tags\":[\"safe\",\"on_time\"],\"comment\":\"Great driver!\"}")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Customer rates driver (5 stars)"
else
  fail "Customer rating" "$R"
fi

R=$(api -X POST "$BASE_URL/api/v1/ratings" \
  -H "Authorization: Bearer $DRIV_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tripId\":\"$TRIP_ID\",\"score\":4,\"comment\":\"Good passenger\"}")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Driver rates customer (4 stars)"
else
  fail "Driver rating" "$R"
fi

# ============================================================
section "T24 - Driver Earnings Endpoint (New)"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/drivers/earnings?period=today" \
  -H "Authorization: Bearer $DRIV_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Driver earnings endpoint (period=today)"
  EARNINGS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); s=d.get('data',{}).get('summary',{}); print(f\"trips={s.get('totalTrips',0)}, earnings={s.get('totalEarnings',0)}\")" 2>/dev/null)
  info "Earnings: $EARNINGS"
else
  fail "Driver earnings" "$R"
fi

R=$(api -X GET "$BASE_URL/api/v1/drivers/earnings?period=all" \
  -H "Authorization: Bearer $DRIV_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Driver earnings endpoint (period=all)"
else
  fail "Driver earnings (period=all)" "$R"
fi

R=$(api -X GET "$BASE_URL/api/v1/drivers/earnings?period=week" \
  -H "Authorization: Bearer $DRIV_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Driver earnings endpoint (period=week)"
else
  fail "Driver earnings (period=week)" "$R"
fi

# ============================================================
section "T25 - Trip History"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/trips?status=COMPLETED" \
  -H "Authorization: Bearer $CUST_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Customer trip history (completed)"
else
  fail "Customer trip history" "$R"
fi

R=$(api -X GET "$BASE_URL/api/v1/trips" \
  -H "Authorization: Bearer $DRIV_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Driver trip history"
else
  fail "Driver trip history" "$R"
fi

# ============================================================
section "T26 - Trip Detail"
# ============================================================
if [ -n "$TRIP_ID" ] && [ "$TRIP_ID" != "None" ]; then
  R=$(api -X GET "$BASE_URL/api/v1/trips/$TRIP_ID" \
    -H "Authorization: Bearer $CUST_TOKEN")
  STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
  if [ "$STATUS" = "COMPLETED" ]; then
    pass "Trip detail shows COMPLETED status"
  else
    fail "Trip detail" "$R"
  fi
else
  skip "Trip detail (no trip ID)"
fi

# ============================================================
section "T27 - Admin: User Management"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/admin/users?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Admin lists users"
else
  fail "Admin list users" "$R"
fi

if [ -n "$CUST_ID" ] && [ "$CUST_ID" != "None" ]; then
  # Get user detail
  R=$(api -X GET "$BASE_URL/api/v1/admin/users/$CUST_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  if [ "$OK" = "True" ]; then
    pass "Admin gets user detail"
  else
    fail "Admin get user detail" "$R"
  fi

  # Suspend user
  R=$(api -X PATCH "$BASE_URL/api/v1/admin/users/$CUST_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"SUSPENDED"}')
  NEW_STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
  if [ "$NEW_STATUS" = "SUSPENDED" ]; then
    pass "Admin suspends user - status: SUSPENDED"
  else
    fail "Admin suspend user" "$R"
  fi

  # Reactivate user
  R=$(api -X PATCH "$BASE_URL/api/v1/admin/users/$CUST_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"ACTIVE"}')
  NEW_STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
  if [ "$NEW_STATUS" = "ACTIVE" ]; then
    pass "Admin reactivates user - status: ACTIVE"
  else
    fail "Admin reactivate user" "$R"
  fi
else
  skip "Admin user detail/suspend/reactivate (no customer ID)"
fi

# ============================================================
section "T28 - Admin: Driver Reject + Re-verify"
# ============================================================
if [ -n "$DRIV_PROFILE_ID" ] && [ "$DRIV_PROFILE_ID" != "None" ]; then
  R=$(api -X POST "$BASE_URL/api/v1/admin/drivers/$DRIV_PROFILE_ID/verify" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"REJECTED","reason":"Document unclear"}')
  VSTATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('verificationStatus',''))" 2>/dev/null)
  if [ "$VSTATUS" = "REJECTED" ]; then
    pass "Admin rejects driver (REJECTED)"
  else
    fail "Admin reject driver" "$R"
  fi

  # Re-approve
  R=$(api -X POST "$BASE_URL/api/v1/admin/drivers/$DRIV_PROFILE_ID/verify" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"APPROVED"}')
  IS_VERIFIED=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('isVerified',''))" 2>/dev/null)
  if [ "$IS_VERIFIED" = "True" ]; then
    pass "Admin re-approves driver (APPROVED)"
  else
    fail "Admin re-approve driver" "$R"
  fi
else
  skip "Admin driver reject/re-approve (no driver profile ID)"
fi

# ============================================================
section "T29 - Admin: Trip Detail with Timeline (New)"
# ============================================================
if [ -n "$TRIP_ID" ] && [ "$TRIP_ID" != "None" ]; then
  R=$(api -X GET "$BASE_URL/api/v1/admin/trips/$TRIP_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  if [ "$OK" = "True" ]; then
    pass "Admin gets trip detail"

    TIMELINE_LEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('timeline',[])))" 2>/dev/null)
    info "Timeline entries: $TIMELINE_LEN"
    if [ "$TIMELINE_LEN" -gt "0" ] 2>/dev/null; then
      pass "Trip detail includes timeline (status logs)"
    else
      fail "Trip timeline not populated" "Expected >0 entries, got $TIMELINE_LEN"
    fi

    NEGOT_LEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('negotiation',[])))" 2>/dev/null)
    info "Negotiation rounds: $NEGOT_LEN"
    if [ "$NEGOT_LEN" -ge "3" ] 2>/dev/null; then
      pass "Trip detail includes negotiation history (3+ rounds)"
    else
      fail "Negotiation history" "Expected >=3 rounds, got $NEGOT_LEN"
    fi
  else
    fail "Admin trip detail" "$R"
  fi
else
  skip "Admin trip detail (no trip ID)"
fi

# ============================================================
section "T30 - Admin: Audit Logs (New)"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/admin/audit-logs?page=1&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Admin fetches audit logs"

  LOG_COUNT=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',{}).get('logs',[])))" 2>/dev/null)
  info "Audit log entries: $LOG_COUNT"
  if [ "$LOG_COUNT" -gt "0" ] 2>/dev/null; then
    pass "Audit logs contain entries from admin actions"
  else
    fail "Audit logs empty" "Expected >0 entries"
  fi
else
  fail "Admin audit logs" "$R"
fi

# Filter by action
R=$(api -X GET "$BASE_URL/api/v1/admin/audit-logs?action=APPROVE_DRIVER" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Audit logs filter by action=APPROVE_DRIVER"
else
  fail "Audit logs filter by action" "$R"
fi

# Filter by entity
R=$(api -X GET "$BASE_URL/api/v1/admin/audit-logs?entity=User" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Audit logs filter by entity=User"
else
  fail "Audit logs filter by entity" "$R"
fi

# ============================================================
section "T31 - Admin: Dashboard Stats"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/admin/dashboard" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Admin dashboard stats"
else
  fail "Admin stats" "$R"
fi

# ============================================================
section "T32 - Admin: Trips List"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/admin/trips?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Admin trips list"
else
  fail "Admin trips list" "$R"
fi

# ============================================================
section "T33 - Cancellation: NO_SHOW_PASSENGER"
# ============================================================
TS2=$(date +%s)
CUST2_PHONE="+6683${TS2: -7}"
api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$CUST2_PHONE\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$CUST2_PHONE\",\"code\":\"123456\",\"role\":\"CUSTOMER\",\"name\":\"Cancel Test Customer\"}")
CUST2_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)

DRIV2_PHONE="+6684${TS2: -7}"
api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$DRIV2_PHONE\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$DRIV2_PHONE\",\"code\":\"123456\",\"role\":\"DRIVER\",\"name\":\"Cancel Test Driver\"}")
DRIV2_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
DRIV2_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$CUST2_TOKEN" ] && [ "$CUST2_TOKEN" != "None" ] && [ -n "$DRIV2_TOKEN" ] && [ "$DRIV2_TOKEN" != "None" ]; then
  # Register vehicle
  api -X POST "$BASE_URL/api/v1/vehicles" -H "Authorization: Bearer $DRIV2_TOKEN" -H "Content-Type: application/json" \
    -d "{\"type\":\"TAXI\",\"make\":\"Toyota\",\"model\":\"Vios\",\"color\":\"Black\",\"year\":2023,\"plateNumber\":\"งจ-${TS2: -4}\"}" > /dev/null

  # Get driver 2 profile ID for approval
  DRIV2_PROF_R=$(api -X GET "$BASE_URL/api/v1/admin/drivers?page=1&limit=100" -H "Authorization: Bearer $ADMIN_TOKEN")
  DRIV2_PROFILE_ID=$(echo "$DRIV2_PROF_R" | python3 -c "
import json, sys
d = json.load(sys.stdin)
drivers = d.get('data', {}).get('drivers', [])
for dr in drivers:
    if dr.get('userId') == '$DRIV2_ID':
        print(dr.get('id',''))
        break
" 2>/dev/null)

  if [ -n "$DRIV2_PROFILE_ID" ] && [ "$DRIV2_PROFILE_ID" != "None" ]; then
    # Approve driver 2
    api -X POST "$BASE_URL/api/v1/admin/drivers/$DRIV2_PROFILE_ID/verify" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
      -d '{"status":"APPROVED"}' > /dev/null

    # Go online
    api -X PATCH "$BASE_URL/api/v1/users/me/driver-profile" \
      -H "Authorization: Bearer $DRIV2_TOKEN" -H "Content-Type: application/json" \
      -d '{"isOnline":true}' > /dev/null

    # Create ride and accept
    R=$(api -X POST "$BASE_URL/api/v1/rides" -H "Authorization: Bearer $CUST2_TOKEN" -H "Content-Type: application/json" \
      -d '{"vehicleType":"TAXI","pickupLatitude":13.7563,"pickupLongitude":100.5018,"pickupAddress":"Test","dropoffLatitude":13.7470,"dropoffLongitude":100.5353,"dropoffAddress":"Test","fareOffer":100,"fareMin":80,"fareMax":150}')
    RIDE3_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    R=$(api -X POST "$BASE_URL/api/v1/offers" -H "Authorization: Bearer $DRIV2_TOKEN" -H "Content-Type: application/json" \
      -d "{\"rideRequestId\":\"$RIDE3_ID\",\"fareAmount\":100}")
    OFFER3_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    R=$(api -X POST "$BASE_URL/api/v1/offers/$OFFER3_ID/respond" -H "Authorization: Bearer $CUST2_TOKEN" -H "Content-Type: application/json" \
      -d '{"action":"ACCEPT"}')
    TRIP3_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    if [ -n "$TRIP3_ID" ] && [ "$TRIP3_ID" != "None" ]; then
      api -X PATCH "$BASE_URL/api/v1/trips/$TRIP3_ID/status" -H "Authorization: Bearer $DRIV2_TOKEN" -H "Content-Type: application/json" \
        -d '{"status":"DRIVER_EN_ROUTE"}' > /dev/null
      api -X PATCH "$BASE_URL/api/v1/trips/$TRIP3_ID/status" -H "Authorization: Bearer $DRIV2_TOKEN" -H "Content-Type: application/json" \
        -d '{"status":"DRIVER_ARRIVED"}' > /dev/null

      # Test NO_SHOW_PASSENGER
      R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP3_ID/status" \
        -H "Authorization: Bearer $DRIV2_TOKEN" -H "Content-Type: application/json" \
        -d '{"status":"NO_SHOW_PASSENGER","cancelReason":"Passenger did not show up"}')
      NSP_STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
      if [ "$NSP_STATUS" = "NO_SHOW_PASSENGER" ]; then
        pass "No-show passenger status (NO_SHOW_PASSENGER)"
      else
        fail "NO_SHOW_PASSENGER status" "$R"
      fi
    else
      skip "NO_SHOW_PASSENGER (trip creation failed)"
    fi
  else
    skip "NO_SHOW_PASSENGER (driver 2 profile not found for approval)"
  fi
else
  skip "NO_SHOW_PASSENGER (user setup failed)"
fi

# ============================================================
section "T34 - Cancellation: CANCELLED_BY_DRIVER"
# ============================================================
TS3=$(date +%s)
CUST3_PHONE="+6685${TS3: -7}"
DRIV3_PHONE="+6686${TS3: -7}"
api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$CUST3_PHONE\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$CUST3_PHONE\",\"code\":\"123456\",\"role\":\"CUSTOMER\",\"name\":\"Cancel Test C3\"}")
CUST3_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)

api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$DRIV3_PHONE\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$DRIV3_PHONE\",\"code\":\"123456\",\"role\":\"DRIVER\",\"name\":\"Cancel Test D3\"}")
DRIV3_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
DRIV3_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$CUST3_TOKEN" ] && [ "$CUST3_TOKEN" != "None" ] && [ -n "$DRIV3_TOKEN" ] && [ "$DRIV3_TOKEN" != "None" ]; then
  api -X POST "$BASE_URL/api/v1/vehicles" -H "Authorization: Bearer $DRIV3_TOKEN" -H "Content-Type: application/json" \
    -d "{\"type\":\"TAXI\",\"make\":\"Honda\",\"model\":\"Civic\",\"color\":\"Blue\",\"year\":2023,\"plateNumber\":\"ซฉ-${TS3: -4}\"}" > /dev/null

  DRIV3_PROF_R=$(api -X GET "$BASE_URL/api/v1/admin/drivers?page=1&limit=100" -H "Authorization: Bearer $ADMIN_TOKEN")
  DRIV3_PROFILE_ID=$(echo "$DRIV3_PROF_R" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for dr in d.get('data', {}).get('drivers', []):
    if dr.get('userId') == '$DRIV3_ID':
        print(dr.get('id',''))
        break
" 2>/dev/null)

  if [ -n "$DRIV3_PROFILE_ID" ] && [ "$DRIV3_PROFILE_ID" != "None" ]; then
    api -X POST "$BASE_URL/api/v1/admin/drivers/$DRIV3_PROFILE_ID/verify" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
    api -X PATCH "$BASE_URL/api/v1/users/me/driver-profile" -H "Authorization: Bearer $DRIV3_TOKEN" -H "Content-Type: application/json" -d '{"isOnline":true}' > /dev/null

    R=$(api -X POST "$BASE_URL/api/v1/rides" -H "Authorization: Bearer $CUST3_TOKEN" -H "Content-Type: application/json" \
      -d '{"vehicleType":"TAXI","pickupLatitude":13.7563,"pickupLongitude":100.5018,"pickupAddress":"Test","dropoffLatitude":13.7470,"dropoffLongitude":100.5353,"dropoffAddress":"Test","fareOffer":100,"fareMin":80,"fareMax":150}')
    RIDE4_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    R=$(api -X POST "$BASE_URL/api/v1/offers" -H "Authorization: Bearer $DRIV3_TOKEN" -H "Content-Type: application/json" \
      -d "{\"rideRequestId\":\"$RIDE4_ID\",\"fareAmount\":100}")
    OFFER4_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    R=$(api -X POST "$BASE_URL/api/v1/offers/$OFFER4_ID/respond" -H "Authorization: Bearer $CUST3_TOKEN" -H "Content-Type: application/json" -d '{"action":"ACCEPT"}')
    TRIP4_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    if [ -n "$TRIP4_ID" ] && [ "$TRIP4_ID" != "None" ]; then
      # Driver cancels
      R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP4_ID/status" \
        -H "Authorization: Bearer $DRIV3_TOKEN" -H "Content-Type: application/json" \
        -d '{"status":"CANCELLED_BY_DRIVER","cancelReason":"Emergency - cannot complete trip"}')
      CANCEL_STATUS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)
      if [ "$CANCEL_STATUS" = "CANCELLED_BY_DRIVER" ]; then
        pass "Driver cancellation: CANCELLED_BY_DRIVER"
      else
        fail "CANCELLED_BY_DRIVER status" "$R"
      fi
    else
      skip "CANCELLED_BY_DRIVER (trip creation failed)"
    fi
  else
    skip "CANCELLED_BY_DRIVER (driver profile not found)"
  fi
else
  skip "CANCELLED_BY_DRIVER (user setup failed)"
fi

# ============================================================
section "T35 - Invalid Transitions Blocked"
# ============================================================
if [ -n "$TRIP_ID" ] && [ "$TRIP_ID" != "None" ]; then
  # COMPLETED -> IN_PROGRESS should fail
  R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP_ID/status" \
    -H "Authorization: Bearer $DRIV_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"IN_PROGRESS"}')
  SUCCESS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  if [ "$SUCCESS" != "True" ]; then
    pass "Invalid transition blocked: COMPLETED -> IN_PROGRESS"
  else
    fail "Invalid transition should be blocked" "$R"
  fi
else
  skip "Invalid transition test (no completed trip)"
fi

# ============================================================
section "T36 - Role-Based Transition Enforcement"
# ============================================================
TS4=$(date +%s)
CUST4_PHONE="+6687${TS4: -7}"
DRIV4_PHONE="+6688${TS4: -7}"
api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$CUST4_PHONE\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$CUST4_PHONE\",\"code\":\"123456\",\"role\":\"CUSTOMER\",\"name\":\"Role Test C4\"}")
CUST4_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)

api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$DRIV4_PHONE\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$DRIV4_PHONE\",\"code\":\"123456\",\"role\":\"DRIVER\",\"name\":\"Role Test D4\"}")
DRIV4_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null)
DRIV4_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$CUST4_TOKEN" ] && [ "$CUST4_TOKEN" != "None" ] && [ -n "$DRIV4_TOKEN" ] && [ "$DRIV4_TOKEN" != "None" ]; then
  api -X POST "$BASE_URL/api/v1/vehicles" -H "Authorization: Bearer $DRIV4_TOKEN" -H "Content-Type: application/json" \
    -d "{\"type\":\"TAXI\",\"make\":\"Mazda\",\"model\":\"3\",\"color\":\"Red\",\"year\":2023,\"plateNumber\":\"ยภ-${TS4: -4}\"}" > /dev/null

  DRIV4_PROF_R=$(api -X GET "$BASE_URL/api/v1/admin/drivers?page=1&limit=100" -H "Authorization: Bearer $ADMIN_TOKEN")
  DRIV4_PROFILE_ID=$(echo "$DRIV4_PROF_R" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for dr in d.get('data', {}).get('drivers', []):
    if dr.get('userId') == '$DRIV4_ID':
        print(dr.get('id',''))
        break
" 2>/dev/null)

  if [ -n "$DRIV4_PROFILE_ID" ] && [ "$DRIV4_PROFILE_ID" != "None" ]; then
    api -X POST "$BASE_URL/api/v1/admin/drivers/$DRIV4_PROFILE_ID/verify" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"APPROVED"}' > /dev/null
    api -X PATCH "$BASE_URL/api/v1/users/me/driver-profile" -H "Authorization: Bearer $DRIV4_TOKEN" -H "Content-Type: application/json" -d '{"isOnline":true}' > /dev/null

    R=$(api -X POST "$BASE_URL/api/v1/rides" -H "Authorization: Bearer $CUST4_TOKEN" -H "Content-Type: application/json" \
      -d '{"vehicleType":"TAXI","pickupLatitude":13.7563,"pickupLongitude":100.5018,"pickupAddress":"Test","dropoffLatitude":13.7470,"dropoffLongitude":100.5353,"dropoffAddress":"Test","fareOffer":100,"fareMin":80,"fareMax":150}')
    RIDE5_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    R=$(api -X POST "$BASE_URL/api/v1/offers" -H "Authorization: Bearer $DRIV4_TOKEN" -H "Content-Type: application/json" \
      -d "{\"rideRequestId\":\"$RIDE5_ID\",\"fareAmount\":100}")
    OFFER5_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    R=$(api -X POST "$BASE_URL/api/v1/offers/$OFFER5_ID/respond" -H "Authorization: Bearer $CUST4_TOKEN" -H "Content-Type: application/json" -d '{"action":"ACCEPT"}')
    TRIP5_ID=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

    if [ -n "$TRIP5_ID" ] && [ "$TRIP5_ID" != "None" ]; then
      # Customer tries DRIVER_EN_ROUTE (driver-only)
      R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP5_ID/status" \
        -H "Authorization: Bearer $CUST4_TOKEN" -H "Content-Type: application/json" \
        -d '{"status":"DRIVER_EN_ROUTE"}')
      SUCCESS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
      if [ "$SUCCESS" != "True" ]; then
        pass "Customer cannot set DRIVER_EN_ROUTE (driver-only transition blocked)"
      else
        fail "Role enforcement: customer should not set DRIVER_EN_ROUTE" "$R"
      fi

      # Driver tries customer-only cancel
      R=$(api -X PATCH "$BASE_URL/api/v1/trips/$TRIP5_ID/status" \
        -H "Authorization: Bearer $DRIV4_TOKEN" -H "Content-Type: application/json" \
        -d '{"status":"CANCELLED_BY_PASSENGER"}')
      SUCCESS=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
      if [ "$SUCCESS" != "True" ]; then
        pass "Driver cannot set CANCELLED_BY_PASSENGER (customer-only blocked)"
      else
        fail "Role enforcement: driver should not set CANCELLED_BY_PASSENGER" "$R"
      fi
    else
      skip "Role enforcement (trip creation failed)"
    fi
  else
    skip "Role enforcement (driver 4 profile not found)"
  fi
else
  skip "Role enforcement (user setup failed)"
fi

# ============================================================
section "T37 - Refresh Token"
# ============================================================
# Refresh token requires the refreshToken in request body
TS_R=$(date +%s)
PHONE_R="+6699${TS_R: -7}"
api -X POST "$BASE_URL/api/v1/auth/request-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE_R\"}" > /dev/null
R=$(api -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE_R\",\"code\":\"123456\",\"role\":\"CUSTOMER\",\"name\":\"Refresh Test\"}")
REFRESH_TOKEN=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('refreshToken',''))" 2>/dev/null)

if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "None" ] && [ "$REFRESH_TOKEN" != "" ]; then
  R=$(api -X POST "$BASE_URL/api/v1/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
  OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
  if [ "$OK" = "True" ]; then
    pass "Token refresh works (refreshToken in body)"
  else
    fail "Token refresh" "$R"
  fi
else
  fail "Token refresh" "No refresh token in verify-otp response"
fi

# ============================================================
section "T38 - Admin Drivers List"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/admin/drivers?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  DRIVER_COUNT=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('pagination',{}).get('total',0))" 2>/dev/null)
  pass "Admin lists drivers (total: $DRIVER_COUNT)"
else
  fail "Admin drivers list" "$R"
fi

# ============================================================
section "T39 - Admin Rides List"
# ============================================================
R=$(api -X GET "$BASE_URL/api/v1/admin/rides?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
OK=$(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
if [ "$OK" = "True" ]; then
  pass "Admin rides list"
else
  fail "Admin rides list" "$R"
fi

# ============================================================
# FINAL SUMMARY
# ============================================================
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              FINAL TEST RESULTS             ║${NC}"
echo -e "${BOLD}╠════════════════════════════════════════════╣${NC}"
TOTAL=$((PASS + FAIL + SKIP))
printf "${BOLD}║  ${GREEN}PASS: %-3d${NC}${BOLD}                                 ║${NC}\n" $PASS
printf "${BOLD}║  ${RED}FAIL: %-3d${NC}${BOLD}                                 ║${NC}\n" $FAIL
printf "${BOLD}║  ${YELLOW}SKIP: %-3d${NC}${BOLD}                                 ║${NC}\n" $SKIP
printf "${BOLD}║  TOTAL: %-3d tests                          ║${NC}\n" $TOTAL
echo -e "${BOLD}╚════════════════════════════════════════════╝${NC}"

if [ "$FAIL" -gt "0" ]; then
  echo ""
  echo -e "${RED}${BOLD}Failed Tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "  ${RED}✗${NC} $t"
  done
fi

echo ""
if [ "$FAIL" -eq "0" ]; then
  echo -e "${GREEN}${BOLD}🎉 ALL TESTS PASSED! FairGo is production ready.${NC}"
  exit 0
else
  PCT=$((PASS * 100 / (PASS + FAIL)))
  echo -e "${RED}${BOLD}❌ $FAIL test(s) failed ($PCT% pass rate). Investigate above errors.${NC}"
  exit 1
fi

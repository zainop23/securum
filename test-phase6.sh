#!/usr/bin/env bash
# ============================================================================
# Phase 6 Integration Tests
#
# Tests the full auth, onboarding, org management, and admin API flows
# against a running coordinator at localhost:4000.
#
# Prerequisites:
#   docker compose -f docker/docker-compose.yml down -v
#   docker compose -f docker/docker-compose.yml up --build -d
#   # Wait for coordinator to be healthy, then run this script.
#
# Usage:
#   bash test-phase6.sh [--base-url http://localhost:4000]
# ============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:4000}"
PASS=0
FAIL=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

assert_status() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  TOTAL=$((TOTAL + 1))

  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $test_name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $test_name (expected HTTP $expected, got HTTP $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local test_name="$1"
  local json="$2"
  local field="$3"
  local expected="$4"
  TOTAL=$((TOTAL + 1))

  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d${field})" 2>/dev/null || echo "__PARSE_ERROR__")

  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $test_name ($field = $expected)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $test_name ($field expected=$expected, got=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_exists() {
  local test_name="$1"
  local json="$2"
  local field="$3"
  TOTAL=$((TOTAL + 1))

  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d${field}; print('exists' if v else 'empty')" 2>/dev/null || echo "__PARSE_ERROR__")

  if [ "$actual" = "exists" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $test_name ($field exists)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $test_name ($field missing or empty, got=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

extract_json() {
  local json="$1"
  local field="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d${field})" 2>/dev/null
}

http_status() {
  local response="$1"
  echo "$response" | tail -1
}

http_body() {
  local response="$1"
  echo "$response" | sed '$d'
}

do_get() {
  local url="$1"
  local token="${2:-}"
  local headers=""
  if [ -n "$token" ]; then
    headers="-H \"Authorization: Bearer $token\""
  fi
  eval curl -s -w '\n%{http_code}' "$headers" "$url" 2>/dev/null
}

do_post() {
  local url="$1"
  local data="$2"
  local token="${3:-}"
  local headers="-H 'Content-Type: application/json'"
  if [ -n "$token" ]; then
    headers="$headers -H 'Authorization: Bearer $token'"
  fi
  eval curl -s -w '\n%{http_code}' $headers -X POST -d "'$data'" "$url" 2>/dev/null
}

do_put() {
  local url="$1"
  local data="$2"
  local token="${3:-}"
  local headers="-H 'Content-Type: application/json'"
  if [ -n "$token" ]; then
    headers="$headers -H 'Authorization: Bearer $token'"
  fi
  eval curl -s -w '\n%{http_code}' $headers -X PUT -d "'$data'" "$url" 2>/dev/null
}

do_delete() {
  local url="$1"
  local token="${2:-}"
  local headers=""
  if [ -n "$token" ]; then
    headers="-H 'Authorization: Bearer $token'"
  fi
  eval curl -s -w '\n%{http_code}' $headers -X DELETE "$url" 2>/dev/null
}

# ============================================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         SECURUM PHASE 6 — INTEGRATION TESTS         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Target: ${YELLOW}$BASE_URL${NC}"
echo ""

# ============================================================================
# 0. Health Check
# ============================================================================
echo -e "${CYAN}── 0. Health Check ──${NC}"

RESPONSE=$(do_get "$BASE_URL/health")
STATUS=$(http_status "$RESPONSE")
assert_status "GET /health returns 200" "200" "$STATUS"

echo ""

# ============================================================================
# 1. Admin Login (seeded platform admin)
# ============================================================================
echo -e "${CYAN}── 1. Admin Login ──${NC}"

RESPONSE=$(do_post "$BASE_URL/auth/login" '{"email":"admin@securum.dev","password":"admin123"}')
STATUS=$(http_status "$RESPONSE")
BODY=$(http_body "$RESPONSE")
assert_status "POST /auth/login (admin) returns 200" "200" "$STATUS"

if [ "$STATUS" = "200" ]; then
  ADMIN_TOKEN=$(extract_json "$BODY" "['token']")
  assert_json_exists "Admin login returns token" "$BODY" "['token']"
  assert_json_field "Admin login returns platform_admin role" "$BODY" "['user']['role']" "platform_admin"
else
  echo -e "  ${RED}⚠ Cannot proceed without admin login. Remaining tests may fail.${NC}"
  ADMIN_TOKEN=""
fi

echo ""

# ============================================================================
# 2. Registration — New Org
# ============================================================================
echo -e "${CYAN}── 2. Registration ──${NC}"

RESPONSE=$(do_post "$BASE_URL/auth/register" '{"email":"alice@hospital.org","password":"SecurePass1","fullName":"Alice Smith","orgName":"Hospital Alpha"}')
STATUS=$(http_status "$RESPONSE")
BODY=$(http_body "$RESPONSE")
assert_status "POST /auth/register returns 201" "201" "$STATUS"

if [ "$STATUS" = "201" ]; then
  ORG_ADMIN_TOKEN=$(extract_json "$BODY" "['token']")
  ORG_ID=$(extract_json "$BODY" "['user']['orgId']")
  assert_json_exists "Registration returns token" "$BODY" "['token']"
  assert_json_field "Registration returns org_admin role" "$BODY" "['user']['role']" "org_admin"
  assert_json_exists "Registration returns orgId" "$BODY" "['user']['orgId']"
  assert_json_exists "Registration returns apiKey" "$BODY" "['apiKey']"
else
  ORG_ADMIN_TOKEN=""
  ORG_ID=""
fi

# ── Duplicate email should fail ──
RESPONSE=$(do_post "$BASE_URL/auth/register" '{"email":"alice@hospital.org","password":"SecurePass1","fullName":"Alice Again","orgName":"Hospital Beta"}')
STATUS=$(http_status "$RESPONSE")
assert_status "Duplicate email registration returns 409" "409" "$STATUS"

# ── Weak password should fail ──
RESPONSE=$(do_post "$BASE_URL/auth/register" '{"email":"weak@test.org","password":"weak","fullName":"Weak User","orgName":"Weak Org"}')
STATUS=$(http_status "$RESPONSE")
assert_status "Weak password returns 400" "400" "$STATUS"

# ── Missing fields should fail ──
RESPONSE=$(do_post "$BASE_URL/auth/register" '{"email":"no@name.org"}')
STATUS=$(http_status "$RESPONSE")
assert_status "Missing fields returns 400" "400" "$STATUS"

echo ""

# ============================================================================
# 3. Login — Registered User
# ============================================================================
echo -e "${CYAN}── 3. Login ──${NC}"

RESPONSE=$(do_post "$BASE_URL/auth/login" '{"email":"alice@hospital.org","password":"SecurePass1"}')
STATUS=$(http_status "$RESPONSE")
BODY=$(http_body "$RESPONSE")
assert_status "POST /auth/login (alice) returns 200" "200" "$STATUS"
assert_json_field "Login returns correct email" "$BODY" "['user']['email']" "alice@hospital.org"

# ── Wrong password ──
RESPONSE=$(do_post "$BASE_URL/auth/login" '{"email":"alice@hospital.org","password":"WrongPass1"}')
STATUS=$(http_status "$RESPONSE")
assert_status "Wrong password returns 401" "401" "$STATUS"

# ── Non-existent user ──
RESPONSE=$(do_post "$BASE_URL/auth/login" '{"email":"nobody@test.org","password":"Whatever1"}')
STATUS=$(http_status "$RESPONSE")
assert_status "Non-existent user returns 401" "401" "$STATUS"

echo ""

# ============================================================================
# 4. Onboarding Flow
# ============================================================================
echo -e "${CYAN}── 4. Onboarding Flow ──${NC}"

if [ -n "$ORG_ADMIN_TOKEN" ]; then
  # 4.1 Check initial status
  RESPONSE=$(do_get "$BASE_URL/onboarding/status" "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  BODY=$(http_body "$RESPONSE")
  assert_status "GET /onboarding/status returns 200" "200" "$STATUS"
  assert_json_field "Initial step is account_created" "$BODY" "['currentStep']" "account_created"

  # 4.2 Configure node endpoint
  RESPONSE=$(do_put "$BASE_URL/onboarding/node-endpoint" '{"endpointUrl":"http://org-node-1:5001"}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "PUT /onboarding/node-endpoint returns 200" "200" "$STATUS"

  # Verify step advanced
  RESPONSE=$(do_get "$BASE_URL/onboarding/status" "$ORG_ADMIN_TOKEN")
  BODY=$(http_body "$RESPONSE")
  assert_json_field "Step advanced to node_endpoint_configured" "$BODY" "['currentStep']" "node_endpoint_configured"

  # 4.3 Upload schema map
  RESPONSE=$(do_put "$BASE_URL/onboarding/schema-map" '{"schemaMap":{"tables":{"transactions":"orders"},"columns":{"amount":"total","category":"type","region":"area","tx_date":"order_date"}}}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "PUT /onboarding/schema-map returns 200" "200" "$STATUS"

  RESPONSE=$(do_get "$BASE_URL/onboarding/status" "$ORG_ADMIN_TOKEN")
  BODY=$(http_body "$RESPONSE")
  assert_json_field "Step advanced to schema_map_uploaded" "$BODY" "['currentStep']" "schema_map_uploaded"

  # 4.4 Test connectivity (will likely fail since org-node isn't at that URL outside Docker)
  RESPONSE=$(do_post "$BASE_URL/onboarding/test-connectivity" '{}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "POST /onboarding/test-connectivity returns 200" "200" "$STATUS"
  # Note: success may be false since the org-node isn't running at the URL, but the endpoint works

  # 4.5 Invalid schema map should fail
  RESPONSE=$(do_put "$BASE_URL/onboarding/schema-map" '{"schemaMap":{"tables":{"transactions":"orders"}}}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "Schema map without columns returns 400" "400" "$STATUS"

else
  echo -e "  ${YELLOW}⚠ Skipping onboarding tests — no org admin token${NC}"
fi

echo ""

# ============================================================================
# 5. Org Management
# ============================================================================
echo -e "${CYAN}── 5. Org Management ──${NC}"

if [ -n "$ORG_ADMIN_TOKEN" ]; then
  # 5.1 Get org profile
  RESPONSE=$(do_get "$BASE_URL/orgs/me" "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  BODY=$(http_body "$RESPONSE")
  assert_status "GET /orgs/me returns 200" "200" "$STATUS"
  assert_json_field "Org name matches" "$BODY" "['org']['name']" "Hospital Alpha"

  # 5.2 Update org
  RESPONSE=$(do_put "$BASE_URL/orgs/me" '{"description":"A test hospital network"}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "PUT /orgs/me returns 200" "200" "$STATUS"

  # 5.3 List members
  RESPONSE=$(do_get "$BASE_URL/orgs/me/members" "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  BODY=$(http_body "$RESPONSE")
  assert_status "GET /orgs/me/members returns 200" "200" "$STATUS"

  # 5.4 Get settings
  RESPONSE=$(do_get "$BASE_URL/orgs/me/settings" "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "GET /orgs/me/settings returns 200" "200" "$STATUS"

  # 5.5 Update settings
  RESPONSE=$(do_put "$BASE_URL/orgs/me/settings" '{"privacyBudgetLimit":20}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "PUT /orgs/me/settings returns 200" "200" "$STATUS"

  # 5.6 Privacy budget
  RESPONSE=$(do_get "$BASE_URL/orgs/me/privacy-budget" "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  BODY=$(http_body "$RESPONSE")
  assert_status "GET /orgs/me/privacy-budget returns 200" "200" "$STATUS"
  assert_json_field "Budget spent is 0" "$BODY" "['spent']" "0.0"

else
  echo -e "  ${YELLOW}⚠ Skipping org management tests — no org admin token${NC}"
fi

echo ""

# ============================================================================
# 6. Team Invitations
# ============================================================================
echo -e "${CYAN}── 6. Team Invitations ──${NC}"

if [ -n "$ORG_ADMIN_TOKEN" ]; then
  # 6.1 Invite a user
  RESPONSE=$(do_post "$BASE_URL/orgs/me/invite" '{"email":"bob@hospital.org","role":"analyst"}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  BODY=$(http_body "$RESPONSE")
  assert_status "POST /orgs/me/invite returns 201" "201" "$STATUS"

  if [ "$STATUS" = "201" ]; then
    INVITE_TOKEN=$(extract_json "$BODY" "['token']")
    assert_json_exists "Invite returns token" "$BODY" "['token']"
  else
    INVITE_TOKEN=""
  fi

  # 6.2 Duplicate invite should fail
  RESPONSE=$(do_post "$BASE_URL/orgs/me/invite" '{"email":"bob@hospital.org","role":"analyst"}' "$ORG_ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "Duplicate invite returns 409" "409" "$STATUS"

  # 6.3 Accept invitation
  if [ -n "$INVITE_TOKEN" ]; then
    RESPONSE=$(do_post "$BASE_URL/auth/accept-invite" "{\"token\":\"$INVITE_TOKEN\",\"fullName\":\"Bob Johnson\",\"password\":\"BobSecure1\"}")
    STATUS=$(http_status "$RESPONSE")
    BODY=$(http_body "$RESPONSE")
    assert_status "POST /auth/accept-invite returns 201" "201" "$STATUS"
    assert_json_field "Accepted invite returns analyst role" "$BODY" "['user']['role']" "analyst"

    # 6.4 Verify Bob can login
    RESPONSE=$(do_post "$BASE_URL/auth/login" '{"email":"bob@hospital.org","password":"BobSecure1"}')
    STATUS=$(http_status "$RESPONSE")
    assert_status "Bob can login after accepting invite" "200" "$STATUS"
  fi
else
  echo -e "  ${YELLOW}⚠ Skipping invitation tests — no org admin token${NC}"
fi

echo ""

# ============================================================================
# 7. Admin Panel
# ============================================================================
echo -e "${CYAN}── 7. Admin Panel ──${NC}"

if [ -n "$ADMIN_TOKEN" ]; then
  # 7.1 Platform stats
  RESPONSE=$(do_get "$BASE_URL/admin/stats" "$ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  BODY=$(http_body "$RESPONSE")
  assert_status "GET /admin/stats returns 200" "200" "$STATUS"

  # 7.2 List orgs
  RESPONSE=$(do_get "$BASE_URL/admin/orgs" "$ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "GET /admin/orgs returns 200" "200" "$STATUS"

  # 7.3 List users
  RESPONSE=$(do_get "$BASE_URL/admin/users" "$ADMIN_TOKEN")
  STATUS=$(http_status "$RESPONSE")
  assert_status "GET /admin/users returns 200" "200" "$STATUS"

  # 7.4 Non-admin should be forbidden
  if [ -n "$ORG_ADMIN_TOKEN" ]; then
    RESPONSE=$(do_get "$BASE_URL/admin/stats" "$ORG_ADMIN_TOKEN")
    STATUS=$(http_status "$RESPONSE")
    assert_status "GET /admin/stats as org_admin returns 403" "403" "$STATUS"
  fi

  # 7.5 No token should be unauthorized
  RESPONSE=$(do_get "$BASE_URL/admin/stats")
  STATUS=$(http_status "$RESPONSE")
  assert_status "GET /admin/stats without token returns 401" "401" "$STATUS"

else
  echo -e "  ${YELLOW}⚠ Skipping admin tests — no admin token${NC}"
fi

echo ""

# ============================================================================
# 8. Auth Edge Cases
# ============================================================================
echo -e "${CYAN}── 8. Auth Edge Cases ──${NC}"

# 8.1 No token on protected route
RESPONSE=$(do_get "$BASE_URL/results")
STATUS=$(http_status "$RESPONSE")
assert_status "GET /results without token returns 401" "401" "$STATUS"

# 8.2 Invalid token
RESPONSE=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer invalid.token.here" "$BASE_URL/results" 2>/dev/null)
STATUS=$(http_status "$RESPONSE")
assert_status "GET /results with invalid token returns 401" "401" "$STATUS"

echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "  Total: ${TOTAL}   ${GREEN}Passed: ${PASS}${NC}   ${RED}Failed: ${FAIL}${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed! ✓${NC}"
  exit 0
fi

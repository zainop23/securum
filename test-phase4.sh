#!/usr/bin/env bash
#
# Phase 4 Verification Script
# Tests the commit–reveal orchestration end-to-end.
#
# Prerequisites:  docker compose up --build  (from docker/ directory)
# Dependencies:   curl, jq
#
# Usage:  ./test-phase4.sh [COORDINATOR_URL]
#

set -euo pipefail

COORD="${1:-http://localhost:4000}"
PASS=0
FAIL=0

# ───── Helpers ─────

check_dep() {
  command -v "$1" >/dev/null || { echo "ERROR: $1 is required. Install with: brew install $1"; exit 1; }
}

pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1"; }

section() { echo ""; echo "═══ $1 ═══"; }

# ───── Dependency check ─────
check_dep curl
check_dep jq

# ───── Wait for services ─────

section "Waiting for coordinator to be healthy"
for i in $(seq 1 30); do
  STATUS=$(curl -sf "${COORD}/health" 2>/dev/null | jq -r '.status' 2>/dev/null || true)
  if [ "$STATUS" = "ok" ]; then
    pass "Coordinator healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "Coordinator not healthy after 30 seconds"
    echo "Aborting."
    exit 1
  fi
  sleep 1
done

# ───── Auth ─────

section "Authentication"
LOGIN_RESP=$(curl -sf -X POST "${COORD}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"analyst","password":"analyst123"}')

JWT=$(echo "$LOGIN_RESP" | jq -r '.token')
if [ -n "$JWT" ] && [ "$JWT" != "null" ]; then
  pass "Login successful — got JWT"
else
  fail "Login failed: $LOGIN_RESP"
  echo "Aborting — cannot proceed without JWT."
  exit 1
fi

AUTH="Authorization: Bearer ${JWT}"

# ───── Register 3 orgs ─────

section "Registering organizations"

register_org() {
  local name="$1"
  local url="$2"
  local resp
  resp=$(curl -sf -X POST "${COORD}/orgs/register" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d "{\"name\":\"${name}\",\"endpointUrl\":\"${url}\"}" 2>/dev/null || echo '{}')

  local org_id
  org_id=$(echo "$resp" | jq -r '.orgId' 2>/dev/null)
  if [ -n "$org_id" ] && [ "$org_id" != "null" ]; then
    pass "Registered ${name} → ${org_id}"
    echo "$org_id"
  else
    # Might already be registered (unique constraint)
    pass "Org ${name} already registered (or registration returned: ${resp})"
    echo ""
  fi
}

ORG1_ID=$(register_org "hospital-alpha" "http://org-node-1:5001")
ORG2_ID=$(register_org "hospital-beta"  "http://org-node-2:5002")
ORG3_ID=$(register_org "hospital-gamma" "http://org-node-3:5003")

# ───── Test 1: COUNT query ─────

section "Test 1 — COUNT query (scalar)"

RESP=$(curl -sf -X POST "${COORD}/query" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"aggregate":"COUNT","column":"amount","epsilon":1.0}' 2>/dev/null || echo '{}')

STATUS=$(echo "$RESP" | jq -r '.status' 2>/dev/null)
QUERY_ID=$(echo "$RESP" | jq -r '.queryId' 2>/dev/null)
RESULT_TYPE=$(echo "$RESP" | jq -r '.result.type' 2>/dev/null)
RESULT_VALUE=$(echo "$RESP" | jq -r '.result.value' 2>/dev/null)

if [ "$STATUS" = "done" ]; then
  pass "Query completed (status=done)"
else
  fail "Expected status=done, got: ${STATUS}"
  echo "  Response: $RESP"
fi

if [ "$RESULT_TYPE" = "scalar" ]; then
  pass "Result type is scalar"
else
  fail "Expected result type=scalar, got: ${RESULT_TYPE}"
fi

if [ -n "$RESULT_VALUE" ] && [ "$RESULT_VALUE" != "null" ]; then
  pass "Result value: ${RESULT_VALUE}"
else
  fail "No result value returned"
fi

# ───── Test 2: SUM GROUP BY query ─────

section "Test 2 — SUM GROUP BY category (grouped)"

RESP=$(curl -sf -X POST "${COORD}/query" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"aggregate":"SUM","column":"amount","grouping":"category","epsilon":1.0}' 2>/dev/null || echo '{}')

STATUS=$(echo "$RESP" | jq -r '.status' 2>/dev/null)
QUERY_ID2=$(echo "$RESP" | jq -r '.queryId' 2>/dev/null)
RESULT_TYPE=$(echo "$RESP" | jq -r '.result.type' 2>/dev/null)
GROUP_COUNT=$(echo "$RESP" | jq -r '.result.groups | length' 2>/dev/null)

if [ "$STATUS" = "done" ]; then
  pass "Query completed (status=done)"
else
  fail "Expected status=done, got: ${STATUS}"
  echo "  Response: $RESP"
fi

if [ "$RESULT_TYPE" = "grouped" ]; then
  pass "Result type is grouped"
else
  fail "Expected result type=grouped, got: ${RESULT_TYPE}"
fi

if [ -n "$GROUP_COUNT" ] && [ "$GROUP_COUNT" != "null" ] && [ "$GROUP_COUNT" -gt 0 ] 2>/dev/null; then
  pass "Got ${GROUP_COUNT} groups"
  echo "$RESP" | jq -r '.result.groups[] | "    \(.groupKey): \(.value)"' 2>/dev/null
else
  fail "No groups returned"
fi

# ───── Test 3: AVG query ─────

section "Test 3 — AVG query (scalar result from avg)"

RESP=$(curl -sf -X POST "${COORD}/query" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"aggregate":"AVG","column":"amount","epsilon":1.0}' 2>/dev/null || echo '{}')

STATUS=$(echo "$RESP" | jq -r '.status' 2>/dev/null)
RESULT_TYPE=$(echo "$RESP" | jq -r '.result.type' 2>/dev/null)
RESULT_VALUE=$(echo "$RESP" | jq -r '.result.value' 2>/dev/null)

if [ "$STATUS" = "done" ]; then
  pass "AVG query completed (status=done)"
else
  fail "Expected status=done, got: ${STATUS}"
fi

if [ "$RESULT_TYPE" = "scalar" ]; then
  pass "AVG aggregated to scalar: ${RESULT_VALUE}"
else
  fail "Expected result type=scalar, got: ${RESULT_TYPE}"
fi

# ───── Test 4: Historical lookup ─────

section "Test 4 — Historical result lookup (GET /results/:queryId)"

if [ -n "$QUERY_ID" ] && [ "$QUERY_ID" != "null" ]; then
  HIST_RESP=$(curl -sf "${COORD}/results/${QUERY_ID}" \
    -H "$AUTH" 2>/dev/null || echo '{}')

  HIST_STATUS=$(echo "$HIST_RESP" | jq -r '.status' 2>/dev/null)
  if [ "$HIST_STATUS" = "done" ]; then
    pass "Historical lookup returns status=done"
  else
    fail "Historical lookup status: ${HIST_STATUS}"
  fi
else
  fail "No queryId from Test 1 to look up"
fi

# ───── Test 5: Results list ─────

section "Test 5 — Results list (GET /results)"

LIST_RESP=$(curl -sf "${COORD}/results" \
  -H "$AUTH" 2>/dev/null || echo '{}')

LIST_COUNT=$(echo "$LIST_RESP" | jq -r '.results | length' 2>/dev/null)

if [ -n "$LIST_COUNT" ] && [ "$LIST_COUNT" != "null" ] && [ "$LIST_COUNT" -ge 3 ] 2>/dev/null; then
  pass "Results list has ${LIST_COUNT} entries (≥ 3 from our tests)"
else
  fail "Expected ≥ 3 results, got: ${LIST_COUNT}"
fi

# ───── Test 6: Audit log ─────

section "Test 6 — Audit trail (GET /audit/:queryId)"

if [ -n "$QUERY_ID2" ] && [ "$QUERY_ID2" != "null" ]; then
  AUDIT_RESP=$(curl -sf "${COORD}/audit/${QUERY_ID2}" \
    -H "$AUTH" 2>/dev/null || echo '{}')

  EVENT_COUNT=$(echo "$AUDIT_RESP" | jq -r '.events | length' 2>/dev/null)
  EVENT_TYPES=$(echo "$AUDIT_RESP" | jq -r '[.events[].event_type] | unique | join(", ")' 2>/dev/null)

  if [ -n "$EVENT_COUNT" ] && [ "$EVENT_COUNT" -gt 0 ] 2>/dev/null; then
    pass "Audit trail has ${EVENT_COUNT} events"
    echo "    Event types: ${EVENT_TYPES}"
  else
    fail "No audit events for query ${QUERY_ID2}"
  fi

  # Check for key orchestration events
  if echo "$EVENT_TYPES" | grep -q "COMMITTED"; then
    pass "Found COMMITTED events in audit"
  else
    fail "Missing COMMITTED events in audit"
  fi

  if echo "$EVENT_TYPES" | grep -q "REVEALED_VERIFIED"; then
    pass "Found REVEALED_VERIFIED events in audit"
  else
    fail "Missing REVEALED_VERIFIED events in audit"
  fi

  if echo "$EVENT_TYPES" | grep -q "QUERY_DONE"; then
    pass "Found QUERY_DONE event in audit"
  else
    fail "Missing QUERY_DONE event in audit"
  fi
else
  fail "No queryId from Test 2 to check audit"
fi

# ───── Test 7: Orgs list ─────

section "Test 7 — Organizations list (GET /orgs)"

ORGS_RESP=$(curl -sf "${COORD}/orgs" \
  -H "$AUTH" 2>/dev/null || echo '{}')

ORG_COUNT=$(echo "$ORGS_RESP" | jq -r '.orgs | length' 2>/dev/null)

if [ -n "$ORG_COUNT" ] && [ "$ORG_COUNT" -ge 3 ] 2>/dev/null; then
  pass "Found ${ORG_COUNT} registered orgs (≥ 3)"
else
  fail "Expected ≥ 3 orgs, got: ${ORG_COUNT}"
fi

# ───── Summary ─────

echo ""
echo "════════════════════════════════════"
TOTAL=$((PASS + FAIL))
echo "  Results: ${PASS}/${TOTAL} passed"
if [ "$FAIL" -eq 0 ]; then
  echo "  🎉 ALL TESTS PASSED"
else
  echo "  ⚠️  ${FAIL} test(s) failed"
fi
echo "════════════════════════════════════"

exit "$FAIL"

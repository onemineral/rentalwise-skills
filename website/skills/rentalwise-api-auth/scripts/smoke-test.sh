#!/usr/bin/env bash
# Verifies RentalWise credentials: counts the enabled, website-visible properties the token can see.
#
#   RENTALWISE_BASE_URL=https://app.rentalwise.io/rest/ RENTALWISE_API_TOKEN=... ./smoke-test.sh
set -euo pipefail

: "${RENTALWISE_BASE_URL:?set RENTALWISE_BASE_URL (ends with /rest/)}"
: "${RENTALWISE_API_TOKEN:?set RENTALWISE_API_TOKEN}"

base="${RENTALWISE_BASE_URL%/}/"

call() {
  local path="$1" body="$2"
  curl -sS -o /tmp/rw-smoke-body.json -w '%{http_code}' -X POST "${base}${path}" \
    -H "Authorization: Bearer ${RENTALWISE_API_TOKEN}" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "$body"
}

status=$(call 'property/query' '{"paginate":{"page":1,"perpage":1},"where":{"conditions":[{"field":"status","in":["enabled"]},{"field":"website_visible","eq":true}]},"no_auto_relations":true}')
case "$status" in
  200)
    total=$(python3 -c 'import json,sys; print(json.load(open("/tmp/rw-smoke-body.json")).get("total","?"))' 2>/dev/null || echo '?')
    echo "OK  property/query reachable, enabled website-visible properties for this token: ${total}"
    ;;
  401) echo "FAIL 401 Unauthenticated: token or base URL is wrong"; exit 1 ;;
  *)   echo "FAIL HTTP ${status} from property/query:"; cat /tmp/rw-smoke-body.json; echo; exit 1 ;;
esac


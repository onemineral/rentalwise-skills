#!/usr/bin/env bash
# Verifies RentalWise credentials and the API key's role:
#   1. the token reaches property/query (401 = wrong token or base URL)
#   2. the key's role can read the two fields a public site filters on, `status` and
#      `website_visible`. Fields are guarded by the role: a field it may not use is absent from
#      records, dropped from property/search arguments and refused in `where`
#      (rentalwise-api-auth SKILL.md section 4)
#   3. how many enabled, website-visible properties the token can see
#
#   RENTALWISE_BASE_URL=https://app.rentalwise.io/rest/ RENTALWISE_API_TOKEN=... ./smoke-test.sh
set -euo pipefail

: "${RENTALWISE_BASE_URL:?set RENTALWISE_BASE_URL (ends with /rest/)}"
: "${RENTALWISE_API_TOKEN:?set RENTALWISE_API_TOKEN}"

base="${RENTALWISE_BASE_URL%/}/"
body=$(mktemp)
trap 'rm -f "$body"' EXIT

call() {
  local path="$1" payload="$2"
  curl -sS -o "$body" -w '%{http_code}' -X POST "${base}${path}" \
    -H "Authorization: Bearer ${RENTALWISE_API_TOKEN}" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "$payload"
}

# Runs a python expression against the last response body (bound to `d`).
json() {
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); $1" "$body" 2>/dev/null
}

# 1. Reachability: one property, no filters.
status=$(call 'property/query' '{"paginate":{"page":1,"perpage":1},"no_auto_relations":true}')
case "$status" in
  200) echo "OK   property/query reachable" ;;
  401) echo "FAIL 401 Unauthenticated: token or base URL is wrong"; exit 1 ;;
  *)   echo "FAIL HTTP ${status} from property/query:"; cat "$body"; echo; exit 1 ;;
esac

# 2. Does the role read the guard fields? Absent keys mean the role lacks them.
total_all=$(json 'print(d.get("total", "?"))' || echo '?')
if [ "$total_all" = "0" ]; then
  echo "WARN the token sees no properties at all, so the role's fields cannot be inspected;"
  echo "     ask the customer to enable a property, then rerun"
else
  missing=$(json 'r=(d.get("data") or [{}])[0]; print(" ".join(f for f in ("status","website_visible") if f not in r))' || echo 'status website_visible')
  if [ -n "$missing" ]; then
    echo "FAIL the key's role cannot read: ${missing}"
    echo "     property/search drops a website_visible argument the role may not use and returns"
    echo "     hidden properties; a where condition on the field answers 422; records omit it."
    echo "     Ask the customer to grant the key's role 'View Property Configuration' (website_visible)"
    echo "     and 'View Properties' (status), or to issue a key with such a role, then rerun."
    echo "     (A key issued for a RentalWise-hosted website, role cloud-website, does not expose the"
    echo "     field but is scoped to visible properties by the API itself; confirm with the customer.)"
    exit 1
  fi
  echo "OK   role reads status and website_visible"
fi

# 3. Enabled, website-visible count.
status=$(call 'property/query' '{"paginate":{"page":1,"perpage":1},"where":{"conditions":[{"field":"status","in":["enabled"]},{"field":"website_visible","eq":true}]},"no_auto_relations":true}')
case "$status" in
  200)
    total=$(json 'print(d.get("total", "?"))' || echo '?')
    echo "OK   enabled website-visible properties for this token: ${total}"
    ;;
  422)
    echo "FAIL 422 filtering on status / website_visible: the role may not use one of them"
    cat "$body"; echo; exit 1
    ;;
  *)   echo "FAIL HTTP ${status} from property/query:"; cat "$body"; echo; exit 1 ;;
esac

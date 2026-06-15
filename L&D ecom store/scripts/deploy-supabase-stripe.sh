#!/usr/bin/env bash
# Deploy Stripe Edge Functions to Supabase (create-checkout-session + stripe-webhook).
#
# Prerequisites:
#   - Supabase CLI: brew install supabase/tap/supabase
#   - Logged in: supabase login
#   - Project linked once: supabase link --project-ref liwswmcofxlvlyokkazm
#
# Usage:
#   STRIPE_SECRET_KEY=sk_test_... SITE_URL=https://ld-empire.ca ./scripts/deploy-supabase-stripe.sh
#   # Optional after Stripe webhook is created:
#   STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_SECRET_KEY=sk_... ./scripts/deploy-supabase-stripe.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="${SUPABASE_PROJECT_REF:-liwswmcofxlvlyokkazm}"
SITE_URL="${SITE_URL:-https://ld-empire.ca}"
SITE_URL="${SITE_URL%/}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ Supabase CLI not found."
  echo "   Install: brew install supabase/tap/supabase"
  echo "   Docs:    https://supabase.com/docs/guides/cli"
  exit 1
fi

echo "→ Project ref: $PROJECT_REF"
echo "→ SITE_URL:    $SITE_URL"

if [ ! -f "$ROOT/supabase/.temp/project-ref" ] && [ ! -f "$ROOT/.supabase/project-ref" ]; then
  echo "→ Linking project (first time)…"
  supabase link --project-ref "$PROJECT_REF"
fi

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo ""
  echo "❌ STRIPE_SECRET_KEY is required."
  echo "   Get it from: https://dashboard.stripe.com/apikeys"
  echo ""
  echo "   Example:"
  echo "   STRIPE_SECRET_KEY=sk_test_... SITE_URL=$SITE_URL ./scripts/deploy-supabase-stripe.sh"
  exit 1
fi

echo "→ Setting Supabase secrets…"
SECRET_ARGS=(STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" SITE_URL="$SITE_URL")
if [ -n "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  SECRET_ARGS+=(STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET")
  echo "   (including STRIPE_WEBHOOK_SECRET)"
else
  echo "   ⚠ STRIPE_WEBHOOK_SECRET not set — checkout will work; order status webhook won't until you add it."
fi
supabase secrets set "${SECRET_ARGS[@]}"

if [ "${SKIP_DB_PUSH:-}" != "1" ]; then
  echo "→ Applying database migrations (supabase db push)…"
  if supabase db push --project-ref "$PROJECT_REF"; then
    echo "   Migrations applied."
  else
    echo "   ⚠ db push failed — run manually: supabase db push"
    echo "     Checkout needs orders table (migration 003+)."
  fi
fi

echo "→ Deploying create-checkout-session…"
supabase functions deploy create-checkout-session --project-ref "$PROJECT_REF"

echo "→ Deploying stripe-webhook…"
supabase functions deploy stripe-webhook --project-ref "$PROJECT_REF"

BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
echo ""
echo "✓ Deploy complete."
echo ""
echo "Verify (should NOT return NOT_FOUND):"
echo "  curl -s -X POST $BASE/create-checkout-session -H 'Content-Type: application/json' -d '{}'"
echo ""
echo "Stripe webhook endpoint (add in Stripe Dashboard → Webhooks):"
echo "  $BASE/stripe-webhook"
echo "  Event: checkout.session.completed"
echo "  Then: STRIPE_WEBHOOK_SECRET=whsec_... supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_..."
echo ""
echo "Test checkout: $SITE_URL/index/index.html → panier → payer avec Stripe"

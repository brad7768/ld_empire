import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import Stripe from "npm:stripe@14.25.0";
import { PRODUCT_CATALOG, type CatalogEntry } from "../_shared/catalog.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CartBody = {
  cart: Array<{
    productId?: string;
    variantId?: string;
    quantity: number;
    size?: string;
    color?: string | Record<string, string>;
  }>;
  shippingDraft: {
    email: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  shippingMethod: string;
  locale?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeSkuPart(s: string, maxLen: number): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9\-_.]/g, "")
    .slice(0, maxLen);
}

function computeSku(meta: CatalogEntry, sizeRaw: string, colorRaw: string): string {
  const slug = sanitizeSkuPart(meta.slug, 80);
  const size = sanitizeSkuPart(sizeRaw || "NONE", 32);
  const color = sanitizeSkuPart(colorRaw || "STD", 40);
  const raw = `LOCAL-${slug}-${size}-${color}`.slice(0, 120);
  return raw.length ? raw : `LOCAL-${slug}`;
}

/** Same logic as index/index.html checkoutTotalsCents (tax on CAD subtotal dollars). */
function computeTotalsValidated(
  lines: Array<{ entry: CatalogEntry; productId: string; qty: number; sizeLabel: string; colorLabel: string }>,
  shippingMethod: string
) {
  const subtotalCents = lines.reduce((sum, L) => sum + L.entry.priceCents * L.qty, 0);
  const subtotalCAD = subtotalCents / 100;
  const shippingCents = shippingMethod === "express" ? 2500 : 0;
  const taxCAD = Math.round(subtotalCAD * 0.0825 * 100) / 100;
  const taxCents = Math.round(taxCAD * 100);
  const totalCents = subtotalCents + shippingCents + taxCents;
  return { subtotalCAD, subtotalCents, shippingCents, taxCents, totalCents, taxCAD };
}

function stripeLineItems(
  lines: Array<{ entry: CatalogEntry; productId: string; qty: number; sizeLabel: string; colorLabel: string }>,
  shippingCents: number,
  taxCents: number,
  locale: string
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const useFr = locale === "fr";
  const stripeItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const L of lines) {
    const name = useFr ? L.entry.nameFr : L.entry.nameEn;
    const desc = `${sanitizeSkuPart(L.sizeLabel, 32)} · ${sanitizeSkuPart(L.colorLabel, 48)}`;
    stripeItems.push({
      quantity: L.qty,
      price_data: {
        currency: "cad",
        unit_amount: L.entry.priceCents,
        product_data: {
          name: `${name} (${L.productId})`,
          description: desc.slice(0, 500),
        },
      },
    });
  }

  if (shippingCents > 0) {
    stripeItems.push({
      quantity: 1,
      price_data: {
        currency: "cad",
        unit_amount: shippingCents,
        product_data: {
          name: useFr ? "Livraison express" : "Express shipping",
        },
      },
    });
  }

  if (taxCents > 0) {
    stripeItems.push({
      quantity: 1,
      price_data: {
        currency: "cad",
        unit_amount: taxCents,
        product_data: {
          name: useFr ? "Taxes estimées (8,25 %)" : "Estimated tax (8.25%)",
        },
      },
    });
  }

  return stripeItems;
}

function computeTotalsValidatedDb(
  lines: Array<{ priceCents: number; qty: number }>,
  shippingMethod: string
) {
  const subtotalCents = lines.reduce((sum, L) => sum + L.priceCents * L.qty, 0);
  const subtotalCAD = subtotalCents / 100;
  const shippingCents = shippingMethod === "express" ? 2500 : 0;
  const taxCAD = Math.round(subtotalCAD * 0.0825 * 100) / 100;
  const taxCents = Math.round(taxCAD * 100);
  const totalCents = subtotalCents + shippingCents + taxCents;
  return { subtotalCAD, subtotalCents, shippingCents, taxCents, totalCents, taxCAD };
}

function stripeLineItemsDb(
  lines: Array<{
    productId: string;
    qty: number;
    sizeLabel: string;
    colorLabel: string;
    priceCents: number;
    productNameFr: string;
    productNameEn: string;
  }>,
  shippingCents: number,
  taxCents: number,
  locale: string
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const useFr = locale === "fr";
  const stripeItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const L of lines) {
    const name = useFr ? L.productNameFr : L.productNameEn;
    const desc = `${sanitizeSkuPart(L.sizeLabel, 32)} · ${sanitizeSkuPart(L.colorLabel, 48)}`;
    stripeItems.push({
      quantity: L.qty,
      price_data: {
        currency: "cad",
        unit_amount: L.priceCents,
        product_data: {
          name: `${name} (${L.productId})`,
          description: desc.slice(0, 500),
        },
      },
    });
  }

  if (shippingCents > 0) {
    stripeItems.push({
      quantity: 1,
      price_data: {
        currency: "cad",
        unit_amount: shippingCents,
        product_data: {
          name: useFr ? "Livraison express" : "Express shipping",
        },
      },
    });
  }

  if (taxCents > 0) {
    stripeItems.push({
      quantity: 1,
      price_data: {
        currency: "cad",
        unit_amount: taxCents,
        product_data: {
          name: useFr ? "Taxes estimées (8,25 %)" : "Estimated tax (8.25%)",
        },
      },
    });
  }

  return stripeItems;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");

  if (!stripeKey) {
    return jsonResponse({ error: "Stripe is not configured (STRIPE_SECRET_KEY)." }, 500);
  }
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Supabase service configuration missing." }, 500);
  }
  if (!siteUrl) {
    return jsonResponse({ error: "SITE_URL secret missing (your public Netlify URL, no trailing slash)." }, 500);
  }

  let body: CartBody;
  try {
    body = (await req.json()) as CartBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const draft = body.shippingDraft;
  const email = (draft?.email || "").trim();
  const cart = Array.isArray(body.cart) ? body.cart : [];
  const shippingMethod = body.shippingMethod === "express" ? "express" : "standard";
  const locale = body.locale === "en" ? "en" : "fr";

  if (!email.includes("@")) {
    return jsonResponse({ error: "Valid email required" }, 400);
  }
  if (cart.length === 0 || cart.length > 50) {
    return jsonResponse({ error: "Cart must contain 1–50 items." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  type ValidatedLine = {
    entry?: CatalogEntry;
    productId: string;
    variantId: string | null;
    qty: number;
    sizeLabel: string;
    colorLabel: string;
    priceCents: number;
    productNameFr: string;
    productNameEn: string;
    sku: string;
  };

  const validated: ValidatedLine[] = [];

  for (const row of cart) {
    const qty = Number(row.quantity);
    if (!(qty > 0) || qty > 999 || !Number.isInteger(qty)) {
      return jsonResponse({ error: "Invalid quantity in cart." }, 400);
    }

    const colorKey = typeof row.color === "object" && row.color != null && !Array.isArray(row.color)
      ? String(row.color.fr || row.color.en || "")
      : String(row.color || "");
    const sizeLabel = String(row.size ?? "");

    if (row.variantId) {
      const { data: variant, error: vErr } = await supabase
        .from("product_variants")
        .select(`
          id, sku, size, color, price_cents, active,
          products ( id, slug, name, active ),
          inventory ( on_hand )
        `)
        .eq("id", row.variantId)
        .maybeSingle();

      const productRow = variant?.products as { id: string; slug: string; name: string; active: boolean } | null;

      if (vErr || !variant || !variant.active || !productRow?.active) {
        return jsonResponse({ error: `Variant unavailable (${row.variantId}).` }, 400);
      }

      const onHand = Array.isArray(variant.inventory)
        ? (variant.inventory[0]?.on_hand ?? 0)
        : (variant.inventory as { on_hand?: number } | null)?.on_hand ?? 0;

      if (onHand < qty) {
        return jsonResponse({ error: `Insufficient stock for ${variant.sku}.` }, 400);
      }

      const slug = productRow.slug;
      validated.push({
        productId: slug,
        variantId: variant.id,
        qty,
        sizeLabel: variant.size || sizeLabel || "Unique",
        colorLabel: variant.color || colorKey || "Standard",
        priceCents: variant.price_cents,
        productNameFr: productRow.name,
        productNameEn: productRow.name,
        sku: variant.sku,
      });
      continue;
    }

    const pid = typeof row.productId === "string" ? row.productId.trim() : "";
    const entry = pid ? PRODUCT_CATALOG[pid] : undefined;

    if (!entry) {
      return jsonResponse({ error: `Unknown product (${pid || "?"}) — variantId required.` }, 400);
    }

    validated.push({
      entry,
      productId: pid,
      variantId: null,
      qty,
      sizeLabel,
      colorLabel: colorKey,
      priceCents: entry.priceCents,
      productNameFr: entry.nameFr,
      productNameEn: entry.nameEn,
      sku: computeSku(entry, sizeLabel, colorKey),
    });
  }

  const totals = computeTotalsValidatedDb(validated, shippingMethod);
  const lineItems = stripeLineItemsDb(validated, totals.shippingCents, totals.taxCents, locale);

  const orderNumber = `LD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${
    crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
  }`;

  const notesPayload = JSON.stringify({
    shipping: draft,
    shipping_method: shippingMethod,
    locale,
    stripe_setup: true,
  });

  const { data: orderRow, error: orderErr } = await supabase.from("orders").insert({
    order_number: orderNumber,
    email,
    status: "pending",
    subtotal_cents: totals.subtotalCents,
    shipping_cents: totals.shippingCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    currency: "CAD",
    shipping_method: shippingMethod,
    notes: notesPayload,
  }).select("id").single();

  if (orderErr || !orderRow?.id) {
    console.error("[checkout] orders insert:", orderErr);
    return jsonResponse({ error: "Could not create order record." }, 500);
  }

  const linesIns = validated.map((L) => {
    const pname = locale === "fr" ? L.productNameFr : L.productNameEn;
    const lineTotal = L.priceCents * L.qty;
    return {
      order_id: orderRow.id,
      variant_id: L.variantId,
      product_name: pname,
      sku: L.sku,
      qty: L.qty,
      unit_price_cents: L.priceCents,
      line_total_cents: lineTotal,
    };
  });

  const { error: linesErr } = await supabase.from("order_items").insert(linesIns);
  if (linesErr) {
    console.error("[checkout] order_items insert:", linesErr);
    return jsonResponse({ error: "Could not save order lines." }, 500);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const successPath = `/success/index.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelPath = `/index/index.html?checkout=cancel`;

  /** Pays autorisés pour la collecte d'adresse Stripe Checkout (codes ISO 3166-1 alpha-2). */
  const shippingAllowedCountries: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
    ["CA", "FR"];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: lineItems,
      success_url: `${siteUrl}${successPath}`,
      cancel_url: `${siteUrl}${cancelPath}`,
      shipping_address_collection: {
        allowed_countries: shippingAllowedCountries,
      },
      phone_number_collection: { enabled: true },
      metadata: {
        order_id: orderRow.id,
        order_number: orderNumber,
        shipping_method: shippingMethod,
      },
      payment_intent_data: {
        metadata: {
          order_id: orderRow.id,
          order_number: orderNumber,
        },
      },
    });

    if (!session.url) {
      return jsonResponse({ error: "Stripe did not return a checkout URL." }, 500);
    }

    return jsonResponse({ url: session.url, orderNumber });
  } catch (e: unknown) {
    console.error("[checkout] Stripe session:", e);
    const msg = e instanceof Error ? e.message : "Stripe error";
    return jsonResponse({ error: msg }, 500);
  }
});

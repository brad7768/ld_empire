import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import Stripe from "npm:stripe@14.25.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CartBody = {
  cart: Array<{
    productId?: string; // expected slug
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

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  name_en?: string | null;
  active: boolean;
};

type InventoryRow = { on_hand?: number | null };

type VariantRow = {
  id: string;
  product_id?: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  price_cents: number;
  active: boolean;
  products?: ProductRow | ProductRow[] | null;
  inventory?: InventoryRow | InventoryRow[] | null;
};

type ProductWithVariants = ProductRow & {
  product_variants?: VariantRow[];
};

type ValidatedLine = {
  productId: string; // slug
  variantId: string;
  qty: number;
  sizeLabel: string;
  colorLabel: string;
  priceCents: number;
  productNameFr: string;
  productNameEn: string;
  sku: string;
};

function isValidPriceCents(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

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

function safeOnHand(inv: InventoryRow | InventoryRow[] | null | undefined): number {
  if (Array.isArray(inv)) return Number(inv[0]?.on_hand ?? 0);
  if (inv && typeof inv === "object") return Number(inv.on_hand ?? 0);
  return 0;
}

function toProductRow(product: ProductRow | ProductRow[] | null | undefined): ProductRow | null {
  if (Array.isArray(product)) return (product[0] as ProductRow | undefined) || null;
  return (product as ProductRow | null) || null;
}

function fallbackSku(slug: string, sizeRaw: string, colorRaw: string): string {
  const sSlug = sanitizeSkuPart(slug || "unknown", 80);
  const sSize = sanitizeSkuPart(sizeRaw || "NONE", 32);
  const sColor = sanitizeSkuPart(colorRaw || "STD", 40);
  return `DB-${sSlug}-${sSize}-${sColor}`.slice(0, 120);
}

/** Same pricing math as storefront checkoutTotalsCents. */
function computeTotalsValidated(lines: Array<{ priceCents: number; qty: number }>, shippingMethod: string) {
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
  const subtotalCAD = subtotalCents / 100;
  const shippingCents = shippingMethod === "express" ? 2500 : 0;
  const taxCAD = Math.round(subtotalCAD * 0.0825 * 100) / 100;
  const taxCents = Math.round(taxCAD * 100);
  const totalCents = subtotalCents + shippingCents + taxCents;
  return { subtotalCAD, subtotalCents, shippingCents, taxCents, totalCents, taxCAD };
}

function stripeLineItems(
  lines: ValidatedLine[],
  shippingCents: number,
  taxCents: number,
  locale: string,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const useFr = locale === "fr";
  const stripeItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const line of lines) {
    const name = useFr ? line.productNameFr : line.productNameEn;
    const desc = `${sanitizeSkuPart(line.sizeLabel, 32)} · ${sanitizeSkuPart(line.colorLabel, 48)}`;
    stripeItems.push({
      quantity: line.qty,
      price_data: {
        currency: "cad",
        unit_amount: line.priceCents,
        product_data: {
          name: `${name} (${line.productId})`,
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

async function fetchVariantById(supabase: ReturnType<typeof createClient>, variantId: string) {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, sku, size, color, price_cents, active")
    .eq("id", variantId)
    .maybeSingle();

  return { data: data as VariantRow | null, error };
}

async function fetchProductBySlug(supabase: ReturnType<typeof createClient>, slug: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, name_en, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  return { data: data as ProductRow | null, error };
}

async function fetchInventoryByVariantIds(supabase: ReturnType<typeof createClient>, variantIds: string[]) {
  if (!variantIds.length) return { data: [] as Array<{ variant_id: string; on_hand: number }>, error: null };
  const { data, error } = await supabase
    .from("inventory")
    .select("variant_id, on_hand")
    .in("variant_id", variantIds);
  return { data: (data || []) as Array<{ variant_id: string; on_hand: number }>, error };
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

  if (!stripeKey) return jsonResponse({ error: "Stripe is not configured (STRIPE_SECRET_KEY)." }, 500);
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Supabase service configuration missing." }, 500);
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

  if (!email.includes("@")) return jsonResponse({ error: "Valid email required" }, 400);
  if (cart.length === 0 || cart.length > 50) return jsonResponse({ error: "Cart must contain 1–50 items." }, 400);

  const supabase = createClient(supabaseUrl, serviceKey);
  const validated: ValidatedLine[] = [];

  for (const row of cart) {
    const qty = Number(row.quantity);
    if (!(qty > 0) || qty > 999 || !Number.isInteger(qty)) {
      return jsonResponse({ error: "Invalid quantity in cart." }, 400);
    }

    const requestedColor = typeof row.color === "object" && row.color != null && !Array.isArray(row.color)
      ? String(row.color.fr || row.color.en || "")
      : String(row.color || "");
    const requestedSize = String(row.size ?? "");

    if (row.variantId) {
      const { data: variant, error: variantErr } = await fetchVariantById(supabase, row.variantId);
      if (variantErr) {
        console.error("[checkout] variant lookup:", variantErr);
        return jsonResponse({ error: "Variant lookup failed." }, 400);
      }
      const { data: productRow, error: productErr } = await supabase
        .from("products")
        .select("id, slug, name, name_en, active")
        .eq("id", variant?.product_id || "")
        .maybeSingle();
      if (productErr) {
        console.error("[checkout] product lookup by variant:", productErr);
        return jsonResponse({ error: "Product lookup failed." }, 400);
      }
      const { data: invRows, error: invErr } = await fetchInventoryByVariantIds(
        supabase,
        variant?.id ? [variant.id] : [],
      );
      if (invErr) {
        console.error("[checkout] inventory lookup:", invErr);
        return jsonResponse({ error: "Inventory lookup failed." }, 400);
      }
      const onHand = Number(invRows?.[0]?.on_hand ?? 0);
      if (!variant || !variant.active || !productRow?.active) {
        return jsonResponse({ error: `Variant unavailable (${row.variantId}).` }, 400);
      }
      if (!isValidPriceCents(variant.price_cents)) {
        return jsonResponse({ error: `Variant price is invalid (${row.variantId}).` }, 400);
      }
      if (onHand < qty) {
        return jsonResponse({ error: `Insufficient stock for ${variant.sku || variant.id}.` }, 400);
      }

      validated.push({
        productId: productRow.slug,
        variantId: variant.id,
        qty,
        sizeLabel: variant.size || requestedSize || "Unique",
        colorLabel: variant.color || requestedColor || "Standard",
        priceCents: variant.price_cents,
        productNameFr: productRow.name,
        productNameEn: productRow.name_en || productRow.name,
        sku: variant.sku || fallbackSku(productRow.slug, variant.size || requestedSize, variant.color || requestedColor),
      });
      continue;
    }

    const slug = typeof row.productId === "string" ? row.productId.trim() : "";
    if (!slug) return jsonResponse({ error: "Missing product identifier." }, 400);

    const { data: product, error: productErr } = await fetchProductBySlug(supabase, slug);
    if (productErr) {
      console.error("[checkout] product lookup:", productErr);
      return jsonResponse({ error: "Product lookup failed." }, 400);
    }
    if (!product?.active) return jsonResponse({ error: `Unknown product (${slug}).` }, 400);

    const { data: variantsData, error: variantsErr } = await supabase
      .from("product_variants")
      .select("id, sku, size, color, price_cents, active")
      .eq("product_id", product.id)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (variantsErr) {
      console.error("[checkout] variants lookup:", variantsErr);
      return jsonResponse({ error: "Variant lookup failed." }, 400);
    }
    const variants = (variantsData || []) as VariantRow[];
    const { data: invRows, error: invErr } = await fetchInventoryByVariantIds(
      supabase,
      variants.map((v) => v.id),
    );
    if (invErr) {
      console.error("[checkout] inventory lookup:", invErr);
      return jsonResponse({ error: "Inventory lookup failed." }, 400);
    }
    const onHandByVariant = new Map((invRows || []).map((r) => [r.variant_id, Number(r.on_hand || 0)]));
    const preferredSize = requestedSize || "Unique";
    const preferredColor = requestedColor || "Standard";
    const variant =
      variants.find((v) => v.size === preferredSize && v.color === preferredColor) ||
      variants.find((v) => v.size === preferredSize) ||
      variants[0];

    if (!variant) return jsonResponse({ error: `No active variant for ${slug}.` }, 400);
    if (!isValidPriceCents(variant.price_cents)) {
      return jsonResponse({ error: `Variant price is invalid for ${slug}.` }, 400);
    }

    const onHand = Number(onHandByVariant.get(variant.id) ?? 0);
    if (onHand < qty) {
      return jsonResponse({ error: `Insufficient stock for ${variant.sku || variant.id}.` }, 400);
    }

    validated.push({
      productId: product.slug,
      variantId: variant.id,
      qty,
      sizeLabel: variant.size || preferredSize,
      colorLabel: variant.color || preferredColor,
      priceCents: variant.price_cents,
      productNameFr: product.name,
      productNameEn: product.name_en || product.name,
      sku: variant.sku || fallbackSku(product.slug, variant.size || preferredSize, variant.color || preferredColor),
    });
  }

  const totals = computeTotalsValidated(validated, shippingMethod);
  const lineItems = stripeLineItems(validated, totals.shippingCents, totals.taxCents, locale);

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
    notes: notesPayload,
  }).select("id").single();

  if (orderErr || !orderRow?.id) {
    console.error("[checkout] orders insert:", orderErr);
    const code = (orderErr as { code?: string })?.code;
    const msg = (orderErr as { message?: string })?.message || "";
    if (code === "42P01" || msg.includes("does not exist")) {
      return jsonResponse({
        error: "Orders table missing. Run: supabase db push (migrations in supabase/migrations/).",
      }, 500);
    }
    return jsonResponse({ error: "Could not create order record." }, 500);
  }

  const linesIns = validated.map((line) => {
    const pname = locale === "fr" ? line.productNameFr : line.productNameEn;
    return {
      order_id: orderRow.id,
      variant_id: line.variantId,
      product_name: pname,
      sku: line.sku,
      qty: line.qty,
      unit_price_cents: line.priceCents,
      line_total_cents: line.priceCents * line.qty,
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

  const successPath = "/success/index.html?session_id={CHECKOUT_SESSION_ID}";
  const cancelPath = "/index/index.html?checkout=cancel";
  const shippingAllowedCountries: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
    ["CA", "FR"];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: lineItems,
      success_url: `${siteUrl}${successPath}`,
      cancel_url: `${siteUrl}${cancelPath}`,
      shipping_address_collection: { allowed_countries: shippingAllowedCountries },
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

    if (!session.url) return jsonResponse({ error: "Stripe did not return a checkout URL." }, 500);
    return jsonResponse({ url: session.url, orderNumber });
  } catch (e: unknown) {
    console.error("[checkout] Stripe session:", e);
    const msg = e instanceof Error ? e.message : "Stripe error";
    return jsonResponse({ error: msg }, 500);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import Stripe from "npm:stripe@14.25.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error("[stripe-webhook] missing secrets (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / Supabase)");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(apiKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig || "", webhookSecret);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "invalid payload";
    console.warn("[stripe-webhook] signature:", msg);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    const sessionPay = session.payment_status;

    if (orderId && sessionPay === "paid") {
      const supabase = createClient(supabaseUrl, serviceKey);
      const paidAt = new Date().toISOString();

      const { error } = await supabase
        .from("orders")
        .update({
          status: "paid",
          paid_at: paidAt,
          updated_at: paidAt,
        })
        .eq("id", orderId)
        .eq("status", "pending");

      if (error) console.error("[stripe-webhook] orders update:", error);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});

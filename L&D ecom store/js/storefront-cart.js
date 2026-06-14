/**
 * Panier persistant Supabase (invité RPC + client connecté) avec repli localStorage.
 */
(function (global) {
  const LS_CART = "atelier-cart";
  const LS_GUEST_TOKEN = "ld-guest-cart-token";
  const LS_CART_ID = "ld-cart-id";

  function getGuestToken() {
    let token = localStorage.getItem(LS_GUEST_TOKEN);
    if (!token) {
      token =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(LS_GUEST_TOKEN, token);
    }
    return token;
  }

  function loadLocalCart() {
    try {
      return JSON.parse(localStorage.getItem(LS_CART) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalCart(items) {
    localStorage.setItem(LS_CART, JSON.stringify(items));
  }

  function mapDbItemToState(row) {
    return {
      productId: row.product_slug || row.product_id,
      variantId: row.variant_id,
      size: row.size || "Unique",
      color: row.color || "Standard",
      quantity: row.quantity,
      priceCents: row.price_cents,
    };
  }

  function mapRpcItemToState(row) {
    return {
      productId: row.product_slug,
      variantId: row.variant_id,
      size: row.size || "Unique",
      color: row.color || "Standard",
      quantity: row.quantity,
      priceCents: row.price_cents,
    };
  }

  async function ensureUserCart(sb) {
    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return null;

    const { data: existing } = await sb
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await sb
      .from("carts")
      .insert({ user_id: userId })
      .select("id")
      .single();

    if (error) throw error;
    return created.id;
  }

  async function loadUserCartItems(sb, cartId) {
    const { data, error } = await sb
      .from("cart_items")
      .select(
        `
        variant_id, quantity,
        product_variants (
          sku, size, color, price_cents,
          products ( slug, name )
        )
      `
      )
      .eq("cart_id", cartId);

    if (error) throw error;

    return (data || []).map((row) => {
      const pv = row.product_variants;
      const p = pv?.products;
      return {
        productId: p?.slug,
        variantId: row.variant_id,
        size: pv?.size || "Unique",
        color: pv?.color || "Standard",
        quantity: row.quantity,
        priceCents: pv?.price_cents,
      };
    });
  }

  async function loadCart(sb, catalogSource) {
    if (!sb || catalogSource !== "supabase") {
      return { items: loadLocalCart(), mode: "local" };
    }

    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (userId) {
      const cartId = await ensureUserCart(sb);
      if (!cartId) return { items: [], mode: "user" };
      const items = await loadUserCartItems(sb, cartId);
      localStorage.setItem(LS_CART_ID, cartId);
      return { items, mode: "user", cartId };
    }

    const token = getGuestToken();
    const { data, error } = await sb.rpc("fetch_guest_cart", {
      p_guest_token: token,
    });
    if (error) throw error;

    const payload = typeof data === "string" ? JSON.parse(data) : data;
    if (payload?.cart_id) localStorage.setItem(LS_CART_ID, payload.cart_id);
    const items = (payload?.items || []).map(mapRpcItemToState);
    return { items, mode: "guest", guestToken: token };
  }

  async function addItem(sb, catalogSource, item) {
    if (!sb || catalogSource !== "supabase" || !item.variantId) {
      const local = loadLocalCart();
      const existing = local.find(
        (i) => i.productId === item.productId && i.size === item.size
      );
      if (existing) existing.quantity += item.quantity || 1;
      else local.push({ ...item });
      saveLocalCart(local);
      return local;
    }

    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (userId) {
      const cartId = await ensureUserCart(sb);
      const { data: existing } = await sb
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cartId)
        .eq("variant_id", item.variantId)
        .maybeSingle();

      if (existing) {
        await sb
          .from("cart_items")
          .update({
            quantity: Math.min(existing.quantity + (item.quantity || 1), 999),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await sb.from("cart_items").insert({
          cart_id: cartId,
          variant_id: item.variantId,
          quantity: item.quantity || 1,
        });
      }
    } else {
      await sb.rpc("upsert_guest_cart_item", {
        p_guest_token: getGuestToken(),
        p_variant_id: item.variantId,
        p_quantity: item.quantity || 1,
      });
    }

    const loaded = await loadCart(sb, catalogSource);
    saveLocalCart(loaded.items);
    return loaded.items;
  }

  async function removeItem(sb, catalogSource, variantId, productId, size) {
    if (!sb || catalogSource !== "supabase" || !variantId) {
      const local = loadLocalCart().filter(
        (i) => !(i.productId === productId && i.size === size)
      );
      saveLocalCart(local);
      return local;
    }

    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (userId) {
      const cartId = await ensureUserCart(sb);
      await sb
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("variant_id", variantId);
    } else {
      await sb.rpc("set_guest_cart_item_qty", {
        p_guest_token: getGuestToken(),
        p_variant_id: variantId,
        p_quantity: 0,
      });
    }

    const loaded = await loadCart(sb, catalogSource);
    saveLocalCart(loaded.items);
    return loaded.items;
  }

  async function clearCart(sb, catalogSource) {
    if (!sb || catalogSource !== "supabase") {
      saveLocalCart([]);
      return [];
    }

    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (userId) {
      const cartId = await ensureUserCart(sb);
      if (cartId) {
        await sb.from("cart_items").delete().eq("cart_id", cartId);
      }
    } else {
      await sb.rpc("clear_guest_cart", { p_guest_token: getGuestToken() });
    }

    saveLocalCart([]);
    return [];
  }

  async function mergeGuestCartOnLogin(sb) {
    const token = localStorage.getItem(LS_GUEST_TOKEN);
    if (!token || !sb) return;
    try {
      await sb.rpc("merge_guest_cart", { p_guest_token: token });
    } catch (e) {
      console.warn("[L&D] merge_guest_cart:", e);
    }
  }

  async function migrateLocalCartToSupabase(sb, products) {
    const local = loadLocalCart();
    if (!local.length || !sb) return;

    for (const item of local) {
      const product = products.find(
        (p) => p.id === item.productId || p.slug === item.productId
      );
      if (!product) continue;
      const variant =
        product._variants?.find((v) => v.id === item.variantId) ||
        global.LD_CATALOG?.resolveVariant?.(product, item.size, item.color);
      if (!variant?.id) continue;
      await addItem(sb, "supabase", {
        productId: product.id,
        variantId: variant.id,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
      });
    }
  }

  global.LD_CART = {
    loadCart,
    addItem,
    removeItem,
    clearCart,
    mergeGuestCartOnLogin,
    migrateLocalCartToSupabase,
    getGuestToken,
    loadLocalCart,
  };
})(window);

/**
 * Catalogue vitrine : Supabase (prioritaire) ou repli catalog.json.
 */
(function (global) {
  const DEFAULT_SIZES = ["Unique"];
  const DEFAULT_COLOR = { fr: "Standard", en: "Standard" };

  function variantOnHand(v) {
    const inv = v.inventory;
    if (Array.isArray(inv)) return inv[0]?.on_hand ?? 0;
    if (inv && typeof inv === "object") return inv.on_hand ?? 0;
    return 0;
  }

  function normalizeImageUrl(url) {
    if (!url) return "";
    const s = String(url);
    if (s.startsWith("http") || s.startsWith("../") || s.startsWith("/")) return s;
    return `../${s.replace(/^\//, "")}`;
  }

  function mapSupabaseRow(row) {
    const variants = (row.product_variants || []).filter((v) => v.active !== false);
    const colorMap = new Map();
    const stock = {};
    const sizes = new Set();

    variants.forEach((v) => {
      const sz = v.size || "Unique";
      const colorLabel = v.color || "Standard";
      sizes.add(sz);
      stock[sz] = (stock[sz] || 0) + variantOnHand(v);
      if (!colorMap.has(colorLabel)) {
        colorMap.set(colorLabel, {
          name: { fr: colorLabel, en: colorLabel },
          hex: "#1C1917",
        });
      }
    });

    const images = Array.isArray(row.image_urls)
      ? row.image_urls.map(normalizeImageUrl).filter(Boolean)
      : [];

    const minPriceCents = variants.length
      ? Math.min(...variants.map((v) => v.price_cents))
      : 0;

    return {
      id: row.slug,
      dbId: row.id,
      slug: row.slug,
      name: { fr: row.name, en: row.name_en || row.name },
      category: row.category,
      price: minPriceCents / 100,
      images,
      colors: colorMap.size
        ? [...colorMap.values()]
        : [{ name: DEFAULT_COLOR, hex: "#1C1917" }],
      sizes: sizes.size ? [...sizes] : DEFAULT_SIZES,
      description: {
        fr: row.description || row.short_description || "",
        en: row.description || row.short_description || "",
      },
      materials: { fr: "", en: "" },
      stock,
      featured: !!row.featured,
      isNew: !!row.is_new,
      bestseller: !!row.best_seller,
      lastChance: !!row.last_chance,
      _variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        color: v.color || "Standard",
        size: v.size || "Unique",
        price_cents: v.price_cents,
        on_hand: variantOnHand(v),
      })),
      _source: "supabase",
    };
  }

  function mapCatalogJsonRow(row, index) {
    const images = row.image ? [normalizeImageUrl(row.image)] : [];

    return {
      id: row.id || row.slug,
      slug: row.slug,
      name: { fr: row.nameFr, en: row.nameEn },
      category: row.category,
      price: row.price,
      images,
      colors: [{ name: DEFAULT_COLOR, hex: "#1C1917" }],
      sizes: DEFAULT_SIZES,
      description: {
        fr: row.descriptionFr || "",
        en: row.descriptionEn || "",
      },
      materials: { fr: "", en: "" },
      stock: { Unique: row.inStock === false ? 0 : 99 },
      bestseller: !!row.bestseller,
      lastChance: !!row.lastChance,
      _variants: [],
      _source: "fallback",
      _legacyId: row.id,
      _priceCents: row.priceCents,
    };
  }

  async function fetchFromSupabase(sb) {
    const { data, error } = await sb
      .from("products")
      .select(
        `
        id, slug, name, name_en, short_description, description,
        category, collection, featured, is_new, best_seller, last_chance, image_urls,
        product_variants (
          id, sku, color, size, price_cents, active,
          inventory ( on_hand )
        )
      `
      )
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const rows = (data || []).filter(
      (p) => (p.product_variants || []).some((v) => v.active !== false)
    );
    return rows.map(mapSupabaseRow);
  }

  async function fetchFallbackCatalog() {
    try {
      const res = await fetch("../data/catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog.json unavailable");
      const json = await res.json();
      return (json.products || []).map((row, index) => mapCatalogJsonRow(row, index));
    } catch (e) {
      console.warn("[L&D] Fallback catalog:", e);
      return [];
    }
  }

  async function loadCatalog(sb) {
    const isDevHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (sb) {
      try {
        const dbProducts = await fetchFromSupabase(sb);
        if (dbProducts.length) {
          return { products: dbProducts, source: "supabase" };
        }
      } catch (e) {
        console.warn("[L&D] Supabase catalog:", e);
      }
    }
    if (!isDevHost) {
      console.warn("[L&D] catalog fallback disabled outside local dev.");
      return { products: [], source: "supabase-empty" };
    }
    const fallback = await fetchFallbackCatalog();
    return { products: fallback, source: "fallback-dev" };
  }

  function resolveVariant(product, size, color) {
    const variants = product._variants || [];
    if (!variants.length) return null;
    const sz = size || "Unique";
    const col = color || "Standard";
    return (
      variants.find((v) => v.size === sz && v.color === col) ||
      variants.find((v) => v.size === sz) ||
      variants[0]
    );
  }

  function itemUnitPrice(product, variantId) {
    if (!product) return 0;
    const v = (product._variants || []).find((x) => x.id === variantId);
    if (v) return v.price_cents / 100;
    return product.price;
  }

  global.LD_CATALOG = {
    loadCatalog,
    resolveVariant,
    itemUnitPrice,
    mapSupabaseRow,
  };
})(window);

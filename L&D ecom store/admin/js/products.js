import {
  escapeHtml,
  productStatusBadge,
  emptyState,
  skeletonRows,
  toast,
  slugify,
  setFieldError,
  setStickyBar,
  setButtonLoading,
  confirmDialog,
  debounce
} from "./ui.js";
import { normalizeProductImageUrls } from "./media.js";
import { setRouteHash } from "./router.js";
import { deactivateProductRecord } from "./theme-editor.js";

const PAGE_SIZE = 10;

export function createProductsModule(ctx) {
  let productsPage = 0;
  let productsTotalCount = 0;
  let filterActive = "all";

  function inventoryForProduct(productId) {
    return ctx.state.variantsCache
      .filter((v) => v.product_id === productId)
      .reduce((s, v) => s + (v.inventory?.[0]?.on_hand ?? 0), 0);
  }

  function buildProductsQuery() {
    const q = (document.getElementById("products-search")?.value || "").trim();
    let query = ctx.sb.from("products").select("id,name,slug,category,description,active,image_urls", {
      count: "exact"
    });

    if (filterActive === "active") query = query.eq("active", true);
    if (filterActive === "inactive") query = query.eq("active", false);

    if (q) {
      const safe = q.replace(/[%_,]/g, " ").trim();
      if (safe) {
        query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%,category.ilike.%${safe}%`);
      }
    }

    return query.order("created_at", { ascending: false });
  }

  /**
   * Charge une page de produits via Supabase .range(start, end).
   * @returns {Promise<boolean>}
   */
  async function fetchProductsPage() {
    let start = productsPage * PAGE_SIZE;
    let end = start + PAGE_SIZE - 1;

    let { data, error, count } = await buildProductsQuery().range(start, end);

    if (error) {
      toast(error.message, "error");
      return false;
    }

    productsTotalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(productsTotalCount / PAGE_SIZE) || 1);

    if (productsPage > totalPages - 1 && productsTotalCount > 0) {
      productsPage = totalPages - 1;
      start = productsPage * PAGE_SIZE;
      end = start + PAGE_SIZE - 1;
      const retry = await buildProductsQuery().range(start, end);
      if (retry.error) {
        toast(retry.error.message, "error");
        return false;
      }
      data = retry.data;
    }

    ctx.state.productsPageData = data || [];
    ctx.state.productsCache = ctx.state.productsPageData;
    return true;
  }

  function updatePaginationUi() {
    const totalPages = Math.max(1, Math.ceil(productsTotalCount / PAGE_SIZE) || 1);
    const info = document.getElementById("products-page-info");
    const prev = document.getElementById("products-prev");
    const next = document.getElementById("products-next");

    if (info) {
      info.textContent = productsTotalCount
        ? `Page ${productsPage + 1} / ${totalPages}`
        : "Page 0 / 0";
    }

    if (prev) {
      prev.disabled = productsPage <= 0;
      prev.classList.toggle("opacity-40", productsPage <= 0);
      prev.classList.toggle("pointer-events-none", productsPage <= 0);
    }

    if (next) {
      const onLast = productsPage >= totalPages - 1 || productsTotalCount === 0;
      next.disabled = onLast;
      next.classList.toggle("opacity-40", onLast);
      next.classList.toggle("pointer-events-none", onLast);
    }
  }

  function showProductsSubview(sub) {
    document.getElementById("products-view-list")?.classList.toggle("hidden", sub !== "list");
    document.getElementById("products-view-form")?.classList.toggle("hidden", sub !== "form");
    if (sub !== "form") {
      setStickyBar({ visible: false });
    }
  }

  async function renderProductsList() {
    showProductsSubview("list");
    const tbody = document.getElementById("products-tbody");
    if (tbody) tbody.innerHTML = skeletonRows(6, 5);

    await fetchProductsPage();

    const list = ctx.state.productsPageData || [];
    if (!tbody) return;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8">${emptyState({
        title: "Aucun produit",
        body: "Ajoutez votre premier article au catalogue.",
        ctaLabel: "Ajouter un produit",
        ctaHref: "#/products/new"
      })}</td></tr>`;
    } else {
      tbody.innerHTML = list
        .map((p) => {
          const imgs = normalizeProductImageUrls(p.image_urls);
          const thumb = imgs[0]
            ? `<img src="${escapeHtml(imgs[0])}" alt="" class="w-10 h-10 rounded-md object-cover bg-stone-100">`
            : `<span class="w-10 h-10 rounded-md bg-stone-100 inline-block"></span>`;
          const inv = inventoryForProduct(p.id);
          return `
        <tr class="border-t border-stone-100 hover:bg-stone-50/80 transition-colors product-row" data-id="${p.id}">
          <td class="px-4 py-3">${thumb}</td>
          <td class="px-4 py-3">
            <a href="#/products/${p.id}" class="text-[13px] font-medium text-stone-900 hover:underline">${escapeHtml(p.name)}</a>
            <p class="text-[11px] text-stone-400 truncate max-w-[200px]">${escapeHtml(p.slug)}</p>
          </td>
          <td class="px-4 py-3 text-[13px] text-stone-600">${escapeHtml(p.category)}</td>
          <td class="px-4 py-3">${productStatusBadge(p.active)}</td>
          <td class="px-4 py-3 text-[13px] tabular-nums">${inv}</td>
          <td class="px-4 py-3 text-right">
            <div class="flex justify-end gap-1.5">
            <button type="button" data-id="${p.id}" data-active="${p.active}" class="toggle-product admin-btn-ghost h-8 px-2.5 text-[11px]">
              ${p.active ? "Désactiver" : "Activer"}
            </button>
            <button type="button" data-id="${p.id}" class="delete-product admin-btn-ghost h-8 px-2.5 text-[11px] text-red-700 hover:bg-red-50">Supprimer</button>
            </div>
          </td>
        </tr>`;
        })
        .join("");
    }

    updatePaginationUi();

    tbody.querySelectorAll(".product-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        setRouteHash("products", { sub: "edit", id: row.dataset.id });
      });
    });
    tbody.querySelectorAll(".toggle-product").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const next = btn.dataset.active !== "true";
        const ok = await confirmDialog({
          title: next ? "Activer le produit ?" : "Désactiver le produit ?",
          body: "Le produit ne sera plus visible sur la boutique si désactivé.",
          danger: !next
        });
        if (!ok) return;
        await ctx.sb.from("products").update({ active: next }).eq("id", btn.dataset.id);
        toast(next ? "Produit activé" : "Produit désactivé", "success");
        await ctx.refreshProductsTab();
        await ctx.refreshStockTab();
        await ctx.refreshAnalytics();
      });
    });
    tbody.querySelectorAll(".delete-product").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const ok = await confirmDialog({
          title: "Désactiver ce produit ?",
          body: "Le produit sera retiré de la boutique (soft delete).",
          danger: true
        });
        if (!ok) return;
        try {
          await deactivateProductRecord(ctx.sb, btn.dataset.id);
          toast("Produit désactivé", "success");
          await ctx.refreshProductsTab();
          await ctx.refreshStockTab();
          await ctx.refreshAnalytics();
        } catch (err) {
          toast(err.message || "Erreur", "error");
        }
      });
    });
  }

  async function fetchProductById(productId) {
    const cached = ctx.state.productsPageData?.find((x) => String(x.id) === String(productId));
    if (cached) return cached;

    const { data, error } = await ctx.sb
      .from("products")
      .select("id,name,slug,category,description,active,image_urls")
      .eq("id", productId)
      .maybeSingle();

    if (error) {
      toast(error.message, "error");
      return null;
    }
    return data;
  }

  function fillProductForm(p = null) {
    const isNew = !p;
    document.getElementById("pf-id").value = p?.id || "";
    document.getElementById("pf-name").value = p?.name || "";
    document.getElementById("pf-slug").value = p?.slug || "";
    const catEl = document.getElementById("pf-category");
    if (catEl) catEl.value = p?.category || "";
    document.getElementById("pf-description").value = p?.description || "";
    document.getElementById("pf-active").checked = p ? !!p.active : true;
    const imgs = normalizeProductImageUrls(p?.image_urls);
    document.getElementById("pf-image-url").value = imgs[0] || "";
    document.getElementById("pf-image-urls").value = imgs.slice(1).join("\n");
    const previewWrap = document.getElementById("pf-image-preview-wrap");
    const previewImg = document.getElementById("pf-image-preview");
    if (imgs[0] && previewWrap && previewImg) {
      previewWrap.classList.remove("hidden");
      previewImg.src = imgs[0];
    } else if (previewWrap) {
      previewWrap.classList.add("hidden");
    }
    const variants = p ? ctx.state.variantsCache.filter((v) => v.product_id === p.id) : [];
    const firstVar = variants[0];
    document.getElementById("pf-price").value = firstVar ? (firstVar.price_cents / 100).toFixed(2) : "";
    document.getElementById("pf-stock").value = firstVar ? (firstVar.inventory?.[0]?.on_hand ?? 0) : 0;
    document.getElementById("product-form-title").textContent = isNew ? "Nouveau produit" : p.name || "Produit";
    document.getElementById("product-form-submit").textContent = isNew ? "Ajouter le produit" : "Enregistrer";
    document.getElementById("product-variants-block")?.classList.toggle("hidden", isNew);
    if (!isNew) renderVariantsList(p.id);
    ctx.state.productFormDirty = false;
    ["pf-name", "pf-slug", "pf-category"].forEach((id) => setFieldError(id, ""));
  }

  function renderVariantsList(productId) {
    const list = document.getElementById("product-variants-list");
    if (!list) return;
    const variants = ctx.state.variantsCache.filter((v) => v.product_id === productId);
    if (!variants.length) {
      list.innerHTML = `<p class="text-[12px] text-stone-500">Aucune variante. Ajoutez-en une ci-dessous.</p>`;
      return;
    }
    list.innerHTML = variants
      .map(
        (v) => `
      <div class="flex justify-between gap-2 py-2 border-b border-stone-100 text-[12px]">
        <span class="font-medium">${escapeHtml(v.sku)}</span>
        <span class="text-stone-500">${escapeHtml(v.size || "—")} · ${escapeHtml(v.color || "—")}</span>
        <span class="tabular-nums">${(v.price_cents / 100).toLocaleString("fr-CA")} $</span>
        <span class="tabular-nums">${v.inventory?.[0]?.on_hand ?? 0} en stock</span>
      </div>`
      )
      .join("");
    document.getElementById("pf-variant-product-id").value = productId;
  }

  function productFormSaveHandlers() {
    return {
      onSave: () => triggerProductSave(),
      onCancel: () => setRouteHash("products", {})
    };
  }

  function triggerProductSave() {
    saveProduct({ preventDefault() {} });
  }

  async function renderProductForm(productId) {
    showProductsSubview("form");
    const p = productId ? await fetchProductById(productId) : null;
    fillProductForm(p);
    setStickyBar({
      visible: true,
      dirty: ctx.state.productFormDirty,
      ...productFormSaveHandlers(),
      saveLabel: p ? "Enregistrer" : "Créer le produit"
    });
  }

  async function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById("pf-id").value;
    if (!id) return;
    const name = document.getElementById("pf-name").value.trim();
    let slug = document.getElementById("pf-slug").value.trim();
    const category = document.getElementById("pf-category").value.trim();
    const priceCad = Number(document.getElementById("pf-price")?.value);
    if (!name || !category) {
      toast("Nom et catégorie requis", "error");
      return;
    }
    if (!slug) slug = slugify(name);
    const { data: dup } = await ctx.sb
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (dup && String(dup.id) !== String(id)) {
      setFieldError("pf-slug", "Ce slug est déjà utilisé");
      return;
    }
    const urlsRaw = document.getElementById("pf-image-urls")?.value || "";
    const primaryUrl = (document.getElementById("pf-image-url")?.value || "").trim();
    const image_urls = [...new Set([primaryUrl, ...urlsRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)].filter(Boolean))];
    const payload = {
      name,
      slug,
      category,
      description: document.getElementById("pf-description").value.trim(),
      image_urls,
      active: document.getElementById("pf-active").checked,
      updated_at: new Date().toISOString()
    };
    const saveBtn = document.getElementById("sticky-save");
    setButtonLoading(saveBtn, true);
    try {
      const { error } = await ctx.sb.from("products").update(payload).eq("id", id);
      if (error) throw error;
      toast("Produit enregistré", "success");
      ctx.state.productFormDirty = false;
      setRouteHash("products", { sub: "edit", id });
      await ctx.refreshProductsTab();
      setStickyBar({ visible: true, dirty: false, ...productFormSaveHandlers(), saveLabel: "Enregistrer" });
      await ctx.refreshAnalytics();
    } catch (err) {
      toast(err.message || "Erreur", "error");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  async function refreshProductsTab() {
    const route = ctx.getRoute();
    if (route.tab === "products") {
      if (route.sub === "new") renderProductForm(null);
      else if (route.sub === "edit" && route.id) await renderProductForm(route.id);
      else await renderProductsList();
    }
  }

  /** Compte total pour analytics / onboarding (requête légère). */
  async function fetchProductsCount() {
    const { count, error } = await ctx.sb
      .from("products")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  }

  function bindProductsEvents() {
    document.getElementById("products-add-btn")?.addEventListener("click", () => {
      setRouteHash("products", { sub: "new" });
    });
    document.querySelectorAll("[data-products-filter]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        filterActive = btn.dataset.productsFilter;
        productsPage = 0;
        document.querySelectorAll("[data-products-filter]").forEach((b) => {
          b.classList.toggle("admin-tab-active", b === btn);
        });
        await renderProductsList();
      });
    });
    document.getElementById("products-search")?.addEventListener(
      "input",
      debounce(async () => {
        productsPage = 0;
        await renderProductsList();
      }, 300)
    );
    document.getElementById("products-prev")?.addEventListener("click", async () => {
      if (productsPage <= 0) return;
      productsPage -= 1;
      await renderProductsList();
    });
    document.getElementById("products-next")?.addEventListener("click", async () => {
      const totalPages = Math.max(1, Math.ceil(productsTotalCount / PAGE_SIZE));
      if (productsPage >= totalPages - 1) return;
      productsPage += 1;
      await renderProductsList();
    });
    document.getElementById("product-form")?.addEventListener("submit", saveProduct);
    document.getElementById("pf-image-url")?.addEventListener("input", () => {
      const url = (document.getElementById("pf-image-url")?.value || "").trim();
      const wrap = document.getElementById("pf-image-preview-wrap");
      const img = document.getElementById("pf-image-preview");
      if (!wrap || !img) return;
      if (!url) {
        wrap.classList.add("hidden");
        img.removeAttribute("src");
        return;
      }
      wrap.classList.remove("hidden");
      img.src = url;
      img.onerror = () => wrap.classList.add("hidden");
      ctx.state.productFormDirty = true;
      setStickyBar({ visible: true, dirty: true, ...productFormSaveHandlers() });
    });
    document.getElementById("pf-name")?.addEventListener("input", (e) => {
      ctx.state.productFormDirty = true;
      setStickyBar({ visible: true, dirty: true, ...productFormSaveHandlers() });
      const slugEl = document.getElementById("pf-slug");
      if (slugEl && !slugEl.dataset.touched) slugEl.value = slugify(e.target.value);
    });
    document.getElementById("pf-slug")?.addEventListener("input", () => {
      document.getElementById("pf-slug").dataset.touched = "1";
      ctx.state.productFormDirty = true;
      setStickyBar({ visible: true, dirty: true, ...productFormSaveHandlers() });
    });
    ["pf-description", "pf-category", "pf-image-urls", "pf-price", "pf-stock"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => {
        ctx.state.productFormDirty = true;
        setStickyBar({ visible: true, dirty: true, ...productFormSaveHandlers() });
      });
    });
    document.getElementById("pf-variant-add-btn")?.addEventListener("click", async () => {
      const productId = document.getElementById("pf-variant-product-id").value;
      if (!productId) return;
      const price = Number(document.getElementById("pf-variant-price").value);
      if (price <= 0) {
        toast("Prix invalide", "error");
        return;
      }
      const payload = {
        product_id: productId,
        sku: document.getElementById("pf-variant-sku").value.trim(),
        price_cents: price,
        size: document.getElementById("pf-variant-size").value.trim() || null,
        color: document.getElementById("pf-variant-color").value.trim() || null,
        low_stock_threshold: Number(document.getElementById("pf-variant-threshold").value) || 3,
        active: true
      };
      const { data, error } = await ctx.sb.from("product_variants").insert(payload).select("id").single();
      if (error) return toast(error.message, "error");
      await ctx.sb.from("inventory").upsert({ variant_id: data.id, on_hand: 0 });
      document.getElementById("pf-variant-sku").value = "";
      document.getElementById("pf-variant-price").value = "";
      document.getElementById("pf-variant-size").value = "";
      document.getElementById("pf-variant-color").value = "";
      document.getElementById("pf-variant-threshold").value = "3";
      toast("Variante ajoutée", "success");
      await ctx.refreshStockTab();
      await ctx.refreshProductsTab();
      renderVariantsList(productId);
    });
  }

  return {
    refreshProductsTab,
    renderProductsList,
    renderProductForm,
    bindProductsEvents,
    fetchProductsCount,
    getFilteredProducts: () => ctx.state.productsPageData || []
  };
}

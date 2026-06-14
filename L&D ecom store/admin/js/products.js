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
import { buildHash, setRouteHash } from "./router.js";

const PAGE_SIZE = 10;

export function createProductsModule(ctx) {
  let productsPage = 0;
  let filterActive = "all";

  function inventoryForProduct(productId) {
    return ctx.state.variantsCache
      .filter((v) => v.product_id === productId)
      .reduce((s, v) => s + (v.inventory?.[0]?.on_hand ?? 0), 0);
  }

  function getFilteredProducts() {
    let list = ctx.state.productsCache;
    if (filterActive === "active") list = list.filter((p) => p.active);
    if (filterActive === "inactive") list = list.filter((p) => !p.active);
    const q = (document.getElementById("products-search")?.value || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.slug || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
    );
  }

  function showProductsSubview(sub) {
    document.getElementById("products-view-list")?.classList.toggle("hidden", sub !== "list");
    document.getElementById("products-view-form")?.classList.toggle("hidden", sub !== "form");
    if (sub !== "form") {
      setStickyBar({ visible: false });
    }
  }

  function renderProductsList() {
    showProductsSubview("list");
    const filtered = getFilteredProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (productsPage > totalPages - 1) productsPage = Math.max(0, totalPages - 1);
    const slice = filtered.slice(productsPage * PAGE_SIZE, (productsPage + 1) * PAGE_SIZE);
    const tbody = document.getElementById("products-tbody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-8">${emptyState({
        title: "Aucun produit",
        body: "Ajoutez votre premier article au catalogue.",
        ctaLabel: "Ajouter un produit",
        ctaHref: "#/products/new"
      })}</td></tr>`;
    } else {
      tbody.innerHTML = slice
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
            <button type="button" data-id="${p.id}" data-active="${p.active}" class="toggle-product admin-btn-ghost h-8 px-2.5 text-[11px]">
              ${p.active ? "Désactiver" : "Activer"}
            </button>
          </td>
        </tr>`;
        })
        .join("");
    }

    document.getElementById("products-page-info").textContent =
      `${filtered.length} · ${productsPage + 1}/${totalPages}`;

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
  }

  function fillProductForm(p = null) {
    const isNew = !p;
    document.getElementById("pf-id").value = p?.id || "";
    document.getElementById("pf-name").value = p?.name || "";
    document.getElementById("pf-slug").value = p?.slug || "";
    document.getElementById("pf-category").value = p?.category || "";
    document.getElementById("pf-description").value = p?.description || "";
    document.getElementById("pf-active").checked = p ? !!p.active : true;
    document.getElementById("pf-image-urls").value = normalizeProductImageUrls(p?.image_urls).join("\n");
    document.getElementById("product-form-title").textContent = isNew ? "Nouveau produit" : p.name || "Produit";
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

  function renderProductForm(productId) {
    showProductsSubview("form");
    const p = productId
      ? ctx.state.productsCache.find((x) => String(x.id) === String(productId))
      : null;
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
    const name = document.getElementById("pf-name").value.trim();
    let slug = document.getElementById("pf-slug").value.trim();
    const category = document.getElementById("pf-category").value.trim();
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
    const image_urls = urlsRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
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
      if (id) {
        const { error } = await ctx.sb.from("products").update(payload).eq("id", id);
        if (error) throw error;
        toast("Produit enregistré", "success");
        ctx.state.productFormDirty = false;
        setRouteHash("products", { sub: "edit", id });
        await ctx.refreshProductsTab();
        setStickyBar({ visible: true, dirty: false, ...productFormSaveHandlers(), saveLabel: "Enregistrer" });
      } else {
        const { data, error } = await ctx.sb.from("products").insert(payload).select("id").single();
        if (error) throw error;
        toast("Produit créé", "success");
        ctx.state.productFormDirty = false;
        setRouteHash("products", { sub: "edit", id: data.id });
        await ctx.refreshProductsTab();
      }
      await ctx.refreshAnalytics();
    } catch (err) {
      toast(err.message || "Erreur", "error");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

  async function refreshProductsTab() {
    const tbody = document.getElementById("products-tbody");
    if (tbody) tbody.innerHTML = skeletonRows(6, 5);
    const { data, error } = await ctx.sb
      .from("products")
      .select("id,name,slug,category,description,active,image_urls")
      .order("created_at", { ascending: false });
    if (error) {
      toast(error.message, "error");
      return;
    }
    ctx.state.productsCache = data || [];
    const route = ctx.getRoute();
    if (route.tab === "products") {
      if (route.sub === "new") renderProductForm(null);
      else if (route.sub === "edit" && route.id) renderProductForm(route.id);
      else renderProductsList();
    }
  }

  function bindProductsEvents() {
    document.getElementById("products-add-btn")?.addEventListener("click", () => {
      setRouteHash("products", { sub: "new" });
    });
    document.querySelectorAll("[data-products-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterActive = btn.dataset.productsFilter;
        productsPage = 0;
        document.querySelectorAll("[data-products-filter]").forEach((b) => {
          b.classList.toggle("admin-tab-active", b === btn);
        });
        renderProductsList();
      });
    });
    document.getElementById("products-search")?.addEventListener(
      "input",
      debounce(() => {
        productsPage = 0;
        renderProductsList();
      })
    );
    document.getElementById("products-prev")?.addEventListener("click", () => {
      productsPage = Math.max(0, productsPage - 1);
      renderProductsList();
    });
    document.getElementById("products-next")?.addEventListener("click", () => {
      productsPage += 1;
      renderProductsList();
    });
    document.getElementById("product-form")?.addEventListener("submit", saveProduct);
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
    ["pf-description", "pf-category", "pf-image-urls"].forEach((id) => {
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
    getFilteredProducts: () => ctx.state.productsCache
  };
}

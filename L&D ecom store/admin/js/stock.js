import { escapeHtml, stockStateBadge, emptyState, skeletonRows, toast, debounce } from "./ui.js";

const PAGE_SIZE = 10;

export function createStockModule(ctx) {
  let stockPage = 0;

  function getFilteredVariants() {
    const q = (document.getElementById("stock-search")?.value || "").trim().toLowerCase();
    if (!q) return ctx.state.variantsCache;
    return ctx.state.variantsCache.filter((v) => {
      const pname = (v.products?.name || "").toLowerCase();
      return (
        (v.sku || "").toLowerCase().includes(q) ||
        pname.includes(q) ||
        (v.size || "").toLowerCase().includes(q) ||
        (v.color || "").toLowerCase().includes(q)
      );
    });
  }

  function openStockPanel(variantId = null) {
    const panel = document.getElementById("stock-panel");
    const backdrop = document.getElementById("stock-panel-backdrop");
    panel?.classList.add("is-open");
    backdrop?.classList.add("is-open");
    backdrop?.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const sel = document.getElementById("stock-variant");
    if (sel && variantId) sel.value = variantId;
  }

  function closeStockPanel() {
    document.getElementById("stock-panel")?.classList.remove("is-open");
    const backdrop = document.getElementById("stock-panel-backdrop");
    backdrop?.classList.remove("is-open");
    backdrop?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function renderStockTable() {
    const filtered = getFilteredVariants();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (stockPage > totalPages - 1) stockPage = Math.max(0, totalPages - 1);
    const slice = filtered.slice(stockPage * PAGE_SIZE, (stockPage + 1) * PAGE_SIZE);
    const tbody = document.getElementById("stock-tbody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-8">${emptyState({
        title: "Aucun SKU",
        body: "Ajoutez des variantes depuis un produit.",
        ctaLabel: "Voir les produits",
        ctaHref: "#/products"
      })}</td></tr>`;
    } else {
      tbody.innerHTML = slice
        .map((v) => {
          const qty = v.inventory?.[0]?.on_hand ?? 0;
          const thr = v.low_stock_threshold ?? 3;
          const tc = `${v.size || "—"} · ${v.color || "—"}`;
          return `
        <tr class="border-t border-stone-100 hover:bg-stone-50/80">
          <td class="px-4 py-3 text-[13px] font-medium">${escapeHtml(v.sku)}</td>
          <td class="px-4 py-3 text-[13px]">${escapeHtml(v.products?.name || "-")}</td>
          <td class="px-4 py-3 text-[12px] text-stone-600 max-w-[180px] truncate" title="${escapeHtml(tc)}">${escapeHtml(tc)}</td>
          <td class="px-4 py-3 text-[13px] tabular-nums">${qty}</td>
          <td class="px-4 py-3 text-[13px] tabular-nums text-stone-500">${thr}</td>
          <td class="px-4 py-3">${stockStateBadge(qty, thr)}</td>
          <td class="px-4 py-3 text-right">
            <button type="button" class="stock-adjust-btn admin-btn-ghost h-8 px-2 text-[11px]" data-variant-id="${v.id}">Ajuster</button>
          </td>
        </tr>`;
        })
        .join("");
    }
    document.getElementById("stock-page-info").textContent =
      `${filtered.length} · ${stockPage + 1}/${totalPages}`;

    tbody.querySelectorAll(".stock-adjust-btn").forEach((btn) => {
      btn.addEventListener("click", () => openStockPanel(btn.dataset.variantId));
    });
  }

  async function refreshStockTab() {
    const tbody = document.getElementById("stock-tbody");
    if (tbody) tbody.innerHTML = skeletonRows(7, 5);
    const { data, error } = await ctx.sb
      .from("product_variants")
      .select("id,product_id,sku,color,size,low_stock_threshold,products(name),inventory(on_hand)")
      .order("sku");
    if (error) {
      toast(error.message, "error");
      return;
    }
    ctx.state.variantsCache = data || [];
    const sel = document.getElementById("stock-variant");
    if (sel) {
      sel.innerHTML = (data || [])
        .map((v) => `<option value="${v.id}">${escapeHtml(v.sku)} - ${escapeHtml(v.products?.name || "")}</option>`)
        .join("");
    }
    ctx.updateNavBadges();
    if (ctx.getRoute().tab === "stock") renderStockTable();
  }

  function bindStockEvents() {
    document.getElementById("stock-open-panel")?.addEventListener("click", () => openStockPanel());
    document.getElementById("stock-panel-close")?.addEventListener("click", closeStockPanel);
    document.getElementById("stock-panel-backdrop")?.addEventListener("click", closeStockPanel);
    document.getElementById("stock-search")?.addEventListener("input", debounce(() => {
      stockPage = 0;
      renderStockTable();
    }));
    document.getElementById("stock-prev")?.addEventListener("click", () => {
      stockPage = Math.max(0, stockPage - 1);
      renderStockTable();
    });
    document.getElementById("stock-next")?.addEventListener("click", () => {
      stockPage += 1;
      renderStockTable();
    });
    document.getElementById("stock-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const variantId = document.getElementById("stock-variant").value;
      const type = document.getElementById("stock-type").value;
      const qty = Number(document.getElementById("stock-qty").value);
      const reason = document.getElementById("stock-reason").value.trim();
      try {
        await ctx.adjustStock(variantId, type, qty, reason);
        e.target.reset();
        toast("Stock mis à jour", "success");
        closeStockPanel();
        await refreshStockTab();
        await ctx.refreshAnalytics();
      } catch (err) {
        toast(err.message || "Erreur stock", "error");
      }
    });
  }

  return { refreshStockTab, renderStockTable, bindStockEvents, closeStockPanel, openStockPanel };
}

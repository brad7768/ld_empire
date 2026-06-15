import { escapeHtml } from "./ui.js";
import { setRouteHash } from "./router.js";

export function createPaletteModule(ctx) {
  let paletteOpen = false;

  function openPalette() {
    const dlg = document.getElementById("admin-palette");
    if (!dlg) return;
    paletteOpen = true;
    dlg.classList.remove("hidden");
    dlg.setAttribute("aria-hidden", "false");
    document.getElementById("palette-input")?.focus();
    renderPaletteResults("");
  }

  function closePalette() {
    paletteOpen = false;
    const dlg = document.getElementById("admin-palette");
    dlg?.classList.add("hidden");
    dlg?.setAttribute("aria-hidden", "true");
  }

  function search(q) {
    const query = (q || "").trim().toLowerCase();
    const results = [];
    if (!query) {
      ctx.state.productsCache.slice(0, 5).forEach((p) => {
        results.push({ type: "product", label: p.name, sub: p.slug, action: () => setRouteHash("products", { sub: "edit", id: p.id }) });
      });
      ctx.state.ordersCache.slice(0, 5).forEach((o) => {
        results.push({ type: "order", label: o.order_number, sub: o.email, action: () => setRouteHash("orders", { sub: "detail", id: o.order_number }) });
      });
      return results;
    }
    ctx.state.productsCache.forEach((p) => {
      if ((p.name || "").toLowerCase().includes(query) || (p.slug || "").toLowerCase().includes(query)) {
        results.push({ type: "product", label: p.name, sub: p.slug, action: () => setRouteHash("products", { sub: "edit", id: p.id }) });
      }
    });
    ctx.state.ordersCache.forEach((o) => {
      if (String(o.order_number).toLowerCase().includes(query) || (o.email || "").toLowerCase().includes(query)) {
        results.push({ type: "order", label: o.order_number, sub: o.email, action: () => setRouteHash("orders", { sub: "detail", id: o.order_number }) });
      }
    });
    (ctx.state.cmsCache || []).forEach((c) => {
      if ((c.key || "").toLowerCase().includes(query)) {
        results.push({
          type: "cms",
          label: c.key,
          sub: c.locale,
          action: () => {
            ctx.state.pendingCmsKey = c.key;
            setRouteHash("cms", { sub: "editor" });
          }
        });
      }
    });
    return results.slice(0, 12);
  }

  function renderPaletteResults(q) {
    const list = document.getElementById("palette-results");
    if (!list) return;
    const items = search(q);
    if (!items.length) {
      list.innerHTML = '<p class="px-4 py-6 text-[13px] text-stone-400 text-center">Aucun résultat</p>';
      return;
    }
    const groups = { product: "Produits", order: "Commandes", cms: "Contenu" };
    const byType = {};
    items.forEach((it) => {
      if (!byType[it.type]) byType[it.type] = [];
      byType[it.type].push(it);
    });
    list.innerHTML = Object.entries(byType)
      .map(
        ([type, rows]) => `
      <p class="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">${groups[type] || type}</p>
      ${rows
        .map(
          (r, i) => `
        <button type="button" class="palette-item w-full text-left px-3 py-2.5 hover:bg-stone-50 flex flex-col" data-idx="${type}-${i}">
          <span class="text-[13px] font-medium text-stone-900">${escapeHtml(r.label)}</span>
          <span class="text-[11px] text-stone-400">${escapeHtml(r.sub || "")}</span>
        </button>`
        )
        .join("")}`
      )
      .join("");
    let flat = [];
    Object.values(byType).forEach((arr) => (flat = flat.concat(arr)));
    list.querySelectorAll(".palette-item").forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        flat[idx]?.action?.();
        closePalette();
      });
    });
  }

  function bindPaletteEvents() {
    document.getElementById("admin-topbar-search")?.addEventListener("focus", () => openPalette());
    document.getElementById("palette-backdrop")?.addEventListener("click", closePalette);
    document.getElementById("palette-input")?.addEventListener("input", (e) => renderPaletteResults(e.target.value));
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette();
      }
      if (e.key === "/" && !paletteOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const help = document.getElementById("admin-help-dialog");
        if (help) {
          help.classList.toggle("hidden");
          help.setAttribute("aria-hidden", help.classList.contains("hidden") ? "true" : "false");
        }
      }
      if (e.key === "Escape") {
        if (paletteOpen) closePalette();
      }
    });
  }

  return { openPalette, closePalette, bindPaletteEvents, isOpen: () => paletteOpen };
}

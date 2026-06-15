import {
  escapeHtml,
  statusBadge,
  emptyState,
  skeletonRows,
  toast,
  formatMoneyCents,
  setStickyBar,
  setButtonLoading,
  ORDER_STATUS_LABELS
} from "./ui.js";
import { buildHash, setRouteHash } from "./router.js";
import { debounce } from "./ui.js";

export function createOrdersModule(ctx) {
  let ordersFilter = "all";

  function getFilteredOrders() {
    let list = ctx.state.ordersCache;
    if (ordersFilter === "pending") list = list.filter((o) => o.status === "pending");
    if (ordersFilter === "paid") list = list.filter((o) => o.status === "paid");
    const q = (document.getElementById("orders-search")?.value || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        (o.email || "").toLowerCase().includes(q) ||
        String(o.order_number || "").toLowerCase().includes(q)
    );
  }

  function showOrdersSubview(sub) {
    document.getElementById("orders-view-list")?.classList.toggle("hidden", sub !== "list");
    document.getElementById("orders-view-detail")?.classList.toggle("hidden", sub !== "detail");
    setStickyBar({ visible: sub === "detail", dirty: false });
  }

  function renderOrdersList() {
    showOrdersSubview("list");
    const filtered = getFilteredOrders();
    const tbody = document.getElementById("orders-tbody");
    if (!tbody) return;
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-8">${emptyState({
        title: "Aucune commande",
        body: "Les commandes passées sur la boutique apparaîtront ici.",
        ctaLabel: "Voir la boutique",
        ctaHref: "../index/index.html"
      })}</td></tr>`;
    } else {
      tbody.innerHTML = filtered
        .map(
          (o) => `
        <tr class="border-t border-stone-100 hover:bg-stone-50/90 cursor-pointer order-row" data-ref="${escapeHtml(o.order_number)}">
          <td class="px-4 py-3 text-[13px] font-medium">${escapeHtml(o.order_number)}</td>
          <td class="px-4 py-3 text-[13px] text-stone-600 max-w-[240px] truncate">${escapeHtml(o.email)}</td>
          <td class="px-4 py-3">${statusBadge(o.status)}</td>
          <td class="px-4 py-3 text-right text-[13px] tabular-nums">${formatMoneyCents(o.total_cents)}</td>
          <td class="px-4 py-3 text-[11px] text-stone-400 whitespace-nowrap">${new Date(o.created_at).toLocaleString("fr-CA")}</td>
        </tr>`
        )
        .join("");
    }
    tbody.querySelectorAll(".order-row").forEach((row) => {
      row.addEventListener("click", () => {
        setRouteHash("orders", { sub: "detail", id: row.dataset.ref });
      });
    });
  }

  function renderOrderDetail(ref) {
    const o = ctx.state.ordersCache.find(
      (x) => String(x.order_number) === String(ref) || String(x.id) === String(ref)
    );
    if (!o) {
      toast("Commande introuvable", "error");
      setRouteHash("orders", {});
      return;
    }
    ctx.state.selectedOrderId = o.id;
    showOrdersSubview("detail");
    const items = o.order_items || [];
    const body = document.getElementById("order-detail-body");
    const shippingBlock =
      o.shipping_line1 || o.shipping_city
        ? `<div class="sm:col-span-2">
            <span class="text-[11px] font-medium text-stone-400 block">Livraison</span>
            <p class="text-[13px] leading-relaxed mt-1">
              ${o.shipping_name ? `${escapeHtml(o.shipping_name)}<br>` : ""}
              ${escapeHtml([o.shipping_line1, o.shipping_line2].filter(Boolean).join(", "))}<br>
              ${escapeHtml([o.shipping_postal, o.shipping_city].filter(Boolean).join(" "))}
              ${o.shipping_country ? `<br>${escapeHtml(o.shipping_country)}` : ""}
            </p>
          </div>`
        : "";
    if (body) {
      body.innerHTML = `
        <div class="admin-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
          <div><span class="text-[11px] font-medium text-stone-400 block">Email</span>${escapeHtml(o.email)}</div>
          <div><span class="text-[11px] font-medium text-stone-400 block">Statut</span>${statusBadge(o.status)}</div>
          <div><span class="text-[11px] font-medium text-stone-400 block">Total</span><span class="tabular-nums font-medium">${formatMoneyCents(o.total_cents)}</span></div>
          <div><span class="text-[11px] font-medium text-stone-400 block">Date</span>${new Date(o.created_at).toLocaleString("fr-CA")}</div>
          ${shippingBlock}
          ${o.notes ? `<div class="sm:col-span-2"><span class="text-[11px] font-medium text-stone-400 block">Notes</span><pre class="text-[11px] text-stone-600 whitespace-pre-wrap mt-1">${escapeHtml(o.notes)}</pre></div>` : ""}
        </div>
        <div class="admin-card p-5 mt-4">
          <p class="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-3">Lignes</p>
          <ul class="divide-y divide-stone-100">
            ${items.map((it) => `
              <li class="py-2 flex justify-between gap-2 text-[12px]">
                <span>${escapeHtml(it.product_name)} · ${escapeHtml(it.sku)} × ${it.qty}</span>
                <span class="tabular-nums shrink-0">${formatMoneyCents(it.line_total_cents)}</span>
              </li>`).join("") || '<li class="text-stone-400">—</li>'}
          </ul>
        </div>`;
    }
    const sel = document.getElementById("order-status-select");
    if (sel) {
      sel.innerHTML = Object.entries(ORDER_STATUS_LABELS)
        .map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`)
        .join("");
      sel.value = o.status;
    }
    setStickyBar({
      visible: true,
      dirty: false,
      onSave: () => document.getElementById("order-detail-save")?.click(),
      onCancel: () => setRouteHash("orders", {}),
      saveLabel: "Enregistrer le statut"
    });
  }

  async function refreshOrdersTab() {
    const tbody = document.getElementById("orders-tbody");
    if (tbody) tbody.innerHTML = skeletonRows(5, 4);
    try {
      const { data, error } = await ctx.sb
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      ctx.state.ordersCache = data || [];
    } catch (err) {
      ctx.state.ordersCache = [];
      console.warn(err);
    }
    ctx.updateNavBadges();
    const route = ctx.getRoute();
    if (route.tab === "orders") {
      if (route.sub === "detail" && route.id) renderOrderDetail(route.id);
      else renderOrdersList();
    }
  }

  function bindOrdersEvents() {
    document.querySelectorAll("[data-orders-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ordersFilter = btn.dataset.ordersFilter;
        document.querySelectorAll("[data-orders-filter]").forEach((b) => {
          b.classList.toggle("admin-tab-active", b === btn);
        });
        renderOrdersList();
      });
    });
    document.getElementById("orders-search")?.addEventListener("input", debounce(renderOrdersList));
    document.getElementById("order-detail-save")?.addEventListener("click", async () => {
      if (!ctx.state.selectedOrderId) return;
      const status = document.getElementById("order-status-select").value;
      const btn = document.getElementById("sticky-save");
      setButtonLoading(btn, true);
      const { error } = await ctx.sb
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", ctx.state.selectedOrderId);
      setButtonLoading(btn, false);
      if (error) return toast(error.message, "error");
      toast("Statut mis à jour", "success");
      await refreshOrdersTab();
      await ctx.refreshAnalytics();
    });
    document.getElementById("order-detail-back")?.addEventListener("click", () => setRouteHash("orders", {}));
  }

  return { refreshOrdersTab, renderOrdersList, renderOrderDetail, bindOrdersEvents };
}

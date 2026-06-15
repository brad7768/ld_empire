import { escapeHtml } from "./ui.js";

export function createAnalyticsModule(ctx) {
  let analyticsCharts = { status: null, revenue: null, topSkus: null };

  function destroyAnalyticsCharts() {
    Object.keys(analyticsCharts).forEach((key) => {
      const ch = analyticsCharts[key];
      if (ch && typeof ch.destroy === "function") {
        ch.destroy();
        analyticsCharts[key] = null;
      }
    });
  }

  function renderOnboarding() {
    const el = document.getElementById("onboarding-card");
    if (!el || localStorage.getItem("ld-admin-onboarding-dismissed") === "1") {
      el?.classList.add("hidden");
      return;
    }
    const hasProduct = (ctx.state.activeProductsCount ?? 0) > 0;
    const hasStock = ctx.state.variantsCache.some((v) => (v.inventory?.[0]?.on_hand ?? 0) > 0);
    const hasCms =
      ctx.state.cmsCache?.length > 0 ||
      (ctx.state.siteSettingsPublished && Object.keys(ctx.state.siteSettingsSections || {}).length > 0);
    const steps = [
      { done: true, label: "Supabase configuré", href: null },
      { done: hasProduct, label: "Au moins 1 produit actif", href: "#/products/new" },
      { done: hasStock, label: "Stock renseigné sur un SKU", href: "#/stock" },
      { done: hasCms, label: "Contenu boutique publié", href: "#/cms/editor" },
      { done: false, label: "Tester une commande sur la boutique", href: "../index/index.html" }
    ];
    const doneCount = steps.filter((s) => s.done).length;
    el.classList.remove("hidden");
    el.innerHTML = `
      <div class="admin-card p-5">
        <div class="flex justify-between items-start gap-4 mb-4">
          <div>
            <p class="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Premiers pas</p>
            <p class="text-[14px] font-semibold text-stone-900 mt-1">${doneCount}/${steps.length} étapes</p>
          </div>
          <button type="button" id="onboarding-dismiss" class="text-[11px] text-stone-400 hover:text-stone-700">Masquer</button>
        </div>
        <ul class="space-y-2">
          ${steps
            .map(
              (s) => `
            <li class="flex items-center gap-2 text-[13px]">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${s.done ? "bg-gold-500/20 text-gold-600" : "bg-stone-100 text-stone-400"}">${s.done ? "✓" : "·"}</span>
              ${s.href ? `<a href="${s.href}" class="hover:underline ${s.done ? "text-stone-500 line-through" : "text-stone-800"}">${escapeHtml(s.label)}</a>` : `<span class="${s.done ? "text-stone-500" : "text-stone-800"}">${escapeHtml(s.label)}</span>`}
            </li>`
            )
            .join("")}
        </ul>
      </div>`;
    document.getElementById("onboarding-dismiss")?.addEventListener("click", () => {
      localStorage.setItem("ld-admin-onboarding-dismissed", "1");
      el.classList.add("hidden");
    });
  }

  async function refreshAnalytics() {
    try {
      if (!ctx.state.variantsCache.length) await ctx.refreshStockTab();

      const { count: activeProductCount } = await ctx.sb
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("active", true);

      ctx.state.activeProductsCount = activeProductCount ?? 0;

      const ordersRes = await ctx.sb.from("orders").select("id,status,total_cents,created_at").order("created_at", { ascending: false }).limit(4000);
      const orders = ordersRes.data || [];
      const statusCounts = {};
      orders.forEach((o) => {
        const s = String(o.status || "?");
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
      const paid = orders.filter((x) => x.status === "paid");
      const revenue = paid.reduce((s, x) => s + Number(x.total_cents || 0), 0);
      const pending = orders.filter((x) => x.status === "pending").length;
      const activeProducts = activeProductCount ?? 0;
      const variants = ctx.state.variantsCache.length;

      document.getElementById("analytics-kpi").innerHTML = `
        <div class="xl:border-r xl:border-stone-200/70 xl:pr-10"><p class="text-[11px] font-medium text-stone-500 mb-1">Actifs</p><p class="text-2xl sm:text-3xl font-semibold tabular-nums text-stone-900">${activeProducts}</p></div>
        <div class="xl:border-r xl:border-stone-200/70 xl:pr-10"><p class="text-[11px] font-medium text-stone-500 mb-1">SKU</p><p class="text-2xl sm:text-3xl font-semibold tabular-nums text-stone-900">${variants}</p></div>
        <div class="xl:border-r xl:border-stone-200/70 xl:pr-10"><p class="text-[11px] font-medium text-stone-500 mb-1">CA payé</p><p class="text-2xl sm:text-3xl font-semibold tabular-nums text-stone-900">${(revenue / 100).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</p></div>
        <div><p class="text-[11px] font-medium text-stone-500 mb-1">Attente</p><p class="text-2xl sm:text-3xl font-semibold tabular-nums text-stone-900">${pending}</p></div>`;

      const paidIds = paid.map((x) => x.id);
      const skuAgg = {};
      if (paidIds.length) {
        const { data: items } = await ctx.sb.from("order_items").select("sku,product_name,qty").in("order_id", paidIds);
        (items || []).forEach((it) => {
          const k = it.sku;
          if (!skuAgg[k]) skuAgg[k] = { name: it.product_name, sku: it.sku, qty: 0 };
          skuAgg[k].qty += Number(it.qty || 0);
        });
      }
      document.getElementById("analytics-top").innerHTML =
        Object.values(skuAgg)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 8)
          .map(
            (row) =>
              `<li class="flex justify-between gap-2 border-b border-stone-100 pb-2"><span class="truncate">${escapeHtml(row.name)}</span><span class="tabular-nums text-stone-500">${row.qty}</span></li>`
          )
          .join("") || '<li class="text-stone-400">—</li>';

      const low = ctx.state.variantsCache
        .map((v) => {
          const qty = v.inventory?.[0]?.on_hand ?? 0;
          const thr = v.low_stock_threshold ?? 3;
          return { v, qty, thr, bad: qty === 0 || qty <= thr };
        })
        .filter((x) => x.bad)
        .sort((a, b) => a.qty - b.qty)
        .slice(0, 15);
      document.getElementById("analytics-low-stock").innerHTML =
        low.length
          ? low
              .map(
                (x) =>
                  `<li class="flex justify-between gap-2 border-b border-stone-100 pb-2"><span class="truncate text-[13px]">${escapeHtml(x.v.sku)}</span><span class="${x.qty === 0 ? "text-red-600" : "text-amber-700"} tabular-nums text-[12px]">${x.qty}/${x.thr}</span></li>`
              )
              .join("")
          : '<li class="text-stone-400">—</li>';

      ctx.updateNavBadges();
      destroyAnalyticsCharts();
      const panel = document.getElementById("tab-analytics");
      if (typeof Chart === "undefined" || !panel || panel.classList.contains("hidden")) return;

      const palette = ["#1C1917", "#B8924A", "#44403C", "#A8A29E", "#9F7C3A", "#D6D3D1"];
      let statusLabels = Object.keys(statusCounts);
      let statusData = statusLabels.map((k) => statusCounts[k]);
      if (!statusLabels.length) {
        statusLabels = ["Aucune commande"];
        statusData = [1];
      }
      const ctxS = document.getElementById("chart-status");
      if (ctxS) {
        analyticsCharts.status = new Chart(ctxS, {
          type: "doughnut",
          data: {
            labels: statusLabels,
            datasets: [{ data: statusData, backgroundColor: statusLabels[0] === "Aucune commande" ? ["#E7E5E1"] : palette, borderWidth: 1, borderColor: "#fff" }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
        });
      }

      const revenueDays = parseInt(document.getElementById("analytics-revenue-range")?.value || "30", 10) || 30;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayMs = 86400000;
      const startDay = new Date(today);
      startDay.setDate(startDay.getDate() - (revenueDays - 1));
      const labelsRev = [];
      const daily = [];
      for (let i = 0; i < revenueDays; i++) {
        const d = new Date(startDay.getTime() + i * dayMs);
        labelsRev.push(d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
        daily.push(0);
      }
      paid.forEach((o) => {
        const d = new Date(o.created_at);
        d.setHours(0, 0, 0, 0);
        const idx = Math.round((d.getTime() - startDay.getTime()) / dayMs);
        if (idx >= 0 && idx < revenueDays) daily[idx] += Number(o.total_cents || 0) / 100;
      });
      let cum = 0;
      const cumulative = daily.map((v) => {
        cum += v;
        return Math.round(cum * 100) / 100;
      });
      const ctxR = document.getElementById("chart-revenue");
      if (ctxR) {
        analyticsCharts.revenue = new Chart(ctxR, {
          type: "line",
          data: {
            labels: labelsRev,
            datasets: [{ label: "CA", data: cumulative, borderColor: "#B8924A", fill: true, tension: 0.3, pointRadius: 0 }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
      }

      const skuEntries = Object.values(skuAgg).sort((a, b) => b.qty - a.qty).slice(0, 8);
      const ctxB = document.getElementById("chart-top-skus");
      if (ctxB && skuEntries.length) {
        analyticsCharts.topSkus = new Chart(ctxB, {
          type: "bar",
          data: {
            labels: skuEntries.map((r) => String(r.sku).slice(0, 20)),
            datasets: [{ data: skuEntries.map((r) => r.qty), backgroundColor: "#1C1917" }]
          },
          options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
      }

      renderOnboarding();
    } catch (e) {
      console.warn(e);
      destroyAnalyticsCharts();
    }
  }

  function bindAnalyticsEvents() {
    document.getElementById("analytics-revenue-range")?.addEventListener("change", refreshAnalytics);
  }

  return { refreshAnalytics, renderOnboarding, bindAnalyticsEvents };
}

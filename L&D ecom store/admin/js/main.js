import { toast } from "./ui.js";
import { parseHash, updateTopbar, VALID_TABS, TAB_LABELS } from "./router.js";
import { wireImageDropzone } from "./media.js";
import { createProductsModule } from "./products.js";
import { createOrdersModule } from "./orders.js";
import { createStockModule } from "./stock.js";
import { createCmsModule } from "./cms.js";
import { createAnalyticsModule } from "./analytics.js";
import { createPaletteModule } from "./palette.js";

const SESSION_CFG_KEY = "LD_SUPABASE_SESSION";
const STORAGE_BUCKET = "product-media";

try {
  const raw = sessionStorage.getItem(SESSION_CFG_KEY);
  if (raw) window.LD_SUPABASE = Object.assign({}, window.LD_SUPABASE || {}, JSON.parse(raw));
} catch (_) {}

const feedback = (msg, isError = false) => {
  const el = document.getElementById("login-feedback");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.toggle("text-red-600", isError);
};

const cfg = window.LD_SUPABASE || {};
const cfgBanner = document.getElementById("config-banner");

document.getElementById("cfg-save")?.addEventListener("click", () => {
  const url = (document.getElementById("cfg-url")?.value || "").trim();
  const anonKey = (document.getElementById("cfg-key")?.value || "").trim();
  if (!url || !anonKey) return alert("Remplissez URL et clé anon.");
  sessionStorage.setItem(SESSION_CFG_KEY, JSON.stringify({ url, anonKey }));
  window.LD_SUPABASE = { url, anonKey };
  location.reload();
});

if (!cfg.url || !cfg.anonKey) {
  cfgBanner?.classList.remove("hidden");
  feedback("Configurez Supabase ci-dessus ou remplissez js/supabase-config.js", true);
  throw new Error("Supabase config missing");
}
cfgBanner?.classList.add("hidden");

const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const sb = createClient(cfg.url, cfg.anonKey);

const state = {
  productsCache: [],
  variantsCache: [],
  ordersCache: [],
  cmsCache: [],
  selectedOrderId: null,
  productFormDirty: false,
  siteSettingsPublished: false,
  siteSettingsSections: {}
};

let currentTab = "analytics";
const sidebarEl = document.getElementById("admin-sidebar");
const backdropEl = document.getElementById("drawer-backdrop");
const SIDEBAR_COLLAPSED_KEY = "ld-admin-sidebar-collapsed";

function isSidebarCollapsed() {
  return document.body.classList.contains("admin-sidebar-collapsed");
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("admin-sidebar-collapsed", collapsed);
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  document.querySelectorAll(".sidebar-collapse-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "Afficher le menu" : "Replier le menu");
    btn.title = collapsed ? "Afficher le menu" : "Replier le menu";
  });
}

function toggleSidebarCollapsed() {
  setSidebarCollapsed(!isSidebarCollapsed());
}

function initSidebarCollapsed() {
  if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setSidebarCollapsed(true);
}

function openSidebar() {
  sidebarEl?.classList.add("sidebar-open");
  backdropEl?.classList.add("drawer-open");
  backdropEl?.setAttribute("aria-hidden", "false");
  document.getElementById("sidebar-toggle")?.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  sidebarEl?.classList.remove("sidebar-open");
  backdropEl?.classList.remove("drawer-open");
  backdropEl?.setAttribute("aria-hidden", "true");
  document.getElementById("sidebar-toggle")?.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

function countPendingOrders() {
  return state.ordersCache.filter((o) => o.status === "pending").length;
}

function countCriticalStock() {
  return state.variantsCache.filter((v) => {
    const qty = v.inventory?.[0]?.on_hand ?? 0;
    const thr = v.low_stock_threshold ?? 3;
    return qty === 0 || qty <= thr;
  }).length;
}

function updateNavBadges() {
  const pending = countPendingOrders();
  const stockAlerts = countCriticalStock();
  document.querySelectorAll('[data-nav-badge="orders"]').forEach((el) => {
    if (pending > 0) {
      el.textContent = pending > 99 ? "99+" : String(pending);
      el.classList.remove("hidden");
    } else el.classList.add("hidden");
  });
  document.querySelectorAll('[data-nav-badge="stock"]').forEach((el) => {
    if (stockAlerts > 0) {
      el.textContent = stockAlerts > 99 ? "99+" : String(stockAlerts);
      el.classList.remove("hidden");
    } else el.classList.add("hidden");
  });
}

async function adjustStock(variantId, type, qty, reason) {
  const { data: inv, error: invErr } = await sb.from("inventory").select("on_hand").eq("variant_id", variantId).maybeSingle();
  if (invErr) throw invErr;
  const current = inv?.on_hand ?? 0;
  if (!inv) await sb.from("inventory").insert({ variant_id: variantId, on_hand: 0 });
  const next = type === "in" ? current + qty : type === "out" ? Math.max(0, current - qty) : qty;
  const { error: updErr } = await sb.from("inventory").update({ on_hand: next }).eq("variant_id", variantId);
  if (updErr) throw updErr;
  await sb.from("inventory_movements").insert({
    variant_id: variantId,
    movement_type: type,
    qty,
    reason: reason || "admin dashboard",
    reference_type: "manual"
  });
}

async function ensureAdmin(userId) {
  const { data, error } = await sb.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return !!data;
}

function setAuthUi(isIn, email = "") {
  document.getElementById("auth-layout")?.classList.toggle("hidden", isIn);
  document.getElementById("login-card")?.classList.toggle("hidden", isIn);
  const dash = document.getElementById("dashboard");
  dash?.classList.toggle("hidden", !isIn);
  dash?.classList.toggle("flex", isIn);
  document.getElementById("pre-dash-header")?.classList.toggle("hidden", isIn);
  const te = document.getElementById("toolbar-email");
  if (te && email) te.textContent = email;
  if (!isIn) closeSidebar();
}

const ctx = {
  sb,
  state,
  getRoute: () => parseHash(),
  updateNavBadges,
  adjustStock,
  onHashRoute: null,
  renderOnboarding: null,
  refreshProductsTab: null,
  refreshStockTab: null,
  refreshOrdersTab: null,
  refreshAnalytics: null,
  refreshCmsTab: null
};

const products = createProductsModule(ctx);
const orders = createOrdersModule(ctx);
const stock = createStockModule(ctx);
const cms = createCmsModule(ctx);

ctx.refreshProductsTab = () => products.refreshProductsTab();
ctx.refreshStockTab = () => stock.refreshStockTab();
ctx.refreshOrdersTab = () => orders.refreshOrdersTab();

const analytics = createAnalyticsModule(ctx);
const palette = createPaletteModule(ctx);

ctx.refreshAnalytics = () => analytics.refreshAnalytics();
ctx.refreshCmsTab = () => cms.refreshCmsTab();
ctx.renderOnboarding = () => analytics.renderOnboarding();

function activateTab(tab, route) {
  if (!VALID_TABS.includes(tab)) tab = "analytics";
  currentTab = tab;
  document.querySelectorAll(".sidebar-nav[data-tab]").forEach((b) => {
    b.classList.toggle("sidebar-nav-active", b.dataset.tab === tab);
    b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`tab-${tab}`)?.classList.remove("hidden");
  updateTopbar(route, { productsCache: state.productsCache });

  if (tab === "analytics") analytics.refreshAnalytics();
  if (tab === "products") {
    if (route.sub === "new") products.renderProductForm(null);
    else if (route.sub === "edit" && route.id) products.renderProductForm(route.id);
    else products.renderProductsList();
  }
  if (tab === "orders") orders.refreshOrdersTab();
  if (tab === "stock") {
    if (!state.variantsCache.length) stock.refreshStockTab();
    else stock.renderStockTable();
  }
  if (tab === "cms") {
    cms.refreshCmsTab();
    const editorMode = route.sub === "editor";
    document.getElementById("dashboard")?.classList.toggle("theme-studio-active", editorMode);
    document.body.classList.toggle("theme-studio-active", editorMode);
    if (editorMode && !isSidebarCollapsed()) setSidebarCollapsed(true);
  }
}

function onHashRoute() {
  const route = parseHash();
  activateTab(route.tab, route);
  closeSidebar();
}

ctx.onHashRoute = onHashRoute;

wireImageDropzone(sb, {
  zoneId: "pf-image-dropzone",
  fileInputId: "pf-image-files",
  textareaId: "pf-image-urls",
  statusId: "pf-image-upload-status",
  bucket: STORAGE_BUCKET
});

products.bindProductsEvents();
orders.bindOrdersEvents();
stock.bindStockEvents();
cms.bindCmsEvents();
analytics.bindAnalyticsEvents();
palette.bindPaletteEvents();

document.querySelectorAll(".sidebar-nav[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    location.hash = `#/${btn.dataset.tab}`;
  });
});
document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
  sidebarEl?.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
});
document.getElementById("sidebar-close")?.addEventListener("click", closeSidebar);
document.querySelectorAll(".sidebar-collapse-btn").forEach((btn) => {
  btn.addEventListener("click", toggleSidebarCollapsed);
});
initSidebarCollapsed();
backdropEl?.addEventListener("click", closeSidebar);
window.addEventListener("hashchange", onHashRoute);

document.getElementById("toolbar-breadcrumb")?.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='#']");
  if (a) {
    e.preventDefault();
    location.hash = a.getAttribute("href");
  }
});

document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!(await ensureAdmin(data.user.id))) {
      await sb.auth.signOut();
      throw new Error("Utilisateur non autorisé (admin_users).");
    }
    setAuthUi(true, email);
    initSidebarCollapsed();
    if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/analytics");
    await products.refreshProductsTab();
    await stock.refreshStockTab();
    await orders.refreshOrdersTab();
    await analytics.refreshAnalytics();
    await cms.refreshCmsTab();
    onHashRoute();
  } catch (err) {
    feedback(err.message || "Erreur connexion", true);
  }
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
  await sb.auth.signOut();
  setAuthUi(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (palette.isOpen()) {
    palette.closePalette();
    return;
  }
  if (document.getElementById("stock-panel")?.classList.contains("is-open")) {
    stock.closeStockPanel();
    return;
  }
  const help = document.getElementById("admin-help-dialog");
  if (help && !help.classList.contains("hidden")) {
    help.classList.add("hidden");
    return;
  }
  if (sidebarEl?.classList.contains("sidebar-open")) closeSidebar();
});

document.getElementById("help-dialog-close")?.addEventListener("click", () => {
  document.getElementById("admin-help-dialog")?.classList.add("hidden");
});

const { data: sess } = await sb.auth.getSession();
if (sess.session?.user && (await ensureAdmin(sess.session.user.id))) {
  setAuthUi(true, sess.session.user.email || "");
  initSidebarCollapsed();
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/analytics");
  await products.refreshProductsTab();
  await stock.refreshStockTab();
  await orders.refreshOrdersTab();
  await analytics.refreshAnalytics();
  await cms.refreshCmsTab();
  onHashRoute();
}

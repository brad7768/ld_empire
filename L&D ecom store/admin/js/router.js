export const TAB_LABELS = {
  analytics: "Accueil",
  orders: "Commandes",
  products: "Produits",
  stock: "Stock",
  cms: "Contenu",
  notes: "Ops"
};

export const TAB_SUBTITLES = {
  analytics: "Vue d\u2019ensemble \u00b7 ventes et alertes",
  orders: "Suivi des commandes clients",
  products: "Catalogue et variantes",
  stock: "Inventaire et mouvements",
  cms: "Éditeur boutique · personnalisation en direct",
  notes: "Notes techniques"
};

export const VALID_TABS = Object.keys(TAB_LABELS);

/** @returns {{ tab: string, sub: string|null, id: string|null }} */
export function parseHash() {
  const raw = (location.hash || "#/analytics").replace(/^#/, "").replace(/^\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  const tab = parts[0] && VALID_TABS.includes(parts[0]) ? parts[0] : "analytics";
  let sub = null;
  let id = null;
  if (tab === "products" && parts[1]) {
    sub = parts[1] === "new" ? "new" : "edit";
    if (sub === "edit") id = parts[1];
  } else if (tab === "orders" && parts[1]) {
    sub = "detail";
    id = decodeURIComponent(parts[1]);
  } else if (tab === "cms") {
    sub = "editor";
  }
  return { tab, sub, id };
}

export function buildHash(tab, { sub, id } = {}) {
  let h = `#/${tab}`;
  if (tab === "products") {
    if (sub === "new") h += "/new";
    else if (sub === "edit" && id) h += `/${id}`;
  } else if (tab === "orders" && sub === "detail" && id) {
    h += `/${encodeURIComponent(String(id))}`;
  } else if (tab === "cms") {
    h += "/editor";
  }
  return h;
}

export function setRouteHash(tab, opts = {}) {
  const next = buildHash(tab, opts);
  if (location.hash !== next) location.hash = next;
}

export function updateTopbar(route, ctx) {
  const { tab, sub, id } = route;
  const breadcrumb = document.getElementById("toolbar-breadcrumb");
  const titleEl = document.getElementById("toolbar-title");
  const subEl = document.getElementById("toolbar-subtitle");

  let title = TAB_LABELS[tab] || "Admin";
  let crumbs = [];
  let subtitle = TAB_SUBTITLES[tab] || "";

  if (tab === "products") {
    if (sub === "new") {
      title = "Nouveau produit";
      crumbs = [{ label: "Produits", hash: "#/products" }, { label: "Nouveau" }];
      subtitle = "Créer une fiche catalogue";
    } else if (sub === "edit" && id) {
      const p = ctx.productsCache?.find((x) => String(x.id) === String(id));
      title = p?.name || "Modifier le produit";
      crumbs = [{ label: "Produits", hash: "#/products" }, { label: title }];
      subtitle = "Détails, médias et variantes";
    } else {
      crumbs = [{ label: "Produits" }];
    }
  } else if (tab === "orders" && sub === "detail" && id) {
    title = `Commande ${id}`;
    crumbs = [{ label: "Commandes", hash: "#/orders" }, { label: id }];
    subtitle = "Détail et statut";
  } else if (tab === "orders") {
    crumbs = [{ label: "Commandes" }];
  } else if (tab === "cms") {
    title = "Éditeur boutique";
    subtitle = TAB_SUBTITLES.cms;
    crumbs = [];
  }

  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  if (breadcrumb) {
    breadcrumb.innerHTML = crumbs
      .map((c, i) => {
        const sep = i > 0 ? '<span class="text-stone-300 mx-1.5">›</span>' : "";
        if (c.hash) {
          return `${sep}<a href="${c.hash}" class="text-stone-500 hover:text-stone-800">${c.label}</a>`;
        }
        return `${sep}<span class="text-stone-700 font-medium">${c.label}</span>`;
      })
      .join("");
    breadcrumb.classList.toggle("hidden", crumbs.length < 2);
  }
}

export function navigateToTab(tab, opts = {}, ctx) {
  const next = buildHash(tab, opts);
  if (location.hash === next) ctx.onHashRoute();
  else setRouteHash(tab, opts);
}

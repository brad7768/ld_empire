/** @typedef {'success'|'error'|'info'} ToastType */

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const ORDER_STATUS_LABELS = {
  pending: "En attente",
  paid: "Payée",
  processing: "En traitement",
  shipped: "Expédiée",
  cancelled: "Annulée",
  refunded: "Remboursée"
};

export function statusBadge(status) {
  const map = {
    pending: "admin-badge admin-badge-pending",
    paid: "admin-badge admin-badge-success",
    processing: "admin-badge admin-badge-info",
    shipped: "admin-badge admin-badge-info",
    cancelled: "admin-badge admin-badge-muted",
    refunded: "admin-badge admin-badge-muted"
  };
  const cls = map[status] || "admin-badge admin-badge-muted";
  const label = ORDER_STATUS_LABELS[status] || status;
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

export function productStatusBadge(active) {
  return active
    ? '<span class="admin-badge admin-badge-success">Actif</span>'
    : '<span class="admin-badge admin-badge-muted">Inactif</span>';
}

export function stockStateBadge(qty, thr) {
  if (qty === 0) return '<span class="admin-badge admin-badge-danger">Rupture</span>';
  if (qty <= thr) return '<span class="admin-badge admin-badge-pending">Faible</span>';
  return '<span class="admin-badge admin-badge-success">OK</span>';
}

export function toast(message, type = "info") {
  const root = document.getElementById("admin-toasts");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `admin-toast admin-toast-${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

export function emptyState({ title, body, ctaLabel, ctaHref }) {
  const cta = ctaLabel && ctaHref
    ? `<a href="${escapeHtml(ctaHref)}" class="admin-btn-primary mt-4 inline-flex">${escapeHtml(ctaLabel)}</a>`
    : "";
  return `<div class="admin-empty-state">
    <p class="admin-empty-title">${escapeHtml(title)}</p>
    <p class="admin-empty-body">${escapeHtml(body || "")}</p>
    ${cta}
  </div>`;
}

export function skeletonRows(cols, rows = 5) {
  return Array.from({ length: rows }, () => `
    <tr class="border-t border-stone-100">
      ${Array.from({ length: cols }, () => '<td class="px-4 py-3"><div class="admin-skeleton h-4 w-full max-w-[12rem]"></div></td>').join("")}
    </tr>`).join("");
}

export function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const wrap = input.closest("[data-field-wrap]") || input.parentElement;
  let err = wrap?.querySelector(".admin-field-error");
  if (message) {
    input.classList.add("has-error");
    if (!err && wrap) {
      err = document.createElement("p");
      err.className = "admin-field-error";
      wrap.appendChild(err);
    }
    if (err) err.textContent = message;
  } else {
    input.classList.remove("has-error");
    err?.remove();
  }
}

export function slugify(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatMoneyCents(cents) {
  return (Number(cents) / 100).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function confirmDialog({ title, body, confirmLabel = "Confirmer", danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById("admin-confirm-dialog");
    if (!dlg) {
      resolve(window.confirm(`${title}\n\n${body}`));
      return;
    }
    document.getElementById("confirm-dialog-title").textContent = title;
    document.getElementById("confirm-dialog-body").textContent = body;
    const okBtn = document.getElementById("confirm-dialog-ok");
    const cancelBtn = document.getElementById("confirm-dialog-cancel");
    okBtn.textContent = confirmLabel;
    okBtn.className = danger ? "admin-btn-primary admin-btn-danger" : "admin-btn-primary";
    const finish = (val) => {
      dlg.classList.add("hidden");
      dlg.setAttribute("aria-hidden", "true");
      resolve(val);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => {
      if (e.target === dlg) finish(false);
    };
    dlg.classList.remove("hidden");
    dlg.setAttribute("aria-hidden", "false");
    okBtn.addEventListener("click", onOk, { once: true });
    cancelBtn.addEventListener("click", onCancel, { once: true });
    dlg.addEventListener("click", onBackdrop, { once: true });
  });
}

const stickyBarState = {
  onSave: null,
  onCancel: null,
  saveLabel: "Enregistrer"
};

export function setStickyBar({ visible, dirty, onSave, onCancel, saveLabel }) {
  const bar = document.getElementById("admin-sticky-bar");
  if (!bar) return;
  bar.classList.toggle("hidden", !visible);
  const dirtyEl = document.getElementById("sticky-dirty");
  if (dirtyEl && dirty !== undefined) dirtyEl.classList.toggle("hidden", !dirty);
  if (onSave !== undefined) stickyBarState.onSave = onSave;
  if (onCancel !== undefined) stickyBarState.onCancel = onCancel;
  if (saveLabel !== undefined) stickyBarState.saveLabel = saveLabel;
  const saveBtn = document.getElementById("sticky-save");
  const cancelBtn = document.getElementById("sticky-cancel");
  if (saveBtn) {
    saveBtn.textContent = stickyBarState.saveLabel;
    saveBtn.onclick = stickyBarState.onSave;
    saveBtn.disabled = false;
  }
  if (cancelBtn && stickyBarState.onCancel) cancelBtn.onclick = stickyBarState.onCancel;
}

export function setButtonLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle("is-loading", loading);
}

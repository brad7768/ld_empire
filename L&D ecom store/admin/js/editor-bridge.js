const DEBOUNCE_MS = 200;

export function createEditorBridge(iframeEl) {
  let ready = false;
  let readyCallbacks = [];
  let debounceTimer = null;
  const pendingPatches = [];

  function getPreviewOrigin() {
    try {
      const src = iframeEl?.src || "";
      if (!src) return null;
      return new URL(src, window.location.href).origin;
    } catch {
      return null;
    }
  }

  function post(msg) {
    const origin = getPreviewOrigin();
    if (!iframeEl?.contentWindow || !origin) return;
    iframeEl.contentWindow.postMessage({ source: "ld-admin", ...msg }, origin);
  }

  function onMessage(ev) {
    const origin = getPreviewOrigin();
    if (!origin || ev.origin !== origin) return;
    const data = ev.data;
    if (!data || data.source !== "ld-storefront") return;
    if (data.type === "READY") {
      ready = true;
      readyCallbacks.forEach((fn) => fn());
      readyCallbacks = [];
      while (pendingPatches.length) {
        post(pendingPatches.shift());
      }
    }
    if (data.type === "SELECTED" && bridge.onSelected) {
      bridge.onSelected(data);
    }
  }

  window.addEventListener("message", onMessage);

  const bridge = {
    onSelected: null,

    whenReady(fn) {
      if (ready) fn();
      else readyCallbacks.push(fn);
    },

    resetReady() {
      ready = false;
    },

    patchI18n(key, value) {
      const msg = { type: "PATCH_I18N", key, value };
      if (!ready) pendingPatches.push(msg);
      else post(msg);
    },

    patchSection(sectionId, field, value) {
      const msg = { type: "PATCH_SECTION", sectionId, field, value };
      if (!ready) pendingPatches.push(msg);
      else post(msg);
    },

    patchTheme(theme) {
      post({ type: "PATCH_THEME", theme });
    },

    patchHeroImages(urls) {
      post({ type: "PATCH_HERO_IMAGES", urls });
    },

    patchSectionsMeta(meta) {
      post({ type: "PATCH_SECTIONS_META", meta });
    },

    navigate(page) {
      post({ type: "NAVIGATE", page });
    },

    highlight(selector) {
      post({ type: "HIGHLIGHT", selector });
    },

    setPreviewDevice(mode) {
      post({ type: "PREVIEW_DEVICE", mode });
    },

    debouncedPatch(fn) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fn, DEBOUNCE_MS);
    },

    destroy() {
      window.removeEventListener("message", onMessage);
      clearTimeout(debounceTimer);
    }
  };

  return bridge;
}

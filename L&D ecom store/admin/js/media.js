export function sanitizeMediaFilename(name) {
  const base = String(name || "")
    .replace(/^.*[/\\]/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 96);
  return base || "image";
}

export function normalizeProductImageUrls(raw) {
  if (Array.isArray(raw)) return raw.map((u) => String(u).trim()).filter(Boolean);
  return [];
}

export function appendProductImageUrls(textareaId, newUrls) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  const lines = (ta.value || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set(lines);
  for (const u of newUrls) {
    if (u && !seen.has(u)) {
      seen.add(u);
      lines.push(u);
    }
  }
  ta.value = lines.join("\n");
}

export function wireImageDropzone(sb, { zoneId, fileInputId, textareaId, statusId, bucket }) {
  const dz = document.getElementById(zoneId);
  const fi = document.getElementById(fileInputId);
  if (!dz || !fi) return;

  const upload = async (fileList) => {
    const statusEl = document.getElementById(statusId);
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const urls = [];
    const errors = [];
    const MAX = 5 * 1024 * 1024;
    statusEl?.classList.remove("hidden");
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX) {
        errors.push(`${file.name}: max 5 Mo`);
        continue;
      }
      if (statusEl) statusEl.textContent = `Envoi ${i + 1}/${files.length}…`;
      const path = `products/${crypto.randomUUID()}-${sanitizeMediaFilename(file.name)}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg"
      });
      if (error) {
        errors.push(`${file.name}: ${error.message}`);
        continue;
      }
      const { data } = sb.storage.from(bucket).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    appendProductImageUrls(textareaId, urls);
    if (errors.length) {
      const { toast } = await import("./ui.js");
      toast(`Échec upload: ${errors[0]}`, "error");
    }
    if (urls.length && statusEl) {
      statusEl.textContent = `${urls.length} image(s) ajoutée(s).`;
      setTimeout(() => statusEl.classList.add("hidden"), 5000);
    }
  };

  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fi.click();
    }
  });
  ["dragenter", "dragover"].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("ring-2", "ring-stone-400/30");
    });
  });
  dz.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dz.classList.remove("ring-2", "ring-stone-400/30");
  });
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("ring-2", "ring-stone-400/30");
    upload(e.dataTransfer?.files);
  });
  fi.addEventListener("change", () => {
    upload(fi.files);
    fi.value = "";
  });
}

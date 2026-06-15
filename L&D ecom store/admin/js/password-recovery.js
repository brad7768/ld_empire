const SESSION_CFG_KEY = "LD_SUPABASE_SESSION";

try {
  const raw = sessionStorage.getItem(SESSION_CFG_KEY);
  if (raw) window.LD_SUPABASE = Object.assign({}, window.LD_SUPABASE || {}, JSON.parse(raw));
} catch (_) {}

export function getSupabaseConfig() {
  return window.LD_SUPABASE || {};
}

export function resetPasswordRedirectUrl() {
  return `${window.location.origin}/admin/reset-password.html`;
}

export async function createSupabaseClient() {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Configuration Supabase manquante.");
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createClient(cfg.url, cfg.anonKey);
}

export function showFeedback(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  el.classList.toggle("text-red-600", isError);
  el.classList.toggle("text-emerald-700", !isError);
}

export function mapAuthError(message) {
  const m = String(message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Identifiants incorrects.";
  if (m.includes("email not confirmed")) return "Confirmez votre email avant de vous connecter.";
  if (m.includes("user not found")) return "Aucun compte trouvé pour cet email.";
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  if (m.includes("password should be at least")) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (m.includes("same as the old password")) return "Choisissez un mot de passe différent de l'ancien.";
  if (m.includes("session") && m.includes("expired")) {
    return "Ce lien a expiré. Demandez un nouveau lien de réinitialisation.";
  }
  return message || "Une erreur est survenue.";
}

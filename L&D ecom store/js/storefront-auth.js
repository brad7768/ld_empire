/**
 * Comptes clients Supabase (distinct de l'admin).
 */
(function (global) {
  let currentUser = null;
  let listeners = [];

  function onAuthChange(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((f) => f !== fn);
    };
  }

  function notify(user) {
    currentUser = user;
    listeners.forEach((fn) => {
      try {
        fn(user);
      } catch (e) {
        console.warn("[L&D] auth listener:", e);
      }
    });
  }

  async function initAuth(sb) {
    if (!sb) return null;

    const { data } = await sb.auth.getSession();
    currentUser = data?.session?.user ?? null;

    sb.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      if (event === "SIGNED_IN" && user) {
        await global.LD_CART?.mergeGuestCartOnLogin?.(sb);
      }
      notify(user);
    });

    return currentUser;
  }

  async function signUp(sb, email, password, firstName, lastName) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName || "",
          last_name: lastName || "",
        },
      },
    });
    if (error) throw error;

    if (data.user) {
      await sb.from("customer_profiles").upsert({
        user_id: data.user.id,
        first_name: firstName || null,
        last_name: lastName || null,
        updated_at: new Date().toISOString(),
      });
    }
    return data;
  }

  async function signIn(sb, email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await global.LD_CART?.mergeGuestCartOnLogin?.(sb);
    return data;
  }

  async function signOut(sb) {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }

  function getUser() {
    return currentUser;
  }

  function userLabel(user) {
    if (!user) return "";
    const meta = user.user_metadata || {};
    const name = [meta.first_name, meta.last_name].filter(Boolean).join(" ");
    return name || user.email || "";
  }

  global.LD_AUTH = {
    initAuth,
    signUp,
    signIn,
    signOut,
    getUser,
    userLabel,
    onAuthChange,
  };
})(window);

// Capa de autenticación sobre Supabase (patrón USERS.md).
//
//   - Supabase Auth maneja la cuenta (email + password, sesiones, hash).
//   - `profiles` guarda username, display_name, role, tier, status.
//   - El perfil se crea solo (trigger) al registrarse.

import { supabase } from "./supabaseClient";

function toPublicUser(profile, authEmail) {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    email: authEmail || profile.email,
    role: profile.role,
    tier: profile.tier,
    status: profile.status,
  };
}

function translateError(msg) {
  if (/already registered|already exists|duplicate|saving new user/i.test(msg)) {
    return "Ese usuario o email ya está registrado.";
  }
  if (/6 characters|password/i.test(msg)) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  return msg;
}

export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) return null;
  return toPublicUser(profile, session.user.email);
}

export async function register({ username, email, password }) {
  username = (username || "").trim();
  email = (email || "").trim();
  if (!username || !email || !password) {
    throw new Error("Completá usuario, email y contraseña.");
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw new Error(translateError(error.message));
  if (!data.session) {
    throw new Error("Revisá tu email para confirmar la cuenta e iniciá sesión.");
  }
  return await getCurrentUser();
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo:
        typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw new Error(error.message);
}

export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({
    email: (email || "").trim(),
    password,
  });
  if (error) throw new Error("Email o contraseña incorrectos.");
  return await getCurrentUser();
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Prefs del propio usuario (whitelist: solo display_name).
export async function setUserPrefs(userId, patch) {
  const fields = {};
  if (patch.displayName !== undefined)
    fields.display_name = patch.displayName.trim();
  if (Object.keys(fields).length === 0) return null;
  const { error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", userId);
  if (error) throw error;
  return await getCurrentUser();
}

export async function changePassword({ email, currentPassword, newPassword }) {
  if (!newPassword) throw new Error("Ingresá la nueva contraseña.");
  const { error: e1 } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (e1) throw new Error("La contraseña actual es incorrecta.");
  const { error: e2 } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (e2) throw new Error(translateError(e2.message));
}

// ── Administración (RLS: solo admins) ──
export async function listUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("username");
  if (error) throw error;
  return data.map((p) => toPublicUser(p, p.email));
}

export async function updateUser(id, patch) {
  const fields = {};
  if (patch.username !== undefined) fields.username = patch.username.trim();
  if (patch.displayName !== undefined)
    fields.display_name = patch.displayName.trim();
  const { error } = await supabase.from("profiles").update(fields).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe un usuario con ese nombre.");
    }
    throw new Error(error.message);
  }
}

const TIERS = ["free", "pro", "premium"];

export async function setUserTier(id, tier) {
  if (!TIERS.includes(tier)) throw new Error("Tier inválido.");
  const { error } = await supabase
    .from("profiles")
    .update({ tier })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Borrado pasa por la ruta server-side (service_role). El navegador solo
// manda su token; el servidor valida permisos.
async function callDeleteUser(targetId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión activa.");
  const res = await fetch("/api/admin/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ targetId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "No se pudo eliminar el usuario.");
}

export async function deleteAccount() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión activa.");
  await callDeleteUser(session.user.id);
}

export async function adminDeleteUser(id) {
  await callDeleteUser(id);
}

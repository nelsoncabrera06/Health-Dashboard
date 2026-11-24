"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";
import {
  getCurrentUser,
  login,
  register,
  setUserPrefs,
  signInWithGoogle as authSignInWithGoogle,
} from "../lib/auth";
import { clearDemoSandbox } from "../lib/demoSandbox";

const AuthContext = createContext(null);

// Cuenta demo pública (ver .env.example). Si no está configurada,
// la landing cae en el login normal.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
const CAN_DEMO = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    // Con catch: si Supabase falla (ej. vars ausentes en el bundle),
    // la app muestra el login en vez de colgarse en "Cargando…".
    getCurrentUser()
      .catch(() => null)
      .then((u) => {
        if (!active) return;
        setUser(u);
        setReady(true);
      });
    const { data: sub } = getSupabase().auth.onAuthStateChange(() => {
      getCurrentUser()
        .catch(() => null)
        .then((u) => {
          if (active) setUser(u);
        });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (credentials, mode = "login") => {
    const u =
      mode === "register"
        ? await register(credentials)
        : await login(credentials);
    setUser(u);
    return u;
  };

  const signInWithGoogle = () => authSignInWithGoogle();

  const signInDemo = async () => {
    if (!CAN_DEMO) throw new Error("La demo no está configurada.");
    // Sandbox limpio en cada entrada: lo que probó un visitante anterior en
    // esta misma pestaña no se mezcla con lo del siguiente.
    clearDemoSandbox();
    return signIn({ identifier: DEMO_EMAIL, password: DEMO_PASSWORD }, "login");
  };

  const signOut = async () => {
    await getSupabase().auth.signOut();
    // "Se cierra sesión, se borran los datos de la demo."
    clearDemoSandbox();
    setUser(null);
  };

  const refresh = async () => {
    const u = await getCurrentUser();
    setUser(u);
  };

  const updatePrefs = async (patch) => {
    if (!user) return;
    const updated = await setUserPrefs(user.id, patch);
    if (updated) setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{ user, ready, signIn, signInWithGoogle, signInDemo, canDemo: CAN_DEMO, signOut, refresh, updatePrefs }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

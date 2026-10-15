"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./AuthContext";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function AuthModal({ open, onClose }) {
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => {
    setUsername("");
    setIdentifier("");
    setEmail("");
    setPassword("");
    setConfirm("");
    setError("");
  };
  const close = () => {
    reset();
    onClose();
  };
  const switchMode = (next) => {
    setMode(next);
    setError("");
  };
  const handleGoogle = async () => {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await signIn({ username, email, password }, "register");
      } else {
        await signIn({ identifier, password }, "login");
      }
      close();
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay" onClick={close}>
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="auth-close" onClick={close} aria-label="Cerrar">
          ×
        </button>
        <h2 className="auth-title">
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h2>
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Registrarme
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label className="auth-field">
              <span>Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </label>
          )}
          {mode === "login" ? (
            <label className="auth-field">
              <span>Email o usuario</span>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </label>
          ) : (
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
          )}
          <label className="auth-field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {mode === "register" && (
            <label className="auth-field">
              <span>Confirmar contraseña</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        <div className="auth-divider">
          <span>o</span>
        </div>
        <button
          type="button"
          className="auth-google"
          onClick={handleGoogle}
          disabled={busy}
        >
          <GoogleIcon />
          Continuar con Google
        </button>
        <p style={{ textAlign: "center", marginTop: 12 }}>
          <Link
            href="/"
            onClick={close}
            style={{ fontSize: 13 }}
          >
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}

"use client";

// Bloque de código con botón "Copiar".
//
// Vive separado de /developers porque esa página es un server component (para
// tener metadata e indexarse): `navigator.clipboard` solo existe en el cliente.
import { useState } from "react";

export default function CopyCode({ code, label }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permisos de portapapeles el usuario puede seleccionar el texto.
      setCopied(false);
    }
  };

  return (
    <div className="dev-code">
      {label && <div className="dev-code-label">{label}</div>}
      <div className="dev-code-row">
        <pre>
          <code>{code}</code>
        </pre>
        <button type="button" className="dev-copy" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

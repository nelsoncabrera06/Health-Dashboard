// Adjuntos de foto del chat (paso 11). Sin JSX: testeable en node.
// La compresión usa Image + canvas, o sea solo corre en el navegador.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function validateImageFile(f) {
  if (!f || typeof f.type !== "string" || !f.type.startsWith("image/"))
    return "Ese archivo no es una imagen.";
  if (f.size > MAX_PHOTO_BYTES) return "La foto es muy pesada (máx. 10 MB).";
  return "";
}

// Achica la imagen en el cliente para no mandar el original de la cámara.
// Devuelve data URL JPEG (máx 1024px, calidad 0.82).
export function compressImage(file, maxDim = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

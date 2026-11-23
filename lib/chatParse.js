// Parseo de la respuesta del modelo en /api/chat.
// El modelo no siempre respeta el formato: envuelve las líneas en markdown
// (`**ESTIMACIÓN:** {...}`), usa claves en español o coma decimal. Todo se
// tolera acá para que la ruta y la UI reciban datos limpios.
// Vive fuera de app/api/chat/route.js porque un route solo puede exportar
// métodos HTTP, y así el parseo se puede probar con node sin levantar Next.

const stripMd = (s) =>
  s
    .replace(/\*\*/g, "")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`/g, "")
    .replace(/\n{3,}/g, "\n\n");

const num = (o, ...keys) => {
  for (const k of keys) if (isFinite(+o[k])) return Math.round(+o[k]);
  return 0;
};

// Las líneas estructuradas van solas en su renglón y nunca se le muestran al
// usuario, matchee o no el JSON.
const dropLines = (s) =>
  s
    .replace(/^.*ESTIMACI[ÓO]N:?\s*\{[^}]*\}\s*$/gim, "")
    .replace(/^.*\bPESO:.*$/gim, "");

export function parseAssistantText(text) {
  const norm = text.replace(/[*`]/g, "");

  const mLine =
    norm.match(/ESTIMACI[ÓO]N:?\s*(\{[^{}]*\})/i) ||
    norm.match(/(\{[^{}]*"(calories|calorias|kcal)"[^{}]*\})/i);

  let estimate = null;
  if (mLine) {
    try {
      const e = JSON.parse(mLine[1]);
      // OJO: con `??` solo, NaN no es nullish y los alias en español (sin
      // clave "calories") no matcheaban nunca. Se resuelve la clave primero.
      const kcal = +(e?.calories ?? e?.calorias ?? e?.kcal);
      if (e && isFinite(kcal)) {
        estimate = {
          meal: String(e.meal || e.comida || e.nombre || "Comida"),
          calories: num(e, "calories", "calorias", "kcal"),
          protein: num(e, "protein", "proteinas", "proteina"),
          carbs: num(e, "carbs", "carbos", "carbohidratos", "hidratos"),
          fat: num(e, "fat", "grasas", "grasa"),
        };
      }
    } catch {
      // Si el JSON viene roto, se devuelve el texto pelado.
    }
  }

  // Peso corporal: `PESO: {"weight": 113.5}`. Se acepta también el número
  // pelado (`PESO: 113,5 kg`) por si el modelo no arma el JSON.
  // OJO con el `:`, es obligatorio en las dos variantes: sin él, un texto tipo
  // "peso 200 gramos" se tomaría como un peso de 200 kg.
  const wLine =
    norm.match(/\bPESO:\s*(\{[^{}]*\})/i) ||
    norm.match(/\bPESO:\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|kilos?)?/i);

  let weight = null;
  if (wLine) {
    let kg = NaN;
    if (wLine[1].startsWith("{")) {
      try {
        const w = JSON.parse(wLine[1]);
        kg = +(w.weight ?? w.peso ?? w.kg);
      } catch {
        // JSON roto: queda el texto pelado.
      }
    } else {
      kg = +wLine[1].replace(",", ".");
    }
    // Mismo rango que la API (lib/api/payloads.js): 20 a 400 kg.
    if (isFinite(kg) && kg >= 20 && kg <= 400)
      weight = { weight: Math.round(kg * 10) / 10 };
  }

  // Se limpian las líneas sobre `norm` (sin markdown): el modelo suele mandar
  // `**PESO:** {...}` y con los asteriscos el ancla no matcheaba.
  let reply = dropLines(norm);
  // Si la línea vino envuelta o inline (no sola), igual se saca el objeto.
  if (mLine) reply = reply.replace(mLine[1], "");
  if (wLine && wLine[1].startsWith("{")) reply = reply.replace(wLine[1], "");

  reply = stripMd(reply);
  if (mLine || wLine) reply = reply.replace(/[-\s:]+$/, "");
  reply = reply.trim();

  return { reply, estimate, weight };
}

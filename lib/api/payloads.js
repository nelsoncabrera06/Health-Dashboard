// Parseo de los cuerpos de escritura, compartido por REST (/api/v1) y MCP.
//
// Mismo criterio en los dos lados: si el agente manda un peso de 5 kg o una
// fecha imposible, la respuesta es la misma. Los errores vuelven como
// `{ ok:false, code, message }` para que cada transporte los adapte (400 en
// REST, `isError` en MCP).
import { clientRef, collect, dateOnly, num, text, timestamp } from "./validate";

// Comida: nombre y calorías obligatorios; macros opcionales (0 si no vienen).
export function parseMeal(body) {
  const b = body || {};
  return collect({
    name: text(b.name, { field: "name", max: 120 }),
    calories: num(b.calories, { field: "calories", min: 0, max: 10000 }),
    protein: num(b.protein, { field: "protein", min: 0, max: 2000, required: false }),
    carbs: num(b.carbs, { field: "carbs", min: 0, max: 2000, required: false }),
    fat: num(b.fat, { field: "fat", min: 0, max: 2000, required: false }),
    eatenAt: timestamp(b.eaten_at, { field: "eaten_at" }),
    clientRef: clientRef(b.client_ref),
  });
}

// Peso: date-only y un registro por día (upsert).
export function parseWeight(body) {
  const b = body || {};
  return collect({
    weightKg: num(b.weight_kg, { field: "weight_kg", min: 20, max: 400 }),
    measuredAt: dateOnly(b.measured_at, { field: "measured_at" }),
  });
}

// Ejercicio: tipo obligatorio, el resto opcional.
export function parseWorkout(body) {
  const b = body || {};
  return collect({
    type: text(b.type, { field: "type", max: 60 }),
    durationMin: num(b.duration_min, {
      field: "duration_min",
      min: 0,
      max: 1440, // un día entero: más que eso es un error de unidad
      required: false,
    }),
    caloriesBurned: num(b.calories_burned, {
      field: "calories_burned",
      min: 0,
      max: 10000,
      required: false,
    }),
    notes: text(b.notes, { field: "notes", max: 500, required: false }),
    startedAt: timestamp(b.started_at, { field: "started_at" }),
  });
}

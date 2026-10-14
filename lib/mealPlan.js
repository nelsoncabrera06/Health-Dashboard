// Plan de comidas estático (copiado de data.json del server original).
// TODO: hacerlo editable por usuario (tabla en Supabase) en vez de hardcodeado.
export const MEAL_PLAN = {
  weekdays: {
    desayuno: {
      desc: "Avena + leche + banana + 2 huevos revueltos",
      kcal: 400,
      note: "O: yogur griego + fruta + tostadas con pavo",
    },
    almuerzo: {
      desc: "Proteína 150g (pollo/carne/atún) + arroz o pasta + ensalada",
      kcal: 700,
      note: "El plato más grande del día",
    },
    pre_gym: {
      desc: "Banana + nueces (solo días de gym)",
      kcal: 200,
      note: "O: yogur griego",
    },
    cena: {
      desc: "Proteína + verduras salteadas + poco arroz",
      kcal: 600,
      note: "Menos carbos que el almuerzo. Ej: salmón + brócoli",
    },
  },
  weekends: {
    note: "Más relajado — pizza, cerveza, vino son parte del plan",
    tip: "Si cenás pesado, desayuno y almuerzo más livianos",
    target_kcal: "2600-2800 (ok)",
  },
  tips: {
    yogur_griego:
      "Kreikkalainen jogurtti (Valio/Arla en K-Market). ~10g proteína/100g. Natural, blanco, espeso. Buen snack de emergencia.",
    proteina:
      "Siempre proteína en cada comida — pollo, huevo, atún, yogur griego, queso cottage (raejuusto en finés)",
    hidratacion:
      "Reemplazá las bebidas azucaradas (San Pellegrino) por agua con gas sin sabor → ahorrás 120 kcal gratis",
  },
  habitos: {
    el_sandwich:
      "⚠️ Cuidado — ~400-420 kcal por sándwich de jamón/queso/salame. Es tu mayor riesgo calórico del día. Intentá reemplazarlo con yogur griego, huevo duro o fruta cuando el hambre pica a las 18hs.",
    desayuno_tipico:
      "✅ Avena + huevo duro + café con leche = sólido (~500 kcal, buena proteína). El sándwich de mañana lo sube a ~810 kcal — no es un desastre pero te deja poco margen.",
    mate: "✅ Mate y café solos = 0 kcal. Con leche ~80 kcal. Perfecto para calmar hambre entre comidas.",
    snack_emergencia:
      "🆘 Cuando te pica el hambre a las 18hs: 1 huevo duro (~80 kcal), 1 fruta (~60-80 kcal), yogur griego (~100 kcal). Cualquiera de estos vs 1 sándwich (420 kcal) = 340 kcal de diferencia.",
  },
};

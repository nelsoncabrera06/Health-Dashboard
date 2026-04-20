# 🏋️ Health Dashboard — Guía Personal

Dashboard web para trackear nutrición, ejercicio y peso corporal. Corre en el teléfono (Termux/Android) y se accede desde cualquier dispositivo en la misma red WiFi.

## Cómo usarlo

### Registrar una comida
Mandá una foto de la comida por Telegram. El asistente (Pepe) analiza con Gemini Vision y registra automáticamente las calorías y macros en `data.json`.

También podés decirlo por texto: *"almorcé pasta con pollo, unos 400g"* y Pepe lo estima y registra.

### Registrar ejercicio
Avisarle a Pepe: *"fui al gym 1 hora"* o *"corrí 10km en 72 minutos, quemé 900 calorías"*.

### Registrar el peso
Pesarte a la mañana en ayunas y avisarle: *"me pesé, 107.5kg"*. Siempre a la misma hora para consistencia.

### Fotos de progreso
Mandá una foto al espejo con el texto **"foto de progreso"** y Pepe la guarda en `progress/` con la fecha. Hacerlo cada 2-4 semanas para ver la evolución.

---

## Targets personales (Nelson)

| | |
|---|---|
| Calorías/día | 2.400 kcal |
| Proteína | 180g |
| Carbos | 220g |
| Grasas | 80g |
| Peso actual | 108 kg |
| Objetivo | 90-92 kg |
| TDEE | ~2.910 kcal |

---

## Levantar el servidor

```bash
# Iniciar
nohup python3 ~/clawd/health/server.py 3000 > ~/clawd/health/server.log 2>&1 &

# Verificar que corre
curl http://localhost:3000

# Ver en browser (misma red WiFi)
# http://192.168.1.128:3000  (la IP puede cambiar, verificar con ifconfig)

# Detener
pkill -f "health/server.py"
```

---

## Plan de comidas semanal

### Lunes a Viernes
- 🌅 **Desayuno** (~400 kcal): Avena + leche + banana + 2 huevos
- ☀️ **Almuerzo** (~700 kcal): Proteína (pollo/carne/atún) + arroz o pasta + ensalada
- 🏋️ **Pre/post gym** (~200 kcal, solo días de gym): Banana + nueces
- 🌙 **Cena** (~600 kcal): Proteína + verduras, menos carbos que el almuerzo

### Fines de semana
Más relajado — pizza, vino, cerveza son parte del plan. Si cenás pesado, desayuno y almuerzo más livianos.

---

## Plan de ejercicio semanal

| Día | Actividad |
|-----|-----------|
| Lunes | 💪 Gym |
| Martes | 😴 Descanso |
| Miércoles | 💪 Gym |
| Jueves | 🏃 Correr |
| Viernes | 💪 Gym |
| Sábado | 🏃 Correr / libre |
| Domingo | 😴 Descanso |

Objetivo: **3-4 sesiones por semana**

---

## Datos del proyecto

- **Servidor**: Puerto 3000
- **Datos**: `data.json` (no subir a GitHub — gitignored)
- **Fotos de progreso**: `progress/` (gitignored)
- **Logs**: `server.log` (gitignored)

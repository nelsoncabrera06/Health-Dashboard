
const API = '/health-data';
const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// ── Tab switching ──
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('tab-' + tab + '-btn').classList.add('active');
}

// ── Helpers ──
function todayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { start: start.getTime() / 1000, end: start.getTime() / 1000 + 86400 };
}

function dayBoundsFor(daysAgo) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  return { start: d.getTime() / 1000, end: d.getTime() / 1000 + 86400, date: d };
}

function weekStartBounds() {
  // Monday as start of week
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const daysFromMon = (day === 0) ? 6 : day - 1;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMon);
  return mon.getTime() / 1000;
}

function pct(val, target) {
  return target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
}

function barColor(p) {
  if (p < 50) return 'var(--red)';
  if (p < 85) return 'var(--yellow)';
  if (p <= 105) return 'var(--green)';
  return 'var(--red)';
}

function fmtTime(epoch) {
  return new Date(epoch * 1000).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
}

async function fetchData() {
  const res = await fetch(API);
  return res.json();
}

// ── NUTRICIÓN renders ──

function renderProfile(data) {
  const p = data.profile;
  const g = data.goals;
  if (!p) return;
  const bmi = (p.weight_kg / ((p.height_cm/100)**2)).toFixed(1);
  document.getElementById('profileGrid').innerHTML = `
    <div><span style="color:var(--muted);font-size:11px">Altura</span><br><span style="font-weight:600">${p.height_cm} cm</span></div>
    <div><span style="color:var(--muted);font-size:11px">Peso actual</span><br><span style="font-weight:600">${p.weight_kg} kg</span></div>
    <div><span style="color:var(--muted);font-size:11px">Objetivo</span><br><span style="font-weight:600;color:#34d399">${p.goal_weight_kg} kg</span></div>
    <div><span style="color:var(--muted);font-size:11px">Por bajar</span><br><span style="font-weight:600;color:#f59e0b">${(p.weight_kg - p.goal_weight_kg).toFixed(0)} kg</span></div>
    <div><span style="color:var(--muted);font-size:11px">IMC</span><br><span style="font-weight:600">${bmi}</span></div>
    <div><span style="color:var(--muted);font-size:11px">TDEE</span><br><span style="font-weight:600">${p.tdee} kcal</span></div>
    <div><span style="color:var(--muted);font-size:11px">Déficit diario</span><br><span style="font-weight:600;color:#f87171">${p.tdee - g.calories_target} kcal</span></div>
    <div><span style="color:var(--muted);font-size:11px">Gym</span><br><span style="font-weight:600">${p.activity}</span></div>
  `;
}

function renderMacros(meals, goals) {
  const { start, end } = todayBounds();
  const todayMeals = meals.filter(m => m.timestamp >= start && m.timestamp < end);

  const cal = todayMeals.reduce((s,m) => s + (m.calories||0), 0);
  const pro = todayMeals.reduce((s,m) => s + (m.protein||0), 0);
  const car = todayMeals.reduce((s,m) => s + (m.carbs||0), 0);
  const fat = todayMeals.reduce((s,m) => s + (m.fat||0), 0);

  const g = goals;
  const cp = pct(cal, g.calories_target);
  document.getElementById('calVal').textContent = Math.round(cal);
  document.getElementById('calSub').textContent = `de ${g.calories_target} kcal · ${cp}%`;
  const cb = document.getElementById('calBar');
  cb.style.width = cp + '%';
  cb.style.background = barColor(cp);

  const pp = pct(pro, g.protein_target);
  document.getElementById('proVal').textContent = Math.round(pro) + 'g';
  document.getElementById('proSub').textContent = `de ${g.protein_target}g · ${pp}%`;
  document.getElementById('proBar').style.width = pp + '%';

  const rp = pct(car, g.carbs_target);
  document.getElementById('carVal').textContent = Math.round(car) + 'g';
  document.getElementById('carSub').textContent = `de ${g.carbs_target}g · ${rp}%`;
  document.getElementById('carBar').style.width = rp + '%';

  const fp = pct(fat, g.fat_target);
  document.getElementById('fatVal').textContent = Math.round(fat) + 'g';
  document.getElementById('fatSub').textContent = `de ${g.fat_target}g · ${fp}%`;
  document.getElementById('fatBar').style.width = fp + '%';
}

function renderMeals(meals) {
  const { start, end } = todayBounds();
  const todayMeals = meals
    .filter(m => m.timestamp >= start && m.timestamp < end)
    .sort((a,b) => a.timestamp - b.timestamp);

  const el = document.getElementById('mealList');
  if (!todayMeals.length) {
    el.innerHTML = '<div class="empty-state">Sin comidas registradas hoy</div>';
    return;
  }
  el.innerHTML = todayMeals.map(m => `
    <div class="meal-row">
      <div class="meal-time">${fmtTime(m.timestamp)}</div>
      <div class="meal-name">${m.meal}</div>
      <div class="meal-cal">${Math.round(m.calories)} kcal</div>
    </div>
  `).join('');
}

function renderWorkouts(workouts) {
  const { start, end } = todayBounds();
  const todayW = workouts
    .filter(w => w.timestamp >= start && w.timestamp < end)
    .sort((a,b) => a.timestamp - b.timestamp);

  const el = document.getElementById('workoutList');
  if (!todayW.length) {
    el.innerHTML = '<div class="empty-state">Sin entrenamientos hoy</div>';
    return;
  }
  el.innerHTML = todayW.map(w => `
    <div class="workout-item">
      <div class="workout-header">
        <div class="workout-type">💪 ${w.type}</div>
        <div class="workout-cal">-${Math.round(w.calories_burned)} kcal</div>
      </div>
      <div class="workout-meta">⏱ ${w.duration_min} min · ${fmtTime(w.timestamp)}</div>
      ${w.notes ? `<div class="workout-notes">${w.notes}</div>` : ''}
    </div>
  `).join('');
}

// ── Weight chart state ──
let _weightLogGlobal = [];
let _goalWeightGlobal = 92;
let _weightWindowDays = 14;

function renderWeightChart(weightLog, goalWeight) {
  _weightLogGlobal = weightLog || [];
  _goalWeightGlobal = goalWeight || 92;

  // Wire up pills (idempotent)
  const pillsEl = document.getElementById('weightPills');
  if (pillsEl && !pillsEl._wired) {
    pillsEl._wired = true;
    pillsEl.addEventListener('click', function(e) {
      const btn = e.target.closest('.weight-pill');
      if (!btn) return;
      pillsEl.querySelectorAll('.weight-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      _weightWindowDays = parseInt(btn.dataset.days, 10);
      _renderWeightSVG(_weightLogGlobal, _goalWeightGlobal, _weightWindowDays);
    });
  }

  _renderWeightSVG(_weightLogGlobal, _goalWeightGlobal, _weightWindowDays);
}

function _renderWeightSVG(weightLog, goalWeight, windowDays) {
  const wrap = document.getElementById('weightChartWrap');
  const noteEl = document.getElementById('weightNote');

  if (!weightLog || weightLog.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Sin registros de peso aún</div>';
    noteEl.textContent = '';
    return;
  }

  // Build full calendar grid for window
  const today = new Date();
  today.setHours(0,0,0,0);
  const days = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    days.push(iso);
  }

  // Build lookup: date string -> weight
  const byDate = {};
  for (const w of weightLog) {
    byDate[w.date] = w.weight_kg;
  }

  // Only data points that fall in window
  const dataPoints = days.map(d => byDate[d] !== undefined ? byDate[d] : null);
  const hasData = dataPoints.filter(v => v !== null);

  if (hasData.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Sin datos en este período</div>';
    noteEl.textContent = '';
    return;
  }

  const allWeights = [goalWeight, ...hasData];
  const minW = Math.min(...allWeights) - 2;
  const maxW = Math.max(...allWeights) + 2;

  const W = 600, H = 210;
  const padL = 46, padR = 20, padT = 18, padB = 38;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = days.length;

  const xOf = i => padL + (i / (n - 1)) * chartW;
  const yOf = w => padT + chartH - ((w - minW) / (maxW - minW)) * chartH;

  const lineColor = '#3b82f6';
  const dotColor  = '#f59e0b';
  const goalColor = '#22c55e';
  const textColor = '#64748b';
  const gridColor = '#252d42';

  function fmtDate(iso) {
    const p = iso.split('-');
    return p[2] + '/' + p[1];
  }

  let svgContent = '';

  // Y-axis ticks
  for (let i = 0; i <= 4; i++) {
    const v = minW + (maxW - minW) * i / 4;
    const ty = yOf(v).toFixed(1);
    svgContent += `<line x1="${padL}" y1="${ty}" x2="${W - padR}" y2="${ty}" stroke="${gridColor}" stroke-width="1"/>`;
    svgContent += `<text x="${padL - 5}" y="${ty}" fill="${textColor}" font-size="9" text-anchor="end" dominant-baseline="middle">${v.toFixed(1)}</text>`;
  }

  // Goal line
  const gY = yOf(goalWeight).toFixed(1);
  svgContent += `<line x1="${padL}" y1="${gY}" x2="${W - padR}" y2="${gY}" stroke="${goalColor}" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.9"/>`;
  svgContent += `<text x="${(W - padR - 2).toFixed(1)}" y="${(parseFloat(gY) - 5).toFixed(1)}" fill="${goalColor}" font-size="9" text-anchor="end" font-weight="600">Objetivo ${goalWeight}kg</text>`;

  // X-axis labels: adaptive density based on window
  // <= 31 days: every day (number only) + month header when changes
  // <= 90 days: every 7 days (dd/mm)
  // > 90 days: every ~30 days (mm/yy)
  if (n <= 31) {
    for (let i = 0; i < n; i++) {
      const cx = xOf(i).toFixed(1);
      const dayNum = days[i].split('-')[2];
      svgContent += `<text x="${cx}" y="${H - padB + 13}" fill="${textColor}" font-size="8" text-anchor="middle">${dayNum}</text>`;
    }
    let lastMonth2 = '';
    for (let i = 0; i < n; i++) {
      const parts = days[i].split('-');
      const mon = parts[1];
      if (mon !== lastMonth2) {
        const cx = xOf(i).toFixed(1);
        svgContent += `<text x="${cx}" y="${H - padB + 24}" fill="${textColor}" font-size="7" text-anchor="middle" opacity="0.7">${parts[2]}/${parts[1]}</text>`;
        lastMonth2 = mon;
      }
    }
  } else if (n <= 92) {
    // Weekly labels
    for (let i = 0; i < n; i++) {
      if (i % 7 === 0 || i === n - 1) {
        const cx = xOf(i).toFixed(1);
        const p = days[i].split('-');
        svgContent += `<text x="${cx}" y="${H - padB + 13}" fill="${textColor}" font-size="8" text-anchor="middle">${p[2]}/${p[1]}</text>`;
      }
    }
  } else {
    // Monthly labels
    let lastMon = '';
    for (let i = 0; i < n; i++) {
      const p = days[i].split('-');
      const mon = p[1];
      if (mon !== lastMon) {
        const cx = xOf(i).toFixed(1);
        svgContent += `<text x="${cx}" y="${H - padB + 13}" fill="${textColor}" font-size="8" text-anchor="middle">${p[1]}/${p[0].slice(2)}</text>`;
        lastMon = mon;
      }
    }
  }

  // Line connecting data points (skip gaps)
  let pathD = '';
  let prevIdx = null;
  for (let i = 0; i < n; i++) {
    if (dataPoints[i] !== null) {
      const cx = xOf(i).toFixed(1);
      const cy = yOf(dataPoints[i]).toFixed(1);
      if (prevIdx === null) {
        pathD += `M ${cx},${cy}`;
      } else {
        pathD += ` L ${cx},${cy}`;
      }
      prevIdx = i;
    }
  }
  if (pathD) {
    svgContent += `<path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // Dots + labels only on data points
  for (let i = 0; i < n; i++) {
    if (dataPoints[i] !== null) {
      const cx = xOf(i).toFixed(1);
      const cy = yOf(dataPoints[i]).toFixed(1);
      svgContent += `<circle cx="${cx}" cy="${cy}" r="4" fill="${dotColor}" stroke="#0d0f14" stroke-width="1.5"/>`;
      svgContent += `<text x="${cx}" y="${(parseFloat(cy) - 8).toFixed(1)}" fill="${dotColor}" font-size="9" text-anchor="middle" font-weight="600">${dataPoints[i]}</text>`;
    }
  }

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="min-width:280px">${svgContent}</svg>`;

  const nData = hasData.length;
  if (nData < 3) {
    noteEl.textContent = '📌 Seguí pesándote para ver la tendencia';
  } else {
    const first = hasData[0], last = hasData[hasData.length-1];
    const delta = (last - first).toFixed(1);
    const sign = delta > 0 ? '+' : '';
    noteEl.textContent = `Registros: ${nData}  ·  Variación en el período: ${sign}${delta} kg`;
  }
}

let _calMealsGlobal = [], _calGoalsGlobal = {}, _calWindowDays = 7;

function setCalWindow(days) {
  _calWindowDays = days;
  [7,14,30,90].forEach(d => {
    const el = document.getElementById('calPill'+d);
    if (!el) return;
    el.style.background = d === days ? '#f59e0b' : 'transparent';
    el.style.color = d === days ? '#000' : 'var(--muted)';
    el.style.fontWeight = d === days ? '600' : 'normal';
  });
  renderWeek(_calMealsGlobal, _calGoalsGlobal, days);
}

function renderWeek(meals, goals, windowDays) {
  _calMealsGlobal = meals;
  _calGoalsGlobal = goals;
  if (!windowDays) windowDays = _calWindowDays;

  const container = document.getElementById('weekBars');
  const target = (goals && goals.calories_target) || 2400;
  const tLabel = document.getElementById('calTargetLabel');
  if (tLabel) tLabel.textContent = target;

  // Build day data
  const days = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const b = dayBoundsFor(i);
    const cal = (meals || [])
      .filter(m => m.timestamp >= b.start && m.timestamp < b.end)
      .reduce((s,m) => s+(m.calories||0), 0);
    const p = b.date;
    const mm = String(p.getMonth()+1).padStart(2,'0');
    const dd = String(p.getDate()).padStart(2,'0');
    days.push({ cal: Math.round(cal), dateObj: p, iso: p.getFullYear()+'-'+mm+'-'+dd, isToday: i===0 });
  }

  const maxCal = Math.max(target * 1.15, ...days.map(d => d.cal), 100);
  const n = days.length;

  const W = 600, H = 200;
  const padL = 46, padR = 16, padT = 24, padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const yOf = v => padT + chartH - (v / maxCal) * chartH;

  const lineColor = '#3b82f6';
  const overColor = '#ef4444';
  const limitColor = '#f59e0b';
  const textColor = '#64748b';
  const gridColor = '#252d42';

  let svg = '';

  // Y grid + labels (4 levels)
  for (let i = 0; i <= 4; i++) {
    const v = Math.round(maxCal * i / 4);
    const ty = yOf(v).toFixed(1);
    svg += `<line x1="${padL}" y1="${ty}" x2="${W-padR}" y2="${ty}" stroke="${gridColor}" stroke-width="1"/>`;
    svg += `<text x="${padL-5}" y="${ty}" fill="${textColor}" font-size="9" text-anchor="end" dominant-baseline="middle">${v}</text>`;
  }

  // Limit line
  const limitY = yOf(target).toFixed(1);
  svg += `<line x1="${padL}" y1="${limitY}" x2="${W-padR}" y2="${limitY}" stroke="${limitColor}" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.9"/>`;
  svg += `<text x="${W-padR-2}" y="${(parseFloat(limitY)-6).toFixed(1)}" fill="${limitColor}" font-size="9" text-anchor="end" font-weight="600">Límite ${target} kcal</text>`;

  // Bars
  const barGap = 2;
  const barW = Math.max(4, (chartW / n) - barGap);
  const slotW = chartW / n;

  for (let i = 0; i < n; i++) {
    const d = days[i];
    const x = padL + i * slotW + (slotW - barW) / 2;
    const barH = d.cal > 0 ? Math.max(2, (d.cal / maxCal) * chartH) : 0;
    const y = padT + chartH - barH;
    const color = d.cal > target ? overColor : (d.isToday ? lineColor : '#334155');
    const rx = Math.min(3, barW / 2);

    if (d.cal > 0) {
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="${rx}" fill="${color}" opacity="${d.isToday ? '1' : '0.85'}"/>`;
      // Value label above bar (only if enough space)
      if (barW > 14) {
        svg += `<text x="${(x + barW/2).toFixed(1)}" y="${(y-4).toFixed(1)}" fill="${color}" font-size="8" text-anchor="middle" font-weight="600">${d.cal}</text>`;
      }
    }

    // X-axis label
    let label = '';
    if (windowDays <= 14) {
      label = ['Do','Lu','Ma','Mi','Ju','Vi','Sá'][d.dateObj.getDay()];
    } else if (windowDays <= 31) {
      label = String(d.dateObj.getDate());
    } else if (windowDays <= 92) {
      if (i % 7 === 0 || i === n-1) label = d.iso.slice(8)+'/'+d.iso.slice(5,7);
    } else {
      const prevMonth = i > 0 ? days[i-1].iso.slice(5,7) : null;
      if (d.iso.slice(5,7) !== prevMonth) label = d.iso.slice(5,7)+'/'+d.iso.slice(2,4);
    }

    if (label) {
      const lx = (x + barW/2).toFixed(1);
      svg += `<text x="${lx}" y="${H-padB+13}" fill="${d.isToday ? lineColor : textColor}" font-size="${windowDays > 14 ? '8' : '9'}" text-anchor="middle" ${d.isToday ? 'font-weight="700"' : ''}>${label}</text>`;
    }
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;min-height:${H}px">${svg}</svg>`;
}

// ── SPORT renders ──

function renderSportNetBalance(meals, workouts, goals) {
  const { start, end } = todayBounds();
  const calIn = meals
    .filter(m => m.timestamp >= start && m.timestamp < end)
    .reduce((s,m) => s + (m.calories||0), 0);
  const calBurned = workouts
    .filter(w => w.timestamp >= start && w.timestamp < end)
    .reduce((s,w) => s + (w.calories_burned||0), 0);
  const net = Math.round(calIn - calBurned);
  const target = goals.calories_target || 0;

  const netEl = document.getElementById('sportNetCal');
  netEl.textContent = net;
  netEl.style.color = (target > 0 && net <= target) ? 'var(--green)' : 'var(--red)';

  document.getElementById('sportCalIn').textContent = Math.round(calIn) + ' kcal';
  document.getElementById('sportCalBurned').textContent = Math.round(calBurned) + ' kcal';
  document.getElementById('sportCalTarget').textContent = target + ' kcal';
}

function renderSportWorkouts(workouts) {
  const { start, end } = todayBounds();
  const todayW = workouts
    .filter(w => w.timestamp >= start && w.timestamp < end)
    .sort((a,b) => a.timestamp - b.timestamp);

  const el = document.getElementById('sportWorkoutList');
  if (!todayW.length) {
    el.innerHTML = '<div class="empty-state">Sin ejercicio hoy 💤</div>';
    return;
  }
  el.innerHTML = todayW.map(w => `
    <div class="workout-item">
      <div class="workout-header">
        <div class="workout-type">💪 ${w.type}</div>
        <div class="workout-cal">-${Math.round(w.calories_burned)} kcal</div>
      </div>
      <div class="workout-meta">⏱ ${w.duration_min} min · ${fmtTime(w.timestamp)}</div>
      ${w.notes ? `<div class="workout-notes">${w.notes}</div>` : ''}
    </div>
  `).join('');
}

function renderSportWeekBars(workouts) {
  const container = document.getElementById('sportWeekBars');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const b = dayBoundsFor(i);
    const burned = workouts
      .filter(w => w.timestamp >= b.start && w.timestamp < b.end)
      .reduce((s,w) => s + (w.calories_burned||0), 0);
    days.push({ burned: Math.round(burned), date: b.date, isToday: i === 0 });
  }

  const maxBurned = Math.max(...days.map(d => d.burned), 1);

  container.innerHTML = days.map(d => {
    const h = Math.round((d.burned / maxBurned) * 100);
    const color = d.isToday ? 'var(--orange)' : 'var(--teal)';
    const dayName = DAY_NAMES[d.date.getDay()];
    const todayClass = d.isToday ? 'week-today-sport' : '';
    return `
      <div class="week-col ${todayClass}">
        <div class="week-val">${d.burned > 0 ? d.burned : ''}</div>
        <div class="week-bar-wrap" style="position:relative">
          <div class="week-bar" style="height:${h}%;background:${color}"></div>
        </div>
        <div class="week-day">${dayName}</div>
      </div>
    `;
  }).join('');
}

function renderSportWeekSummary(workouts) {
  const weekStart = Date.now()/1000 - 7 * 86400;
  const weekEnd = Date.now()/1000 + 86400;
  const weekW = workouts.filter(w => w.timestamp >= weekStart && w.timestamp < weekEnd);

  const el = document.getElementById('sportWeekSummary');
  if (!weekW.length) {
    el.innerHTML = '<div class="empty-state">Sin sesiones esta semana</div>';
    return;
  }

  const sessions = weekW.length;
  const totalBurned = weekW.reduce((s,w) => s + (w.calories_burned||0), 0);

  // Count by type
  const byType = {};
  weekW.forEach(w => {
    const t = w.type || 'Otro';
    byType[t] = (byType[t] || 0) + 1;
  });

  const typeRows = Object.entries(byType)
    .sort((a,b) => b[1] - a[1])
    .map(([type, count]) => `
      <div class="week-summary-row">
        <span style="color:var(--teal)">${type}</span>
        <span style="color:var(--muted)">${count} sesión${count > 1 ? 'es' : ''}</span>
      </div>
    `).join('');

  el.innerHTML = `
    <div class="week-summary-row">
      <span style="color:var(--muted)">Sesiones</span>
      <span style="font-weight:700;font-size:18px;color:var(--orange)">${sessions}</span>
    </div>
    <div class="week-summary-row">
      <span style="color:var(--muted)">Total quemado</span>
      <span style="font-weight:700;color:var(--orange)">${Math.round(totalBurned)} kcal</span>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Por tipo</div>
    ${typeRows}
  `;
}

function renderExercisePlan(exercisePlan) {
  const DEFAULT_PLAN = [
    { day: 'Lun', activity: 'Gym 💪', rest: false },
    { day: 'Mar', activity: 'Descanso', rest: true },
    { day: 'Mié', activity: 'Gym 💪', rest: false },
    { day: 'Jue', activity: 'Correr 🏃', rest: false },
    { day: 'Vie', activity: 'Gym 💪', rest: false },
    { day: 'Sáb', activity: 'Correr/libre', rest: false },
    { day: 'Dom', activity: 'Descanso', rest: true },
  ];

  const todayDow = new Date().getDay(); // 0=Sun, 1=Mon...
  const dowToIdx = [6, 0, 1, 2, 3, 4, 5]; // maps JS day → plan index (Mon=0)
  const todayPlanIdx = dowToIdx[todayDow];

  let plan = DEFAULT_PLAN;
  let goalText = '🎯 Objetivo: 3-4 sesiones por semana';

  if (exercisePlan && Array.isArray(exercisePlan.days)) {
    plan = exercisePlan.days;
    if (exercisePlan.goal) goalText = '🎯 ' + exercisePlan.goal;
  }

  const el = document.getElementById('sportPlanGrid');
  el.innerHTML = `<div class="weekly-plan-grid">` +
    plan.map((d, i) => `
      <div class="plan-day-cell ${d.rest ? 'rest' : ''} ${i === todayPlanIdx ? 'active-day' : ''}">
        <div class="plan-day-name">${d.day}</div>
        <div class="plan-day-activity">${d.activity}</div>
      </div>
    `).join('') +
  `</div>`;

  document.getElementById('sportPlanGoal').textContent = goalText;
}

// ── Main fetch & render ──
async function refresh() {
  try {
    const data = await fetchData();

    // Nutrition tab
    renderMacros(data.meals || [], data.goals || {});
    renderProfile(data);
    renderMeals(data.meals || []);
    renderWorkouts(data.workouts || []);
    renderWeek(data.meals || [], data.goals || {});
    renderWeightChart(data.weight_log || [], (data.profile && data.profile.goal_weight_kg) || 92);

    // Sport tab
    renderSportNetBalance(data.meals || [], data.workouts || [], data.goals || {});
    renderSportWorkouts(data.workouts || []);
    renderSportWeekBars(data.workouts || []);
    renderSportWeekSummary(data.workouts || []);
    renderExercisePlan(data.exercise_plan || null);

    document.getElementById('lastUpdate').textContent =
      'Actualizado: ' + new Date().toLocaleTimeString('es-AR');
  } catch(e) {
    document.getElementById('lastUpdate').textContent = '⚠️ Error al cargar datos';
    console.error(e);
  }
}

refresh();
setInterval(refresh, 60_000);

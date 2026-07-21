/*
  文件说明: Landing 温度单位切换，写入 localStorage，并按气温分档上色同步城市卡。
  对应文档: docs/product-design.md
*/

const UNIT_STORAGE_KEY = 'weather-trip-temp-unit';

const unitToggles = document.querySelectorAll('[data-unit-toggle]');
const unitLabels = document.querySelectorAll('[data-unit-label]');
const cityCards = document.querySelectorAll('.city-card[data-temp-c]');

function readUnit() {
  const value = window.localStorage.getItem(UNIT_STORAGE_KEY);
  return value === 'f' ? 'f' : 'c';
}

function celsiusToFahrenheit(celsius) {
  return Math.round((celsius * 9) / 5 + 32);
}

function tempBand(celsius) {
  if (celsius <= 0) return 'freeze';
  if (celsius <= 12) return 'cold';
  if (celsius <= 22) return 'mild';
  if (celsius <= 30) return 'warm';
  return 'hot';
}

function formatTempParts(celsius, unit) {
  if (unit === 'f') {
    return { value: String(celsiusToFahrenheit(celsius)), unit: '°F' };
  }
  return { value: String(Math.round(celsius)), unit: '°C' };
}

function applyUnit(unit) {
  document.documentElement.dataset.tempUnit = unit;
  for (const label of unitLabels) {
    label.textContent = unit === 'f' ? '°F' : '°C';
  }
  for (const toggle of unitToggles) {
    toggle.setAttribute('aria-pressed', unit === 'f' ? 'true' : 'false');
  }

  for (const card of cityCards) {
    const celsius = Number(card.dataset.tempC);
    if (Number.isNaN(celsius)) continue;
    card.dataset.tempBand = tempBand(celsius);
    const display = card.querySelector('[data-temp-display]');
    if (!display) continue;
    const parts = formatTempParts(celsius, unit);
    display.innerHTML = `<span class="temp-num">${parts.value}</span><span class="temp-unit">${parts.unit}</span>`;
  }

  window.dispatchEvent(
    new CustomEvent('weather-trip-temp-unit-change', {
      detail: { unit }
    })
  );
}

function toggleUnit() {
  const next = readUnit() === 'f' ? 'c' : 'f';
  window.localStorage.setItem(UNIT_STORAGE_KEY, next);
  applyUnit(next);
}

for (const toggle of unitToggles) {
  toggle.addEventListener('click', toggleUnit);
}
applyUnit(readUnit());

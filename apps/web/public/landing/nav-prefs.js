/*
  文件说明: Landing 根据站点级温度单位偏好同步城市卡气温展示。
  对应文档: docs/product-design.md
*/

const UNIT_STORAGE_KEY = 'weather-trip-temp-unit';
const UNIT_CHANGE_EVENT = 'weather-trip-temp-unit-change';

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

function applyCityCardUnit(unit) {
  for (const card of cityCards) {
    const celsius = Number(card.dataset.tempC);
    if (Number.isNaN(celsius)) continue;
    card.dataset.tempBand = tempBand(celsius);
    const display = card.querySelector('[data-temp-display]');
    if (!display) continue;
    const parts = formatTempParts(celsius, unit);
    display.innerHTML = `<span class="temp-num">${parts.value}</span><span class="temp-unit">${parts.unit}</span>`;
  }
}

window.addEventListener(UNIT_CHANGE_EVENT, (event) => {
  const unit = event.detail?.unit === 'f' ? 'f' : 'c';
  applyCityCardUnit(unit);
});

window.addEventListener('storage', (event) => {
  if (event.key !== UNIT_STORAGE_KEY) return;
  applyCityCardUnit(event.newValue === 'f' ? 'f' : 'c');
});

applyCityCardUnit(readUnit());

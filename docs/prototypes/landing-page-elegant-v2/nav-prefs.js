/*
  文件说明: 处理语言与温度单位切换，写入 localStorage；按气温分档上色并同步城市卡显示。
  对应文档: docs/product-design.md
*/

const UNIT_STORAGE_KEY = 'weather-trip-temp-unit';
const LANG_STORAGE_KEY = 'weather-trip-locale';

const unitToggle = document.querySelector('[data-unit-toggle]');
const unitLabel = document.querySelector('[data-unit-label]');
const langToggle = document.querySelector('[data-lang-toggle]');
const cityCards = document.querySelectorAll('.city-card[data-temp-c]');

function readUnit() {
  const value = window.localStorage.getItem(UNIT_STORAGE_KEY);
  return value === 'f' ? 'f' : 'c';
}

function readLocale() {
  const value = window.localStorage.getItem(LANG_STORAGE_KEY);
  return value === 'en' ? 'en' : 'zh';
}

function celsiusToFahrenheit(celsius) {
  return Math.round((celsius * 9) / 5 + 32);
}

/** 颜色分档始终按摄氏真值，与显示单位无关 */
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
  if (unitLabel) unitLabel.textContent = unit === 'f' ? '°F' : '°C';
  if (unitToggle) {
    unitToggle.setAttribute('aria-pressed', unit === 'f' ? 'true' : 'false');
    unitToggle.title = unit === 'f' ? 'Switch to Celsius' : '切换到华氏度';
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
}

function applyLocale(locale) {
  document.documentElement.dataset.locale = locale;
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  if (langToggle) {
    langToggle.setAttribute('aria-pressed', locale === 'en' ? 'true' : 'false');
    langToggle.title = locale === 'en' ? '切换到中文' : 'Switch to English';
    langToggle.setAttribute('aria-label', locale === 'en' ? 'Switch language to Chinese' : '切换到英文');
  }
}

function toggleUnit() {
  const next = readUnit() === 'f' ? 'c' : 'f';
  window.localStorage.setItem(UNIT_STORAGE_KEY, next);
  applyUnit(next);
}

function toggleLocale() {
  const next = readLocale() === 'en' ? 'zh' : 'en';
  window.localStorage.setItem(LANG_STORAGE_KEY, next);
  applyLocale(next);
}

if (unitToggle) unitToggle.addEventListener('click', toggleUnit);
if (langToggle) langToggle.addEventListener('click', toggleLocale);

applyUnit(readUnit());
applyLocale(readLocale());

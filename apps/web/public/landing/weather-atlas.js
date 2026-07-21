/*
  文件说明: 天气图集三段切换、闲置轮播，并同步页面晴/雨/雪主题色。
  对应文档: docs/product-design.md
*/

const weatherAtlas = document.querySelector('[data-weather-atlas]');
const weatherCount = 3;
const weatherThemes = ['sunny', 'rain', 'snow'];
const rainAlphas = [0, 1, 0];
const snowAlphas = [0, 0, 1];
/* 光标图标来自主项目 lucide-react：Sun / CloudRain / CloudSnow；用透明 PNG 避免 SVG 光标白底 */
const weatherCursors = {
  sunny: 'url("/landing/cursors/sunny.png") 16 16, pointer',
  rain: 'url("/landing/cursors/rain.png") 16 16, pointer',
  snow: 'url("/landing/cursors/snow.png") 16 16, pointer'
};

const idleDelay = 3000;
const hoverTransitionDuration = '500ms';
const restoreTransitionDuration = '1000ms';
const autoplayTransitionDuration = '2000ms';
let activeWeatherIndex = 0;
let autoplayTimer = 0;

function setWeather(index, transitionDuration) {
  if (!weatherAtlas) return;

  activeWeatherIndex = index;
  const theme = weatherThemes[index];
  weatherAtlas.style.setProperty('--weather-transition-duration', transitionDuration);
  weatherAtlas.style.setProperty('--rain-alpha', rainAlphas[index]);
  weatherAtlas.style.setProperty('--snow-alpha', snowAlphas[index]);
  weatherAtlas.style.cursor = weatherCursors[theme];
  weatherAtlas.dataset.cursorWeather = theme;
  document.documentElement.dataset.weatherTheme = theme;
  window.dispatchEvent(
    new CustomEvent('weather-theme-change', {
      detail: { theme, index }
    })
  );
}

function stopAutoplay() {
  window.clearTimeout(autoplayTimer);
}

function playNextWeather() {
  const nextWeatherIndex = (activeWeatherIndex + 1) % weatherCount;
  setWeather(nextWeatherIndex, autoplayTransitionDuration);
  autoplayTimer = window.setTimeout(playNextWeather, idleDelay);
}

function startAutoplay() {
  stopAutoplay();
  autoplayTimer = window.setTimeout(playNextWeather, idleDelay);
}

function getWeatherIndexForPointer(event) {
  const rect = weatherAtlas.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const regionWidth = rect.width / weatherCount;
  return Math.min(Math.floor(x / regionWidth), weatherCount - 1);
}

function handlePointerMove(event) {
  stopAutoplay();
  setWeather(getWeatherIndexForPointer(event), hoverTransitionDuration);
}

function handlePointerLeave() {
  weatherAtlas.style.setProperty('--weather-transition-duration', restoreTransitionDuration);
  startAutoplay();
}

if (weatherAtlas) {
  if (window.matchMedia('(pointer: coarse)').matches) {
    weatherAtlas.addEventListener('click', () => {
      stopAutoplay();
      setWeather((activeWeatherIndex + 1) % weatherCount, hoverTransitionDuration);
      startAutoplay();
    });
  } else {
    weatherAtlas.addEventListener('pointermove', handlePointerMove);
    weatherAtlas.addEventListener('pointerleave', handlePointerLeave);
  }

  setWeather(0, autoplayTransitionDuration);
  startAutoplay();
}

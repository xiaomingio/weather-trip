/*
  文件说明: 为 Weather Trip 优雅版首页原型的天气图集提供三段鼠标切换和闲置自动轮播。
  对应文档: docs/product-design.md
*/

const weatherAtlas = document.querySelector('[data-weather-atlas]');
const weatherLabel = weatherAtlas?.querySelector('[data-weather-label]');
const weatherStates = [
  {
    label: '天气 · 温度 · 湿度 · 海拔',
    rainAlpha: 0,
    snowAlpha: 0
  },
  {
    label: '天气 · 温度 · 湿度 · 海拔',
    rainAlpha: 1,
    snowAlpha: 0
  },
  {
    label: '天气 · 温度 · 湿度 · 海拔',
    rainAlpha: 0,
    snowAlpha: 1
  }
];

const idleDelay = 3000;
const hoverTransitionDuration = '500ms';
const restoreTransitionDuration = '1000ms';
const autoplayTransitionDuration = '2000ms';
let activeWeatherIndex = 0;
let autoplayTimer = 0;

function setWeather(index, transitionDuration) {
  if (!weatherAtlas) return;

  activeWeatherIndex = index;
  const weather = weatherStates[index];
  weatherAtlas.style.setProperty('--weather-transition-duration', transitionDuration);
  weatherAtlas.style.setProperty('--rain-alpha', weather.rainAlpha);
  weatherAtlas.style.setProperty('--snow-alpha', weather.snowAlpha);

  if (weatherLabel) {
    weatherLabel.textContent = weather.label;
  }
}

function stopAutoplay() {
  window.clearTimeout(autoplayTimer);
}

function playNextWeather() {
  const nextWeatherIndex = (activeWeatherIndex + 1) % weatherStates.length;
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
  const regionWidth = rect.width / weatherStates.length;
  return Math.min(Math.floor(x / regionWidth), weatherStates.length - 1);
}

function handlePointerMove(event) {
  stopAutoplay();
  setWeather(getWeatherIndexForPointer(event), hoverTransitionDuration);
}

function handlePointerLeave() {
  setWeather(0, restoreTransitionDuration);
  startAutoplay();
}

if (weatherAtlas) {
  if (window.matchMedia('(pointer: coarse)').matches) {
    weatherAtlas.addEventListener('click', () => {
      stopAutoplay();
      setWeather((activeWeatherIndex + 1) % weatherStates.length, hoverTransitionDuration);
      startAutoplay();
    });
  } else {
    weatherAtlas.addEventListener('pointermove', handlePointerMove);
    weatherAtlas.addEventListener('pointerleave', handlePointerLeave);
  }

  setWeather(0, autoplayTransitionDuration);
  startAutoplay();
}

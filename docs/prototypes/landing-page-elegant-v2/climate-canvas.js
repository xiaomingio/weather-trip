/*
  文件说明: 在 Hero 内绘制柔和气候画布，并跟随晴/雨/雪主题轻微变色。
  对应文档: docs/product-design.md
*/

const canvas = document.querySelector('[data-climate-canvas]');
const context = canvas?.getContext('2d');
const pointer = { x: 0.55, y: 0.42 };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const themePalettes = {
  sunny: {
    stops: ['#dcebea', '#fbfaf4', '#eadfc9'],
    path: '#c97968',
    cells: [
      { x: 0.78, y: 0.2, radius: 0.28, squeeze: 0.64, angle: -0.2, drift: 18, color: 'rgba(216, 173, 87, 0.42)', middle: 'rgba(216, 173, 87, 0.16)' },
      { x: 0.68, y: 0.62, radius: 0.34, squeeze: 0.58, angle: 0.18, drift: 24, color: 'rgba(109, 155, 179, 0.28)', middle: 'rgba(109, 155, 179, 0.1)' },
      { x: 0.32, y: 0.38, radius: 0.26, squeeze: 0.72, angle: 0.08, drift: 14, color: 'rgba(88, 123, 103, 0.32)', middle: 'rgba(88, 123, 103, 0.12)' },
      { x: 0.88, y: 0.74, radius: 0.18, squeeze: 0.66, angle: -0.26, drift: 30, color: 'rgba(201, 121, 104, 0.22)', middle: 'rgba(201, 121, 104, 0.08)' }
    ]
  },
  rain: {
    stops: ['#c5d6df', '#e8eef1', '#d2ddd9'],
    path: '#6d9bb3',
    cells: [
      { x: 0.78, y: 0.2, radius: 0.28, squeeze: 0.64, angle: -0.2, drift: 18, color: 'rgba(109, 155, 179, 0.4)', middle: 'rgba(109, 155, 179, 0.14)' },
      { x: 0.68, y: 0.62, radius: 0.34, squeeze: 0.58, angle: 0.18, drift: 24, color: 'rgba(88, 120, 140, 0.34)', middle: 'rgba(88, 120, 140, 0.12)' },
      { x: 0.32, y: 0.38, radius: 0.26, squeeze: 0.72, angle: 0.08, drift: 14, color: 'rgba(95, 130, 118, 0.28)', middle: 'rgba(95, 130, 118, 0.1)' },
      { x: 0.88, y: 0.74, radius: 0.18, squeeze: 0.66, angle: -0.26, drift: 30, color: 'rgba(120, 145, 160, 0.26)', middle: 'rgba(120, 145, 160, 0.08)' }
    ]
  },
  snow: {
    stops: ['#d5e2ef', '#f4f7fb', '#e4ebf3'],
    path: '#8aa4bc',
    cells: [
      { x: 0.78, y: 0.2, radius: 0.28, squeeze: 0.64, angle: -0.2, drift: 18, color: 'rgba(170, 195, 220, 0.42)', middle: 'rgba(170, 195, 220, 0.14)' },
      { x: 0.68, y: 0.62, radius: 0.34, squeeze: 0.58, angle: 0.18, drift: 24, color: 'rgba(150, 175, 200, 0.34)', middle: 'rgba(150, 175, 200, 0.12)' },
      { x: 0.32, y: 0.38, radius: 0.26, squeeze: 0.72, angle: 0.08, drift: 14, color: 'rgba(190, 205, 220, 0.36)', middle: 'rgba(190, 205, 220, 0.12)' },
      { x: 0.88, y: 0.74, radius: 0.18, squeeze: 0.66, angle: -0.26, drift: 30, color: 'rgba(160, 180, 200, 0.28)', middle: 'rgba(160, 180, 200, 0.1)' }
    ]
  }
};

function getActivePalette() {
  const theme = document.documentElement.dataset.weatherTheme || 'sunny';
  return themePalettes[theme] || themePalettes.sunny;
}

function drawSoftCell(width, height, cell) {
  if (!context) return;
  const drift = reduceMotion ? 0 : cell.drift;
  const x = width * cell.x + (pointer.x - 0.5) * drift;
  const y = height * cell.y + (pointer.y - 0.5) * drift;
  const radius = Math.max(width, height) * cell.radius;
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, cell.color);
  gradient.addColorStop(0.52, cell.middle);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(x, y, radius, radius * cell.squeeze, cell.angle, 0, Math.PI * 2);
  context.fill();
}

function drawContour(width, height, index) {
  if (!context) return;
  context.beginPath();
  const base = height * (0.18 + index * 0.105);
  const pointerShift = reduceMotion ? 0 : pointer.x * 90;
  for (let x = -80; x <= width + 80; x += 18) {
    const y =
      base +
      Math.sin((x + index * 56) / 150) * (18 + index * 2) +
      Math.cos((x + pointerShift) / 260) * 14;
    if (x === -80) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function drawClimateCanvas() {
  if (!canvas || !context) return;
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const palette = getActivePalette();
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, palette.stops[0]);
  background.addColorStop(0.48, palette.stops[1]);
  background.addColorStop(1, palette.stops[2]);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  for (const cell of palette.cells) drawSoftCell(width, height, cell);

  context.globalAlpha = 0.28;
  context.strokeStyle = '#17231f';
  context.lineWidth = 1;
  for (let index = 0; index < 9; index += 1) drawContour(width, height, index);

  context.globalAlpha = 0.4;
  context.strokeStyle = palette.path;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(width * 0.46, height * 0.75);
  context.bezierCurveTo(width * 0.58, height * 0.64, width * 0.68, height * 0.84, width * 0.79, height * 0.68);
  context.bezierCurveTo(width * 0.88, height * 0.55, width * 0.92, height * 0.6, width * 0.98, height * 0.5);
  context.stroke();

  context.globalAlpha = 0.72;
  context.fillStyle = '#17231f';
  const pinDrift = reduceMotion ? 0 : 8;
  const pins = [
    [0.76, 0.24],
    [0.66, 0.62],
    [0.31, 0.38]
  ];
  for (const [x, y] of pins) {
    context.beginPath();
    context.arc(width * x + (pointer.x - 0.5) * pinDrift, height * y + (pointer.y - 0.5) * pinDrift, 4, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

window.addEventListener('resize', drawClimateCanvas);
window.addEventListener('weather-theme-change', drawClimateCanvas);

if (!reduceMotion) {
  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX / Math.max(window.innerWidth, 1);
    pointer.y = event.clientY / Math.max(window.innerHeight, 1);
    drawClimateCanvas();
  });
}

drawClimateCanvas();

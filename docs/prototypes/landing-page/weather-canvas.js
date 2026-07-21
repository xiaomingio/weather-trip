/*
  文件说明: 为 Weather Trip 首页静态原型绘制响应式气象图背景和轻量指针互动。
  对应文档: docs/product-design.md
*/

const canvas = document.querySelector('[data-weather-canvas]');
const context = canvas?.getContext('2d');
const pointer = { x: 0.62, y: 0.42 };

function drawGrid(width, height) {
  if (!context) return;
  context.globalAlpha = 0.34;
  context.strokeStyle = '#58756f';
  context.lineWidth = 1;

  for (let x = -40; x < width + 40; x += 72) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 36, height);
    context.stroke();
  }

  for (let y = 24; y < height; y += 62) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y - 28);
    context.stroke();
  }
}

function drawCells(width, height) {
  if (!context) return;
  const cells = [
    { x: 0.2, y: 0.34, r: 0.23, color: 'rgba(58, 164, 123, 0.54)' },
    { x: 0.72, y: 0.26, r: 0.28, color: 'rgba(226, 176, 77, 0.5)' },
    { x: 0.58, y: 0.67, r: 0.3, color: 'rgba(62, 128, 174, 0.44)' },
    { x: 0.87, y: 0.64, r: 0.13, color: 'rgba(216, 98, 86, 0.45)' }
  ];

  for (const cell of cells) {
    const radial = context.createRadialGradient(
      width * cell.x,
      height * cell.y,
      0,
      width * cell.x,
      height * cell.y,
      width * cell.r
    );
    radial.addColorStop(0, cell.color);
    radial.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = radial;
    context.beginPath();
    context.ellipse(width * cell.x, height * cell.y, width * cell.r, height * cell.r * 0.64, Math.PI * 0.06, 0, Math.PI * 2);
    context.fill();
  }
}

function drawPressureLines(width, height) {
  if (!context) return;
  context.globalAlpha = 0.72;
  context.strokeStyle = '#17302d';
  context.lineWidth = 1.2;

  for (let index = 0; index < 7; index += 1) {
    context.beginPath();
    const offset = index * 58 + pointer.x * 18;
    for (let x = -60; x <= width + 60; x += 18) {
      const y = height * 0.18 + offset + Math.sin((x + index * 42) / 82) * 24 + Math.cos(x / 160) * 18;
      if (x === -60) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

function drawFrontLine(width, height) {
  if (!context) return;
  context.globalAlpha = 0.82;
  context.strokeStyle = '#d86256';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(width * 0.1, height * 0.72);
  context.bezierCurveTo(width * 0.28, height * 0.56, width * 0.46, height * 0.9, width * 0.66, height * 0.7);
  context.bezierCurveTo(width * 0.78, height * 0.58, width * 0.86, height * 0.63, width * 0.96, height * 0.5);
  context.stroke();
}

function drawStations(width, height) {
  if (!context) return;
  const stations = [
    [0.22, 0.36, '24'],
    [0.68, 0.3, '31'],
    [0.55, 0.66, '18'],
    [0.86, 0.62, '9']
  ];

  context.globalAlpha = 1;
  context.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const [x, y, label] of stations) {
    const stationX = width * x + (pointer.x - 0.5) * 10;
    const stationY = height * y + (pointer.y - 0.5) * 10;
    context.fillStyle = '#10211e';
    context.beginPath();
    context.arc(stationX, stationY, 22, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#fff';
    context.fillText(label, stationX, stationY);
  }
}

function drawWeatherCanvas() {
  if (!canvas || !context) return;
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#dceff1');
  gradient.addColorStop(0.48, '#f5f0dc');
  gradient.addColorStop(1, '#dfe8de');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  drawGrid(width, height);
  drawCells(width, height);
  drawPressureLines(width, height);
  drawFrontLine(width, height);
  drawStations(width, height);
}

window.addEventListener('resize', drawWeatherCanvas);
window.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX / Math.max(window.innerWidth, 1);
  pointer.y = event.clientY / Math.max(window.innerHeight, 1);
  drawWeatherCanvas();
});

drawWeatherCanvas();

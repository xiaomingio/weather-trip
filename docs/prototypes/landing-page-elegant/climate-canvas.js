/*
  文件说明: 为 Weather Trip 优雅版首页原型绘制柔和气候画布和细微指针视差。
  对应文档: docs/product-design.md
*/

const canvas = document.querySelector('[data-climate-canvas]');
const context = canvas?.getContext('2d');
const pointer = { x: 0.55, y: 0.42 };

function drawSoftCell(width, height, cell) {
  if (!context) return;
  const x = width * cell.x + (pointer.x - 0.5) * cell.drift;
  const y = height * cell.y + (pointer.y - 0.5) * cell.drift;
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
  for (let x = -80; x <= width + 80; x += 18) {
    const y =
      base +
      Math.sin((x + index * 56) / 150) * (18 + index * 2) +
      Math.cos((x + pointer.x * 90) / 260) * 14;
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
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#dcebea');
  background.addColorStop(0.48, '#fbfaf4');
  background.addColorStop(1, '#eadfc9');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const cells = [
    {
      x: 0.78,
      y: 0.2,
      radius: 0.28,
      squeeze: 0.64,
      angle: -0.2,
      drift: 18,
      color: 'rgba(216, 173, 87, 0.42)',
      middle: 'rgba(216, 173, 87, 0.16)'
    },
    {
      x: 0.68,
      y: 0.62,
      radius: 0.34,
      squeeze: 0.58,
      angle: 0.18,
      drift: 24,
      color: 'rgba(109, 155, 179, 0.34)',
      middle: 'rgba(109, 155, 179, 0.12)'
    },
    {
      x: 0.32,
      y: 0.38,
      radius: 0.26,
      squeeze: 0.72,
      angle: 0.08,
      drift: 14,
      color: 'rgba(88, 123, 103, 0.32)',
      middle: 'rgba(88, 123, 103, 0.12)'
    },
    {
      x: 0.88,
      y: 0.74,
      radius: 0.18,
      squeeze: 0.66,
      angle: -0.26,
      drift: 30,
      color: 'rgba(201, 121, 104, 0.24)',
      middle: 'rgba(201, 121, 104, 0.08)'
    }
  ];

  for (const cell of cells) drawSoftCell(width, height, cell);

  context.globalAlpha = 0.28;
  context.strokeStyle = '#17231f';
  context.lineWidth = 1;
  for (let index = 0; index < 9; index += 1) drawContour(width, height, index);

  context.globalAlpha = 0.4;
  context.strokeStyle = '#c97968';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(width * 0.46, height * 0.75);
  context.bezierCurveTo(width * 0.58, height * 0.64, width * 0.68, height * 0.84, width * 0.79, height * 0.68);
  context.bezierCurveTo(width * 0.88, height * 0.55, width * 0.92, height * 0.6, width * 0.98, height * 0.5);
  context.stroke();

  context.globalAlpha = 0.72;
  context.fillStyle = '#17231f';
  const pins = [
    [0.76, 0.24],
    [0.66, 0.62],
    [0.31, 0.38]
  ];
  for (const [x, y] of pins) {
    context.beginPath();
    context.arc(width * x + (pointer.x - 0.5) * 8, height * y + (pointer.y - 0.5) * 8, 4, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

window.addEventListener('resize', drawClimateCanvas);
window.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX / Math.max(window.innerWidth, 1);
  pointer.y = event.clientY / Math.max(window.innerHeight, 1);
  drawClimateCanvas();
});

drawClimateCanvas();

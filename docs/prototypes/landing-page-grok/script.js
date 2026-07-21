/*
  文件说明: 绘制 Landing 首屏气候地图册画布，并响应指针轻量视差。
  对应文档: docs/product-design.md
*/

const canvas = document.querySelector("[data-atlas-canvas]");
const context = canvas?.getContext("2d");
const pointer = { x: 0.62, y: 0.42 };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const cities = [
  { x: 0.72, y: 0.28, label: "京都 18°", tone: "#3f6d72" },
  { x: 0.58, y: 0.46, label: "里斯本 24°", tone: "#a65d48" },
  { x: 0.78, y: 0.58, label: "清迈 31°", tone: "#b8954a" },
  { x: 0.48, y: 0.22, label: "雷克雅未克 9°", tone: "#6f9598" },
  { x: 0.84, y: 0.38, label: "上海 27°", tone: "#5a7562" }
];

function fillAtmosphere(width, height) {
  if (!context) return;

  const sky = context.createLinearGradient(0, 0, width * 0.2, height);
  sky.addColorStop(0, "#d5e4e1");
  sky.addColorStop(0.35, "#e8efe8");
  sky.addColorStop(0.62, "#f4efe3");
  sky.addColorStop(1, "#e4d6be");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const bands = [
    { y: 0.12, h: 0.22, color: "rgba(111, 149, 152, 0.18)" },
    { y: 0.28, h: 0.2, color: "rgba(143, 173, 138, 0.14)" },
    { y: 0.42, h: 0.24, color: "rgba(208, 181, 106, 0.16)" },
    { y: 0.58, h: 0.28, color: "rgba(193, 122, 92, 0.12)" }
  ];

  for (const band of bands) {
    const gradient = context.createLinearGradient(0, height * band.y, 0, height * (band.y + band.h));
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.45, band.color);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, height * band.y, width, height * band.h);
  }
}

function drawSoftBloom(width, height, bloom) {
  if (!context) return;
  const px = width * bloom.x + (pointer.x - 0.5) * bloom.drift;
  const py = height * bloom.y + (pointer.y - 0.5) * bloom.drift;
  const radius = Math.max(width, height) * bloom.r;
  const gradient = context.createRadialGradient(px, py, 0, px, py, radius);
  gradient.addColorStop(0, bloom.core);
  gradient.addColorStop(0.55, bloom.mid);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(px, py, radius, radius * bloom.squash, bloom.angle, 0, Math.PI * 2);
  context.fill();
}

function drawMeridians(width, height) {
  if (!context) return;
  context.save();
  context.globalAlpha = 0.12;
  context.strokeStyle = "#1b221e";
  context.lineWidth = 1;

  for (let i = 0; i < 8; i += 1) {
    const x = width * (0.28 + i * 0.09) + (pointer.x - 0.5) * 8;
    context.beginPath();
    context.moveTo(x, height * 0.08);
    context.bezierCurveTo(
      x + 18,
      height * 0.32,
      x - 22,
      height * 0.62,
      x + 8,
      height * 0.94
    );
    context.stroke();
  }

  context.globalAlpha = 0.16;
  for (let i = 0; i < 10; i += 1) {
    const base = height * (0.14 + i * 0.08);
    context.beginPath();
    for (let x = -40; x <= width + 40; x += 16) {
      const y =
        base +
        Math.sin((x + i * 40) / 140) * (10 + i * 1.2) +
        Math.cos((x + pointer.x * 120) / 220) * 8;
      if (x === -40) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

function drawCoastline(width, height) {
  if (!context) return;
  context.save();
  context.globalAlpha = 0.34;
  context.strokeStyle = "#3f6d72";
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(width * 0.42, height * 0.78);
  context.bezierCurveTo(
    width * 0.52 + (pointer.x - 0.5) * 12,
    height * 0.62,
    width * 0.6,
    height * 0.8,
    width * 0.7,
    height * 0.56
  );
  context.bezierCurveTo(
    width * 0.78,
    height * 0.4,
    width * 0.86,
    height * 0.52,
    width * 0.96,
    height * 0.36
  );
  context.stroke();

  context.globalAlpha = 0.2;
  context.strokeStyle = "#a65d48";
  context.beginPath();
  context.moveTo(width * 0.5, height * 0.3);
  context.bezierCurveTo(
    width * 0.62,
    height * 0.22,
    width * 0.7,
    height * 0.34,
    width * 0.82,
    height * 0.24
  );
  context.stroke();
  context.restore();
}

function drawCityMarks(width, height) {
  if (!context) return;
  context.save();

  for (const city of cities) {
    const x = width * city.x + (pointer.x - 0.5) * 10;
    const y = height * city.y + (pointer.y - 0.5) * 8;

    context.beginPath();
    context.fillStyle = "rgba(250, 247, 240, 0.55)";
    context.arc(x, y, 10, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.fillStyle = city.tone;
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fill();

    context.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    context.fillStyle = "rgba(27, 34, 30, 0.72)";
    context.fillText(city.label, x + 10, y + 4);
  }

  context.restore();
}

function drawCompass(width, height) {
  if (!context) return;
  const cx = width * 0.9;
  const cy = height * 0.16;
  const r = Math.min(width, height) * 0.04;

  context.save();
  context.globalAlpha = 0.35;
  context.strokeStyle = "#1b221e";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, cy - r + 4);
  context.lineTo(cx, cy + r - 4);
  context.moveTo(cx - r + 4, cy);
  context.lineTo(cx + r - 4, cy);
  context.stroke();

  context.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "rgba(27, 34, 30, 0.55)";
  context.textAlign = "center";
  context.fillText("N", cx, cy - r - 6);
  context.restore();
}

function drawAtlas() {
  if (!canvas || !context) return;

  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);

  fillAtmosphere(width, height);

  const blooms = [
    {
      x: 0.78,
      y: 0.22,
      r: 0.3,
      squash: 0.62,
      angle: -0.18,
      drift: 16,
      core: "rgba(184, 149, 74, 0.38)",
      mid: "rgba(184, 149, 74, 0.1)"
    },
    {
      x: 0.66,
      y: 0.58,
      r: 0.36,
      squash: 0.56,
      angle: 0.2,
      drift: 22,
      core: "rgba(63, 109, 114, 0.28)",
      mid: "rgba(63, 109, 114, 0.08)"
    },
    {
      x: 0.42,
      y: 0.34,
      r: 0.24,
      squash: 0.7,
      angle: 0.05,
      drift: 12,
      core: "rgba(90, 117, 98, 0.26)",
      mid: "rgba(90, 117, 98, 0.08)"
    },
    {
      x: 0.88,
      y: 0.72,
      r: 0.2,
      squash: 0.64,
      angle: -0.24,
      drift: 18,
      core: "rgba(166, 93, 72, 0.22)",
      mid: "rgba(166, 93, 72, 0.06)"
    }
  ];

  for (const bloom of blooms) drawSoftBloom(width, height, bloom);

  drawMeridians(width, height);
  drawCoastline(width, height);
  drawCompass(width, height);

  if (width > 520) drawCityMarks(width, height);
}

function onPointerMove(event) {
  if (reduceMotion) return;
  pointer.x = event.clientX / Math.max(window.innerWidth, 1);
  pointer.y = event.clientY / Math.max(window.innerHeight, 1);
  drawAtlas();
}

window.addEventListener("resize", drawAtlas);
window.addEventListener("pointermove", onPointerMove);
drawAtlas();

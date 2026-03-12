function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string) {
  const cleaned = (hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return { r: 160, g: 34, b: 59 };
  }
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function bayerThreshold(x: number, y: number) {
  return (BAYER_4[y & 3][x & 3] + 0.5) / 16;
}

export function initPixelBlastBackground(options: Partial<{
  variant: "circle" | "square";
  pixelSize: number;
  color: string;
  patternScale: number;
  patternDensity: number;
  pixelSizeJitter: number;
  enableRipples: boolean;
  rippleSpeed: number;
  rippleThickness: number;
  rippleIntensityScale: number;
  liquid: boolean;
  liquidStrength: number;
  liquidRadius: number;
  liquidWobbleSpeed: number;
  speed: number;
  edgeFade: number;
  transparent: boolean;
}> = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const config = {
    variant: "circle" as const,
    pixelSize: 4,
    color: "#a0223b",
    patternScale: 2,
    patternDensity: 1,
    pixelSizeJitter: 0,
    enableRipples: true,
    rippleSpeed: 0.4,
    rippleThickness: 0.12,
    rippleIntensityScale: 1.5,
    liquid: false,
    liquidStrength: 0.12,
    liquidRadius: 1.2,
    liquidWobbleSpeed: 5,
    speed: 0.5,
    edgeFade: 0.25,
    transparent: true,
    ...options,
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rgb = hexToRgb(config.color);
  const canvas = document.createElement("canvas");
  canvas.id = "pixel-blast-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) {
    canvas.remove();
    return null;
  }

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let rafId: number | null = null;
  let lastFrame = 0;
  const targetFrameMs = reduced ? 1000 / 12 : 1000 / 28;

  const blobs = Array.from({ length: 6 }).map((_, index) => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.13 + Math.random() * 0.2,
    vx: (Math.random() * 2 - 1) * (0.00022 + index * 0.00004),
    vy: (Math.random() * 2 - 1) * (0.00022 + index * 0.00004),
  }));

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(width / config.pixelSize);
    rows = Math.ceil(height / config.pixelSize);
  }

  function updateBlobs(dt: number) {
    const speedScale = config.speed * (reduced ? 0.45 : 1);
    blobs.forEach((blob, index) => {
      const wobble = config.liquid
        ? Math.sin(performance.now() * 0.001 * config.liquidWobbleSpeed + index) * config.liquidStrength * 0.0005
        : 0;
      blob.x += (blob.vx + wobble) * dt * speedScale;
      blob.y += (blob.vy - wobble) * dt * speedScale;

      if (blob.x < -0.15 || blob.x > 1.15) {
        blob.vx *= -1;
      }
      if (blob.y < -0.15 || blob.y > 1.15) {
        blob.vy *= -1;
      }
    });
  }

  function sampleField(nx: number, ny: number, timeSec: number) {
    let value = 0;
    for (const blob of blobs) {
      const dx = nx - blob.x;
      const dy = ny - blob.y;
      const d2 = dx * dx + dy * dy;
      const r2 = blob.r * blob.r;
      value += Math.exp(-d2 / (r2 * (config.patternScale * 0.9)));
    }

    value = (value / blobs.length) * 1.9 * config.patternDensity;

    if (config.enableRipples) {
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const wavePhase = distance * 17 - timeSec * (2.3 * config.rippleSpeed);
      const thickness = clamp(config.rippleThickness, 0.04, 0.45);
      const envelope = Math.exp(-distance * (4.2 / Math.max(0.1, thickness)));
      value += Math.sin(wavePhase) * envelope * 0.2 * config.rippleIntensityScale;
    }

    const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
    return value * smoothstep(0, clamp(config.edgeFade, 0.04, 0.49), edge);
  }

  function draw(now: number) {
    if (now - lastFrame < targetFrameMs) {
      rafId = window.requestAnimationFrame(draw);
      return;
    }

    const dt = Math.min(40, now - (lastFrame || now));
    lastFrame = now;

    if (!config.transparent) {
      ctx.fillStyle = "rgba(9, 11, 15, 1)";
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    updateBlobs(dt);

    const seconds = now * 0.001;
    const baseAlpha = reduced ? 0.16 : 0.24;
    for (let gy = 0; gy < rows; gy += 1) {
      for (let gx = 0; gx < cols; gx += 1) {
        const nx = (gx + 0.5) / cols;
        const ny = (gy + 0.5) / rows;
        const field = sampleField(nx, ny, seconds);
        if (field <= bayerThreshold(gx, gy) * 0.95) {
          continue;
        }

        const jitter = config.pixelSizeJitter > 0 ? (Math.random() - 0.5) * config.pixelSizeJitter : 0;
        const px = gx * config.pixelSize;
        const py = gy * config.pixelSize;
        const size = Math.max(1, config.pixelSize + jitter);
        const alpha = clamp(baseAlpha + field * 0.18, 0.08, 0.62);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

        if (config.variant === "circle") {
          ctx.beginPath();
          ctx.arc(px + size * 0.5, py + size * 0.5, size * 0.38, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(px, py, size, size);
        }
      }
    }

    rafId = window.requestAnimationFrame(draw);
  }

  function onResize() {
    resize();
  }

  resize();
  rafId = window.requestAnimationFrame(draw);
  window.addEventListener("resize", onResize);

  return () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    window.removeEventListener("resize", onResize);
    canvas.remove();
  };
}

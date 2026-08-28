import React, { useEffect, useRef } from 'react';

interface Room3DEnhancedProps {
  opacity?: number;
  scrollProgress?: number;
  smoothMouse?: { x: number; y: number };
  canvasClassName?: string;
}

const TRACE_MS = 1650;
const LIME = { r: 204, g: 255, b: 0 };

let introStartedAt: number | null = null;
let introHasPlayed = false;

const shouldSkipIntro = () => {
  if (introHasPlayed) return true;
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (window.location.hash) return true;
  return false;
};

const HERO_START = 0.7;

const fireReady = (() => {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    window.dispatchEvent(new Event('callsal:ready'));
  };
})();

const fireRoomReady = (() => {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    document.documentElement.setAttribute('data-room-ready', '');
    window.dispatchEvent(new Event('callsal:room-ready'));
  };
})();

const fireComplete = () => {
  if (introHasPlayed) return;
  introHasPlayed = true;
  document.documentElement.classList.add('intro-done');
  window.dispatchEvent(new Event('callsal:intro-complete'));
};

type LineSeg = {
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
  w: number;
};

const buildGridLines = (): LineSeg[] => {
  const roomSize = 10;
  const halfSize = roomSize / 2;
  const zNear = 0.5;
  const zFar = 10.5;
  const gridDivisions = 10;
  const step = roomSize / gridDivisions;
  const lines: LineSeg[] = [];
  const add = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, w = 2) => {
    lines.push({ x1, y1, z1, x2, y2, z2, w });
  };

  add(-halfSize, -halfSize, zFar, -halfSize, halfSize, zFar, 3);
  add(halfSize, -halfSize, zFar, halfSize, halfSize, zFar, 3);
  add(-halfSize, -halfSize, zFar, halfSize, -halfSize, zFar, 3);
  add(-halfSize, halfSize, zFar, halfSize, halfSize, zFar, 3);

  for (let i = 1; i < gridDivisions; i++) {
    const pos = -halfSize + i * step;
    add(pos, -halfSize, zFar, pos, halfSize, zFar);
    add(-halfSize, pos, zFar, halfSize, pos, zFar);
  }

  for (let i = gridDivisions - 1; i >= 1; i--) {
    const zPos = zNear + i * step;
    add(-halfSize, halfSize, zPos, halfSize, halfSize, zPos);
  }
  for (let i = 1; i < gridDivisions; i++) {
    const pos = -halfSize + i * step;
    add(pos, halfSize, zNear, pos, halfSize, zFar);
  }

  for (let i = gridDivisions - 1; i >= 1; i--) {
    const zPos = zNear + i * step;
    add(-halfSize, -halfSize, zPos, halfSize, -halfSize, zPos);
  }
  for (let i = 1; i < gridDivisions; i++) {
    const pos = -halfSize + i * step;
    add(pos, -halfSize, zNear, pos, -halfSize, zFar);
  }

  for (let i = gridDivisions - 1; i >= 1; i--) {
    const zPos = zNear + i * step;
    add(-halfSize, -halfSize, zPos, -halfSize, halfSize, zPos);
  }
  for (let i = 1; i < gridDivisions; i++) {
    const pos = -halfSize + i * step;
    add(-halfSize, pos, zNear, -halfSize, pos, zFar);
  }

  for (let i = gridDivisions - 1; i >= 1; i--) {
    const zPos = zNear + i * step;
    add(halfSize, -halfSize, zPos, halfSize, halfSize, zPos);
  }
  for (let i = 1; i < gridDivisions; i++) {
    const pos = -halfSize + i * step;
    add(halfSize, pos, zNear, halfSize, pos, zFar);
  }

  add(-halfSize, -halfSize, zNear, -halfSize, -halfSize, zFar, 3);
  add(halfSize, -halfSize, zNear, halfSize, -halfSize, zFar, 3);
  add(-halfSize, halfSize, zNear, -halfSize, halfSize, zFar, 3);
  add(halfSize, halfSize, zNear, halfSize, halfSize, zFar, 3);

  return lines;
};

const GRID_LINES = buildGridLines();

export const Room3DEnhanced: React.FC<Room3DEnhancedProps> = ({
  opacity = 1,
  scrollProgress = 1,
  smoothMouse: smoothMouseProp,
  canvasClassName = 'room-canvas',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(scrollProgress);
  const smoothMouseRef = useRef({ x: 0.5, y: 0.5 });
  const lastDrawRef = useRef({ sp: -1, mx: -1, my: -1 });
  const needsResizeRef = useRef(false);
  const introProgressRef = useRef(shouldSkipIntro() ? 1 : 0);
  const tracingRef = useRef(shouldSkipIntro());

  useEffect(() => { scrollProgressRef.current = scrollProgress; }, [scrollProgress]);
  useEffect(() => { if (smoothMouseProp) smoothMouseRef.current = smoothMouseProp; }, [smoothMouseProp]);

  useEffect(() => {
    const stage = document.getElementById('stage-scroll');
    if (!stage) return;
    const update = () => {
      const hero = document.getElementById('hero-stage');
      const heroH = hero?.offsetHeight || window.innerHeight;
      const t = Math.min(1, Math.max(0, stage.scrollTop / Math.max(1, heroH)));
      scrollProgressRef.current = HERO_START + t * (1 - HERO_START);
    };
    stage.addEventListener('scroll', update, { passive: true });
    update();
    return () => stage.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      needsResizeRef.current = true;
    };
    resize();
    window.addEventListener('resize', resize);

    const skipIntro = shouldSkipIntro();
    if (skipIntro) {
      introProgressRef.current = 1;
      tracingRef.current = true;
    }

    const bootReleased = () => {
      if (document.documentElement.classList.contains('intro-ready')) return true;
      const boot = document.getElementById('boot-loader');
      if (!boot) return true;
      return boot.classList.contains('is-ack') || boot.classList.contains('is-done');
    };

    const startTrace = () => {
      if (!skipIntro && !bootReleased()) return;
      if (tracingRef.current && introStartedAt != null) return;
      tracingRef.current = true;
      if (skipIntro || introHasPlayed) {
        introProgressRef.current = 1;
        fireComplete();
        needsResizeRef.current = true;
        return;
      }
      if (introStartedAt == null) introStartedAt = performance.now();
      needsResizeRef.current = true;
    };

    window.addEventListener('callsal:boot-hidden', startTrace);
    if (bootReleased()) startTrace();

    const project = (x: number, y: number, z: number, w: number, h: number, camX: number, camY: number, camZ: number) => {
      const fov = Math.PI / 2;
      const scale = w / (2 * Math.tan(fov / 2));
      const dx = x - camX;
      const dy = y - camY;
      const dz = z - camZ;
      if (dz <= 0) return null;
      const screenX = w / 2 + (dx / dz) * scale;
      const screenY = h / 2 + (dy / dz) * scale;
      return { x: screenX, y: screenY };
    };

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const sp = scrollProgressRef.current;
      const mx = smoothMouseRef.current.x;
      const my = smoothMouseRef.current.y;

      fireReady();

      const tracing = tracingRef.current;
      let introT = introProgressRef.current;
      if (tracing && introT < 1 && introStartedAt != null) {
        introT = Math.min(1, (performance.now() - introStartedAt) / TRACE_MS);
        introProgressRef.current = introT;
        if (introT >= 1) fireComplete();
      }

      const last = lastDrawRef.current;
      const spDelta = Math.abs(sp - last.sp);
      const mxDelta = Math.abs(mx - last.mx);
      const myDelta = Math.abs(my - last.my);
      const introPlaying = tracing && introT < 1;
      if (!needsResizeRef.current && !introPlaying && spDelta < 0.002 && mxDelta < 0.003 && myDelta < 0.003) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }
      last.sp = sp; last.mx = mx; last.my = my;
      needsResizeRef.current = false;

      const colorProgress = Math.min(1, Math.max(0, (sp - 0.7) * 3.33));
      const wallR = Math.round(255 * (1 - colorProgress));
      const wallG = Math.round(255 * (1 - colorProgress));
      const wallB = Math.round(255 * (1 - colorProgress));
      const wallColor = `rgb(${wallR}, ${wallG}, ${wallB})`;
      const lineGrey = Math.round(180 - (140 * colorProgress));
      const lineColor = `rgb(${lineGrey}, ${lineGrey}, ${lineGrey})`;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = wallColor;
      ctx.fillRect(0, 0, w, h);
      fireRoomReady();

      if (!tracing) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const zoomProgress2 = Math.min(1, sp);
      const easeZoom = (1 - Math.cos(zoomProgress2 * Math.PI)) / 2;

      const isPortrait = h > w;
      const farZ = isPortrait ? 8.9 : 7.5;
      const nearZ = isPortrait ? 3.5 : 2.0;
      const camYBase = isPortrait ? 2.8 : 2.5;
      const camYTarget = isPortrait ? 3.2 : 3.5;

      const camX = 0;
      const camY = camYBase + (camYTarget - camYBase) * easeZoom;
      const camZ = farZ + (nearZ - farZ) * easeZoom;

      const maxPan = (isPortrait ? 0.25 : 0.08) * easeZoom;
      const maxTilt = (isPortrait ? 0.15 : 0.05) * easeZoom;
      const panAngle = (smoothMouseRef.current.x - 0.5) * maxPan * 2;
      const tiltAngle = (smoothMouseRef.current.y - 0.5) * maxTilt * 2;

      const rotatePoint = (x: number, y: number, z: number) => {
        let dx = x - camX;
        let dy = y - camY;
        let dz = z - camZ;

        const cosP = Math.cos(panAngle);
        const sinP = Math.sin(panAngle);
        const rx = dx * cosP - dz * sinP;
        const rz = dx * sinP + dz * cosP;
        dx = rx;
        dz = rz;

        const cosT = Math.cos(tiltAngle);
        const sinT = Math.sin(tiltAngle);
        const ry = dy * cosT - dz * sinT;
        const rz2 = dy * sinT + dz * cosT;
        dy = ry;
        dz = rz2;

        return { x: dx + camX, y: dy + camY, z: dz + camZ };
      };

      const roomSize = 10;
      const halfSize = roomSize / 2;
      const zNear = 0.5;
      const zFar = 10.5;

      const drawLine3D = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
        const r1 = rotatePoint(x1, y1, z1);
        const r2 = rotatePoint(x2, y2, z2);
        const nearPlane = camZ + 0.1;

        let ax = r1.x, ay = r1.y, az = r1.z;
        let bx = r2.x, by = r2.y, bz = r2.z;

        const aInFront = az > nearPlane;
        const bInFront = bz > nearPlane;
        if (!aInFront && !bInFront) return;

        if (!aInFront && bInFront) {
          const t = (nearPlane - az) / (bz - az);
          ax = ax + t * (bx - ax);
          ay = ay + t * (by - ay);
          az = nearPlane;
        } else if (aInFront && !bInFront) {
          const t = (nearPlane - bz) / (az - bz);
          bx = bx + t * (ax - bx);
          by = by + t * (ay - by);
          bz = nearPlane;
        }

        const p1 = project(ax, ay, az, w, h, camX, camY, camZ);
        const p2 = project(bx, by, bz, w, h, camX, camY, camZ);
        if (!p1 || !p2) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.round(p1.x) + 0.5, Math.round(p1.y) + 0.5);
        ctx.lineTo(Math.round(p2.x) + 0.5, Math.round(p2.y) + 0.5);
        ctx.stroke();
      };

      const fillQuad3D = (points: [number, number, number][], color: string) => {
        const rotated = points.map((p) => rotatePoint(p[0], p[1], p[2]));
        const projected = rotated.map((p) => project(p.x, p.y, p.z, w, h, camX, camY, camZ));
        if (projected.some((p) => !p)) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(projected[0]!.x, projected[0]!.y);
        for (let i = 1; i < projected.length; i++) {
          ctx.lineTo(projected[i]!.x, projected[i]!.y);
        }
        ctx.closePath();
        ctx.fill();
      };

      fillQuad3D([[-halfSize, -halfSize, zFar], [halfSize, -halfSize, zFar], [halfSize, halfSize, zFar], [-halfSize, halfSize, zFar]], wallColor);
      fillQuad3D([[-halfSize, halfSize, zNear], [halfSize, halfSize, zNear], [halfSize, halfSize, zFar], [-halfSize, halfSize, zFar]], wallColor);
      fillQuad3D([[-halfSize, -halfSize, zNear], [halfSize, -halfSize, zNear], [halfSize, -halfSize, zFar], [-halfSize, -halfSize, zFar]], wallColor);
      fillQuad3D([[-halfSize, -halfSize, zNear], [-halfSize, -halfSize, zFar], [-halfSize, halfSize, zFar], [-halfSize, halfSize, zNear]], wallColor);
      fillQuad3D([[halfSize, -halfSize, zNear], [halfSize, -halfSize, zFar], [halfSize, halfSize, zFar], [halfSize, halfSize, zNear]], wallColor);

      const settle = introT >= 1 ? 1 : Math.max(0, Math.min(1, (introT - 0.7) / 0.3));
      const lr = Math.round(LIME.r + (lineGrey - LIME.r) * settle);
      const lg = Math.round(LIME.g + (lineGrey - LIME.g) * settle);
      const lb = Math.round(LIME.b + (lineGrey - LIME.b) * settle);
      ctx.strokeStyle = introT >= 1 ? lineColor : `rgb(${lr}, ${lg}, ${lb})`;
      ctx.shadowBlur = 0;

      const SPREAD = 16;
      const lineCursor = introT >= 1 ? GRID_LINES.length + SPREAD : (introT / 0.8) * (GRID_LINES.length + SPREAD);
      for (let i = 0; i < GRID_LINES.length; i++) {
        const t = Math.max(0, Math.min(1, (lineCursor - i) / SPREAD));
        if (t <= 0) continue;
        const ln = GRID_LINES[i];
        ctx.lineWidth = ln.w;
        if (t >= 1) {
          drawLine3D(ln.x1, ln.y1, ln.z1, ln.x2, ln.y2, ln.z2);
        } else {
          drawLine3D(
            ln.x1, ln.y1, ln.z1,
            ln.x1 + (ln.x2 - ln.x1) * t,
            ln.y1 + (ln.y2 - ln.y1) * t,
            ln.z1 + (ln.z2 - ln.z1) * t,
          );
        }
      }
      ctx.shadowBlur = 0;

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('callsal:boot-hidden', startTrace);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={canvasClassName}
      style={{
        pointerEvents: 'none',
      }}
    />
  );
};

export default Room3DEnhanced;

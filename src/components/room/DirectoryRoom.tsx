import React, { useEffect, useRef, useState } from 'react';
import { Room3DEnhanced } from './Room3DEnhanced';

export default function DirectoryRoom() {
  const [smoothMouse, setSmoothMouse] = useState({ x: 0.5, y: 0.5 });
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const smoothRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse) return;
    const onMove = (event: MouseEvent) => {
      mouseRef.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
    };
    window.addEventListener('mousemove', onMove);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    let raf = 0;
    const tick = () => {
      smoothRef.current.x = lerp(smoothRef.current.x, mouseRef.current.x, 0.06);
      smoothRef.current.y = lerp(smoothRef.current.y, mouseRef.current.y, 0.06);
      setSmoothMouse((prev) => {
        const dx = Math.abs(prev.x - smoothRef.current.x);
        const dy = Math.abs(prev.y - smoothRef.current.y);
        if (dx > 0.005 || dy > 0.005) {
          return { x: smoothRef.current.x, y: smoothRef.current.y };
        }
        return prev;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <Room3DEnhanced
      smoothMouse={smoothMouse}
      canvasClassName="room-canvas"
    />
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Room3DEnhanced } from './Room3DEnhanced';

const HERO_START = 0.7;

export default function DirectoryRoom() {
  const [smoothMouse, setSmoothMouse] = useState({ x: 0.5, y: 0.5 });
  const [scrollProgress, setScrollProgress] = useState(HERO_START);
  const [heroFade, setHeroFade] = useState(1);
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

  useEffect(() => {
    const stage = document.getElementById('stage-scroll');
    if (!stage) return;
    const update = () => {
      const hero = document.getElementById('hero-stage');
      const heroH = hero?.offsetHeight || window.innerHeight;
      const t = Math.min(1, Math.max(0, stage.scrollTop / Math.max(1, heroH)));
      setScrollProgress(HERO_START + t * (1 - HERO_START));
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setHeroFade(reduce ? (t > 0.45 ? 0 : 1) : Math.max(0, 1 - t / 0.8));
    };
    stage.addEventListener('scroll', update, { passive: true });
    update();
    return () => stage.removeEventListener('scroll', update);
  }, []);

  return (
    <Room3DEnhanced
      scrollProgress={scrollProgress}
      smoothMouse={smoothMouse}
      canvasClassName="room-canvas"
      opacity={heroFade}
    />
  );
}

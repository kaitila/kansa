"use client";

import { useEffect, useRef } from "react";
import { geoArea, geoPath, geoTransverseMercator, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Persona } from "@/lib/types";
import { C, pRGB } from "@/lib/client/colors";

type Props = {
  personas: Persona[];
  regions: FeatureCollection | null;
  answers: Map<number, number>;
  llm: Map<number, boolean>;
  version: number;
  selectedId: number | null;
  onPick: (p: Persona | null) => void;
};

const TWEEN_MS = 600;

// d3 wants clockwise outer rings; RFC 7946 files are counter-clockwise.
function rewind(fc: FeatureCollection): FeatureCollection {
  const flip = (g: Geometry): Geometry => {
    if (g.type === "Polygon") return { ...g, coordinates: g.coordinates.map((r) => [...r].reverse()) };
    if (g.type === "MultiPolygon")
      return { ...g, coordinates: g.coordinates.map((p) => p.map((r) => [...r].reverse())) };
    return g;
  };
  return {
    ...fc,
    features: fc.features.map((f) =>
      f.geometry && geoArea(f as Feature) > 2 * Math.PI ? { ...f, geometry: flip(f.geometry) } : f,
    ),
  };
}

export default function FinlandMap({ personas, regions, answers, llm, version, selectedId, onPick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({
    w: 0,
    h: 0,
    dpr: 1,
    xs: new Float32Array(0),
    ys: new Float32Array(0),
    from: new Float32Array(0), // NaN = unanswered
    to: new Float32Array(0),
    t0: new Float64Array(0),
    hollow: new Uint8Array(0),
    base: null as HTMLCanvasElement | null,
    raf: 0,
    proj: null as GeoProjection | null,
    r: 2,
  });
  const fcRef = useRef<FeatureCollection | null>(null);
  const selRef = useRef<number | null>(selectedId);
  selRef.current = selectedId;

  // (Re)allocate on persona change.
  useEffect(() => {
    const s = st.current;
    const n = personas.length;
    s.from = new Float32Array(n).fill(NaN);
    s.to = new Float32Array(n).fill(NaN);
    s.t0 = new Float64Array(n);
    s.hollow = new Uint8Array(n);
    layout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas]);

  useEffect(() => {
    fcRef.current = regions ? rewind(regions) : null;
    layout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions]);

  // Retarget tweens whenever answers change.
  useEffect(() => {
    const s = st.current;
    const now = performance.now();
    personas.forEach((pe, i) => {
      const target = answers.has(pe.id) ? answers.get(pe.id)! : NaN;
      const same = (Number.isNaN(target) && Number.isNaN(s.to[i])) || target === s.to[i];
      s.hollow[i] = llm.get(pe.id) === false ? 1 : 0;
      if (same) return;
      s.from[i] = currentValue(i, now);
      s.to[i] = target;
      s.t0[i] = now;
    });
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, personas]);

  useEffect(() => {
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const s = st.current;
    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(s.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentValue(i: number, now: number): number {
    const s = st.current;
    const a = s.from[i], b = s.to[i];
    const u = Math.min(1, (now - s.t0[i]) / TWEEN_MS);
    if (Number.isNaN(b)) return NaN;
    if (Number.isNaN(a)) return u >= 1 ? b : -1 - u; // fade-in encoded as negative
    const e = 1 - Math.pow(1 - u, 3);
    return a + (b - a) * e;
  }

  function layout() {
    const s = st.current;
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    s.w = w; s.h = h; s.dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(w * s.dpr);
    cv.height = Math.round(h * s.dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;

    const proj = geoTransverseMercator().rotate([-26, 0]);
    const pad = Math.min(w, h) * 0.04;
    const fc = fcRef.current;
    const fitTarget = fc && fc.features.length
      ? fc
      : ({ type: "MultiPoint", coordinates: personas.length ? personas.map((p) => [p.lon, p.lat]) : [[20, 59.7], [31.6, 70.1]] } as Geometry);
    proj.fitExtent([[pad, pad], [w - pad, h - pad - Math.min(70, h * 0.09)]], fitTarget as never);
    s.proj = proj;

    const n = personas.length;
    s.xs = new Float32Array(n);
    s.ys = new Float32Array(n);
    // Dot size scales with the drawn map height.
    const mapH = Math.min(h, w * 1.9);
    s.r = Math.max(1.25, Math.min(3, mapH / 330));
    // People in the same town share a centroid; lay each town out as a
    // sunflower (golden-angle spiral) so every person gets a visible dot.
    const spacing = s.r * 1.1;
    const towns = new Map<string, number[]>();
    personas.forEach((p, i) => {
      const k = p.municipality || `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
      const arr = towns.get(k);
      if (arr) arr.push(i); else towns.set(k, [i]);
    });
    const GA = Math.PI * (3 - Math.sqrt(5));
    towns.forEach((idx) => {
      let cx = 0, cy = 0, m = 0;
      for (const i of idx) {
        const xy = proj([personas[i].lon, personas[i].lat]);
        if (xy) { cx += xy[0]; cy += xy[1]; m++; }
      }
      if (!m) { idx.forEach((i) => { s.xs[i] = -99; s.ys[i] = -99; }); return; }
      cx /= m; cy /= m;
      idx.forEach((i, k) => {
        const rad = spacing * Math.sqrt(k + 0.5);
        s.xs[i] = cx + rad * Math.cos(k * GA);
        s.ys[i] = cy + rad * Math.sin(k * GA);
      });
    });

    // Static base layer: land + outlines.
    const base = document.createElement("canvas");
    base.width = cv.width; base.height = cv.height;
    const bx = base.getContext("2d")!;
    bx.scale(s.dpr, s.dpr);
    if (fc) {
      const path = geoPath(proj, bx);
      bx.fillStyle = C.land;
      bx.strokeStyle = C.outline;
      bx.lineWidth = 0.8;
      bx.lineJoin = "round";
      for (const f of fc.features) {
        bx.beginPath(); path(f as Feature); bx.fill(); bx.stroke();
      }
    }
    s.base = base;
    kick();
  }

  function kick() {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    s.raf = requestAnimationFrame(draw);
  }

  function draw() {
    const s = st.current;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (s.base) ctx.drawImage(s.base, 0, 0);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    let animating = false;
    const r = s.r;
    const n = personas.length;
    for (let i = 0; i < n; i++) {
      const v = currentValue(i, now);
      if (now - s.t0[i] < TWEEN_MS) animating = true;
      const x = s.xs[i], y = s.ys[i];
      ctx.beginPath();
      if (Number.isNaN(v)) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = C.idle;
        ctx.arc(x, y, r * 0.8, 0, 6.2832);
        ctx.fill();
        continue;
      }
      let p = v, alpha = 1, rr = r;
      if (v < 0) {
        // fading in from idle
        const u = -v - 1;
        p = s.to[i];
        alpha = 0.4 + 0.6 * u;
        rr = r * (0.85 + 0.6 * Math.sin(u * Math.PI) + 0.15 * u);
      }
      const [cr, cg, cb] = pRGB(p);
      ctx.globalAlpha = alpha;
      if (s.hollow[i]) {
        ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
        ctx.lineWidth = Math.max(0.8, r * 0.45);
        ctx.arc(x, y, rr * 0.9, 0, 6.2832);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.arc(x, y, rr, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // Selected persona ring.
    const sel = selRef.current;
    if (sel != null) {
      const i = personas.findIndex((p) => p.id === sel);
      if (i >= 0) {
        ctx.beginPath();
        ctx.strokeStyle = C.snow;
        ctx.lineWidth = 2;
        ctx.arc(s.xs[i], s.ys[i], r + 5, 0, 6.2832);
        ctx.stroke();
      }
    }
    if (animating) s.raf = requestAnimationFrame(draw);
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const s = st.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = -1, bd = 18 * 18;
    for (let i = 0; i < personas.length; i++) {
      const dx = s.xs[i] - x, dy = s.ys[i] - y;
      const d = dx * dx + dy * dy;
      // Prefer answered people when several are close.
      const pen = Number.isNaN(s.to[i]) ? 30 : 0;
      if (d + pen < bd) { bd = d + pen; best = i; }
    }
    onPick(best >= 0 ? personas[best] : null);
  }

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        onClick={onClick}
        className="block cursor-crosshair"
        role="img"
        aria-label="Map of Finland with one dot per synthetic resident, coloured by their answer"
      />
    </div>
  );
}

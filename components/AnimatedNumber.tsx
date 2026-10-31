"use client";
import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({
  value,
  format = (v: number) => Math.round(v).toLocaleString("en-US"),
  ms = 350,
}: {
  value: number;
  format?: (v: number) => string;
  ms?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const cur = useRef(value);
  useEffect(() => {
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / ms);
      const v = from.current + (value - from.current) * (1 - Math.pow(1 - u, 3));
      cur.current = v;
      setShown(v);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(shown)}</>;
}

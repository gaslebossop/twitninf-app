export function formatCompactCount(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';

  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  const floorTo = (x: number, decimals: number) => {
    const p = 10 ** decimals;
    return Math.floor(x * p) / p;
  };

  // >= 1 000 000 -> m
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    // 1_000_000 => 1m (pas 1.0m)
    if (m >= 10) return `${sign}${Math.floor(m)}m`;
    const v = floorTo(m, 1);
    return `${sign}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}m`;
  }

  // >= 1 000 -> k
  if (abs >= 1_000) {
    const k = abs / 1_000;
    // 10_000 => 10k (pas 10.0k)
    if (k >= 10) return `${sign}${Math.floor(k)}k`;
    const v = floorTo(k, 1);
    return `${sign}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }

  return `${sign}${Math.floor(abs)}`;
}


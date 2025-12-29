// 32-bit xorshift（軽量・再現性のある乱数）
export function nextSeed(seed: number): number {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

export function rand01(seed: number): { value: number; seed: number } {
  const s = nextSeed(seed);
  // unsigned 0..1
  const u = (s >>> 0) / 4294967296;
  return { value: u, seed: s };
}

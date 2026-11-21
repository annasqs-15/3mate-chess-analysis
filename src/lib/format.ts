export function formatEvaluation(pawns: number): string {
  const abs = Math.abs(pawns);
  if (abs >= 10) return pawns > 0 ? 'M+' : 'M−';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export function playerName(name: string | undefined, fallback: string): string {
  if (!name || name === '?') return fallback;
  return name;
}

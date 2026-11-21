const COMMON_OPENING_LINES = [
  'e4 e5 Nf3 Nc6 Bc4 Bc5',
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3',
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4',
  'd4 d5 c4 e6 Nc3 Nf6',
  'd4 d5 c4 c6 Nc3 Nf6',
  'e4 e6 d4 d5 Nc3 Nf6',
  'e4 c6 d4 d5 Nc3 dxe4',
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6',
  'c4 e5 Nc3 Nf6 g3 d5',
  'Nf3 d5 g3 c5 Bg2 Nc6',
];

function normalizeSan(san: string): string {
  return san.replace(/[+#?!]+$/g, '').replace(/[!?]+/g, '');
}

export function isKnownBookPly(sans: string[], ply: number): boolean {
  if (ply < 1) return false;
  const played = sans.slice(0, ply).map(normalizeSan);
  return COMMON_OPENING_LINES.some((line) => {
    const moves = line.split(' ').map(normalizeSan);
    return moves.length >= ply && moves.slice(0, ply).every((move, index) => move === played[index]);
  });
}

import type { ChessSnapshot, MoveCategory, MoveReview, PositionEvaluation } from '../types';
import { DEFAULT_POSITION } from 'chess.js';
import { isKnownBookPly } from '../data/openings';

function expectedScore(pawns: number): number {
  return 1 / (1 + Math.exp(-0.0035 * pawns * 100));
}

function materialForColor(fen: string, color: 'w' | 'b'): number {
  const board = fen.split(' ')[0];
  const values: Record<string, number> = { p: 1, n: 3.1, b: 3.3, r: 5, q: 9, k: 0 };
  let total = 0;
  for (const symbol of board) {
    if (symbol.toLowerCase() in values && (color === 'w' ? symbol === symbol.toUpperCase() : symbol === symbol.toLowerCase())) {
      total += values[symbol.toLowerCase()];
    }
  }
  return total;
}

function moveAdvantage(evalWhite: number, color: 'w' | 'b'): number {
  return color === 'w' ? evalWhite : -evalWhite;
}

export function classifyMoves(
  positions: ChessSnapshot[],
  evaluations: Array<PositionEvaluation | undefined>,
): MoveReview[] {
  const sans = positions.slice(1).map((position) => position.san ?? '');
  const startsFromStandardPosition = positions[0]?.fen === DEFAULT_POSITION;
  const reviews: MoveReview[] = [];

  for (let ply = 1; ply < positions.length; ply += 1) {
    const before = evaluations[ply - 1];
    const after = evaluations[ply];
    if (!before || !after) continue;

    const color: 'w' | 'b' = ply % 2 === 1 ? 'w' : 'b';
    const beforeAdvantage = moveAdvantage(before.evalWhite, color);
    const afterAdvantage = moveAdvantage(after.evalWhite, color);
    const expectedPointsLost = Math.max(0, expectedScore(beforeAdvantage) - expectedScore(afterAdvantage));
    let category: MoveCategory;

    if (startsFromStandardPosition && isKnownBookPly(sans, ply)) {
      category = 'Book';
    } else {
      const nextOpponentPosition = evaluations[ply + 1];
      const ownMaterialBefore = materialForColor(positions[ply - 1].fen, color);
      const ownMaterialAfterReply = nextOpponentPosition
        ? materialForColor(positions[ply + 1]?.fen ?? positions[ply].fen, color)
        : ownMaterialBefore;
      const apparentSacrifice = ownMaterialBefore - ownMaterialAfterReply >= 2.7;
      const opponentMissedOpportunity = ply >= 2 && (reviews.find((review) => review.ply === ply - 1)?.expectedPointsLost ?? 0) >= 0.12;

      if (apparentSacrifice && expectedPointsLost <= 0.025 && afterAdvantage > -0.35 && beforeAdvantage < 2.6) {
        category = 'Brilliant';
      } else if (opponentMissedOpportunity && expectedPointsLost >= 0.045) {
        category = 'Miss';
      } else if (expectedPointsLost <= 0.012 && afterAdvantage - beforeAdvantage >= 0.8) {
        category = 'Great';
      } else if (expectedPointsLost <= 0.012) {
        category = 'Best';
      } else if (expectedPointsLost <= 0.035) {
        category = 'Excellent';
      } else if (expectedPointsLost <= 0.075) {
        category = 'Good';
      } else if (expectedPointsLost <= 0.14) {
        category = 'Inaccuracy';
      } else if (expectedPointsLost <= 0.28) {
        category = 'Mistake';
      } else {
        category = 'Blunder';
      }
    }

    reviews.push({ ply, color, category, expectedPointsLost });
  }

  return reviews;
}

export function accuracyForColor(reviews: MoveReview[], color: 'w' | 'b'): number | null {
  const ownMoves = reviews.filter((review) => review.color === color);
  if (!ownMoves.length) return null;
  const averageLoss = ownMoves.reduce((sum, review) => sum + review.expectedPointsLost, 0) / ownMoves.length;
  return Math.max(0, Math.min(100, Math.round((1 - averageLoss) * 100)));
}

export function categoryCounts(reviews: MoveReview[]): Record<MoveCategory, number> {
  const categories: MoveCategory[] = [
    'Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Book', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder',
  ];
  return Object.fromEntries(categories.map((category) => [
    category,
    reviews.filter((review) => review.category === category).length,
  ])) as Record<MoveCategory, number>;
}

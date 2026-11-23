import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { ChessSnapshot, EngineLine, MoveCategory, MoveReview, PositionEvaluation } from '../types';
import { isKnownBookPly } from '../data/openings';

type Side = 'w' | 'b';
type ScoreSignal =
  | { kind: 'centipawns'; value: number }
  | { kind: 'mate'; winner: Side };

interface ForcedMateProof {
  signal: ScoreSignal;
  line: string[];
  mateIn: number;
}

const MATE_SENTINEL_CP = 100_000;
const MAX_TACTIC_LINE_PLIES = 12;
const MIN_MISS_GAIN = 2.7;
const MIN_MISS_GAIN_MARGIN = 1.0;
const MIN_MISS_WINNING_ADVANTAGE = 2.7;
const MIN_BRILLIANT_NET_SACRIFICE = 1.0;

function opposite(side: Side): Side {
  return side === 'w' ? 'b' : 'w';
}

function sideToMove(fen: string): Side {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function expectedScore(pawns: number): number {
  return 1 / (1 + Math.exp(-0.0035 * pawns * 100));
}

function materialForColor(fen: string, color: Side): number {
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

function materialBalance(fen: string, color: Side): number {
  return materialForColor(fen, color) - materialForColor(fen, opposite(color));
}

function outcomeForLine(line: EngineLine | undefined, evaluation: PositionEvaluation, fen: string, perspective: Side): ScoreSignal {
  if (line?.mate !== undefined) {
    const turn = sideToMove(fen);
    const winner = line.mate >= 0 ? turn : opposite(turn);
    return { kind: 'mate', winner };
  }

  const evalWhite = line?.evalWhite ?? evaluation.evalWhite;
  return { kind: 'centipawns', value: perspective === 'w' ? evalWhite : -evalWhite };
}

function signalAsPawns(signal: ScoreSignal): number {
  if (signal.kind === 'centipawns') return signal.value;
  return signal.winner === 'w' ? 12 : -12;
}

function signalUtility(signal: ScoreSignal, perspective: Side): number {
  if (signal.kind === 'centipawns') return signal.value * 100;
  return signal.winner === perspective ? MATE_SENTINEL_CP : -MATE_SENTINEL_CP;
}

function centipawnLoss(best: ScoreSignal, played: ScoreSignal, mover: Side): number {
  if (best.kind === 'mate') {
    if (best.winner === mover) {
      return played.kind === 'mate' && played.winner === mover ? 0 : MATE_SENTINEL_CP;
    }
    // If the best line already loses by force, a different forced-loss line or a non-mating
    // line is not a worse result than the engine's baseline.
    return 0;
  }

  if (played.kind === 'mate') {
    return played.winner === mover ? 0 : MATE_SENTINEL_CP;
  }

  return Math.max(0, (best.value - played.value) * 100);
}

export function qualityCategoryForCentipawnLoss(loss: number): MoveCategory {
  if (loss <= 10) return 'Best';
  if (loss <= 30) return 'Excellent';
  if (loss <= 60) return 'Good';
  if (loss <= 100) return 'Inaccuracy';
  if (loss <= 200) return 'Mistake';
  return 'Blunder';
}

function firstUci(line: EngineLine | undefined): string | undefined {
  return line?.uci[0];
}

function simulateUciLine(fen: string, uci: string[]): string {
  const chess = new Chess(fen);
  for (const token of uci.slice(0, MAX_TACTIC_LINE_PLIES)) {
    if (chess.isGameOver()) break;
    const match = token.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match) break;
    try {
      chess.move({
        from: match[1] as `${string}${number}`,
        to: match[2] as `${string}${number}`,
        ...(match[3] ? { promotion: match[3] as 'q' | 'r' | 'b' | 'n' } : {}),
      });
    } catch {
      break;
    }
  }
  return chess.fen();
}

function materialGainAlongLine(fen: string, color: Side, uci: string[]): number {
  const finalFen = simulateUciLine(fen, uci);
  return materialBalance(finalFen, color) - materialBalance(fen, color);
}

function playedMoveUci(position: ChessSnapshot): string | undefined {
  const move = position.move;
  if (!move) return undefined;
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function mateProvedByBestReply(
  positionAfterMove: ChessSnapshot,
  opponentReplyPosition: ChessSnapshot | undefined,
  after: PositionEvaluation,
  replyEvaluation: PositionEvaluation | undefined,
  mover: Side,
): ForcedMateProof | undefined {
  if (!positionAfterMove.san?.includes('+') || !opponentReplyPosition || !replyEvaluation?.lines[0]) return undefined;

  const bestLine = after.lines[0];
  const replyLine = replyEvaluation.lines[0];
  const bestReply = firstUci(bestLine);
  const actualReply = playedMoveUci(opponentReplyPosition);
  if (!bestReply || bestReply !== actualReply) return undefined;

  const replySignal = outcomeForLine(replyLine, replyEvaluation, opponentReplyPosition.fen, mover);
  if (replySignal.kind !== 'mate' || replySignal.winner !== mover) return undefined;

  const replySan = bestLine?.san[0] ?? opponentReplyPosition.san;
  return {
    signal: replySignal,
    line: [...(replySan ? [replySan] : []), ...replyLine.san],
    mateIn: Math.abs(replyLine.mate ?? 0),
  };
}

function isTacticalMiss(
  before: PositionEvaluation,
  after: PositionEvaluation,
  beforeFen: string,
  playedUci: string,
  mover: Side,
  bestSignal: ScoreSignal,
  playedSignal: ScoreSignal,
): boolean {
  if (playedSignal.kind === 'mate' && playedSignal.winner !== mover) return false;

  if (bestSignal.kind === 'mate') {
    if (bestSignal.winner === mover) {
      return !(playedSignal.kind === 'mate' && playedSignal.winner === mover);
    }
    return false;
  }

  if (
    playedSignal.kind === 'centipawns' &&
    bestSignal.value >= MIN_MISS_WINNING_ADVANTAGE &&
    bestSignal.value - playedSignal.value >= MIN_MISS_GAIN_MARGIN
  ) {
    return true;
  }

  const bestLine = before.lines[0];
  if (!bestLine) return false;
  const bestGain = materialGainAlongLine(beforeFen, mover, bestLine.uci);
  if (bestGain < MIN_MISS_GAIN) return false;

  const playedLine = after.lines[0];
  const actualLine = [playedUci, ...(playedLine?.uci ?? [])];
  const actualGain = materialGainAlongLine(beforeFen, mover, actualLine);
  return bestGain - actualGain >= MIN_MISS_GAIN_MARGIN;
}

function isBrilliantSacrifice(
  after: PositionEvaluation,
  beforeFen: string,
  playedUci: string,
  mover: Side,
  loss: number,
  playedSignal: ScoreSignal,
): boolean {
  if (loss > 30 || !after.lines[0]) return false;
  if (playedSignal.kind === 'mate' ? playedSignal.winner !== mover : playedSignal.value < -0.3) return false;

  const playedLine = [playedUci, ...after.lines[0].uci];
  const netMaterialGain = materialGainAlongLine(beforeFen, mover, playedLine);
  return netMaterialGain <= -MIN_BRILLIANT_NET_SACRIFICE;
}

function isGreatMove(
  before: PositionEvaluation,
  beforeFen: string,
  mover: Side,
  loss: number,
): boolean {
  if (loss > 20) return false;

  const distinctCandidates = new Map<string, EngineLine>();
  for (const line of before.lines) {
    const move = firstUci(line);
    if (move && !distinctCandidates.has(move)) distinctCandidates.set(move, line);
  }
  const candidates = [...distinctCandidates.values()]
    .map((line) => ({ line, utility: signalUtility(outcomeForLine(line, before, beforeFen, mover), mover) }))
    .sort((left, right) => right.utility - left.utility);

  if (candidates.length < 2) return false;
  return candidates[0].utility - candidates[1].utility >= 80;
}

function isCheckmatePosition(fen: string): boolean {
  try {
    return new Chess(fen).isCheckmate();
  } catch {
    return false;
  }
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

    const mover: Side = ply % 2 === 1 ? 'w' : 'b';
    const beforeFen = positions[ply - 1].fen;
    const playedFen = positions[ply].fen;
    const bestLine = before.lines[0];
    const playedLine = after.lines[0];
    const bestSignal = outcomeForLine(bestLine, before, beforeFen, mover);
    const playedSignal = outcomeForLine(playedLine, after, playedFen, mover);
    const isMate = isCheckmatePosition(playedFen);
    const forcedMateProof = mateProvedByBestReply(
      positions[ply],
      positions[ply + 1],
      after,
      evaluations[ply + 1],
      mover,
    );
    const effectivePlayedSignal = forcedMateProof?.signal ?? playedSignal;
    const loss = isMate ? 0 : centipawnLoss(bestSignal, effectivePlayedSignal, mover);
    const expectedPointsLost = isMate ? 0 : Math.max(
      0,
      expectedScore(signalAsPawns(bestSignal)) - expectedScore(signalAsPawns(effectivePlayedSignal)),
    );
    const playedUci = playedMoveUci(positions[ply]);
    let category: MoveCategory;

    if (startsFromStandardPosition && isKnownBookPly(sans, ply)) {
      category = 'Book';
    } else if (isMate) {
      category = 'Best';
    } else if (playedUci && isBrilliantSacrifice(after, beforeFen, playedUci, mover, loss, playedSignal)) {
      category = 'Brilliant';
    } else if (isGreatMove(before, beforeFen, mover, loss)) {
      category = 'Great';
    } else if (
      loss >= 100 &&
      playedUci &&
      isTacticalMiss(before, after, beforeFen, playedUci, mover, bestSignal, effectivePlayedSignal)
    ) {
      category = 'Miss';
    } else {
      category = qualityCategoryForCentipawnLoss(loss);
    }

    reviews.push({
      ply,
      color: mover,
      category,
      expectedPointsLost,
      centipawnLoss: loss,
      ...(forcedMateProof ? { forcedMate: { line: forcedMateProof.line, mateIn: forcedMateProof.mateIn } } : {}),
    });
  }

  return reviews;
}

export function accuracyForColor(reviews: MoveReview[], color: Side): number | null {
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

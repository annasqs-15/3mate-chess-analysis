import { Chess, DEFAULT_POSITION, type Square } from 'chess.js';
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
const BRILLIANT_MAX_ROOT_LOSS_CP = 30;
const BRILLIANT_MIN_RESULT_PAWNS = -0.5;
const BRILLIANT_ALREADY_WINNING_PAWNS = 5;
const BRILLIANT_RECOVERY_PLIES = 3;
const BRILLIANT_RECOVERY_NODE_LIMIT = 512;

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

interface RecoveryBudget {
  nodes: number;
}

function exactAtDepth(line: EngineLine | undefined, depth: number): line is EngineLine {
  return Boolean(line && line.depth === depth && !line.bound && line.uci.length > 0);
}

function rootMoveLoss(
  before: PositionEvaluation,
  beforeFen: string,
  playedUci: string,
  mover: Side,
): number | undefined {
  const bestLine = before.lines[0];
  if (!bestLine || before.depth < 1 || !exactAtDepth(bestLine, before.depth)) return undefined;
  const playedLine = before.lines.find((line) => firstUci(line) === playedUci);
  if (!exactAtDepth(playedLine, before.depth)) return undefined;
  return centipawnLoss(
    outcomeForLine(bestLine, before, beforeFen, mover),
    outcomeForLine(playedLine, before, beforeFen, mover),
    mover,
  );
}

function isWinningFor(signal: ScoreSignal, side: Side): boolean {
  return signal.kind === 'mate' ? signal.winner === side : signal.value >= BRILLIANT_ALREADY_WINNING_PAWNS;
}

function hasCompetitiveAlternatives(
  before: PositionEvaluation,
  beforeFen: string,
  playedUci: string,
  mover: Side,
): boolean {
  const bestLine = before.lines[0];
  if (!bestLine || before.depth < 1 || !exactAtDepth(bestLine, before.depth)) return false;
  if (!isWinningFor(outcomeForLine(bestLine, before, beforeFen, mover), mover)) return true;

  const alternatives = new Map<string, ScoreSignal>();
  for (const line of before.lines) {
    const move = firstUci(line);
    if (!move || move === playedUci || !exactAtDepth(line, before.depth) || alternatives.has(move)) continue;
    alternatives.set(move, outcomeForLine(line, before, beforeFen, mover));
  }
  if (alternatives.size === 0) return false;

  const strongestAlternative = [...alternatives.values()]
    .sort((left, right) => signalUtility(right, mover) - signalUtility(left, mover))[0];
  return strongestAlternative.kind === 'centipawns'
    && strongestAlternative.value < BRILLIANT_ALREADY_WINNING_PAWNS;
}

function recoveryMoves(chess: Chess) {
  const inCheck = chess.isCheck();
  return chess.moves({ verbose: true }).filter((move) => Boolean(move.captured || move.promotion || inCheck));
}

function bestMaterialAfterRecovery(
  chess: Chess,
  mover: Side,
  depth: number,
  budget: RecoveryBudget,
  alpha = Number.NEGATIVE_INFINITY,
  beta = Number.POSITIVE_INFINITY,
): number | undefined {
  const current = materialBalance(chess.fen(), mover);
  if (depth === 0) return current;
  budget.nodes += 1;
  if (budget.nodes > BRILLIANT_RECOVERY_NODE_LIMIT) return undefined;

  const maximizing = chess.turn() === mover;
  let best = current; // Either player may decline further optional exchanges.
  for (const move of recoveryMoves(chess)) {
    chess.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
    const value = bestMaterialAfterRecovery(chess, mover, depth - 1, budget, alpha, beta);
    chess.undo();
    if (value === undefined) return undefined;
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function hasNetPieceSacrifice(
  beforeFen: string,
  afterFen: string,
  playedUci: string,
  mover: Side,
): boolean {
  const moveMatch = playedUci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!moveMatch) return false;
  const [, from, to] = moveMatch;
  const before = new Chess(beforeFen);
  const alternatives = before.moves({ verbose: true }).filter((move) =>
    `${move.from}${move.to}${move.promotion ?? ''}` !== playedUci,
  );

  const after = new Chess(afterFen);
  const offeredPiece = after.get(to as Square);
  if (!offeredPiece || offeredPiece.color !== mover || offeredPiece.type === 'p' || offeredPiece.type === 'k') return false;
  const acceptances = after.moves({ verbose: true }).filter((move) => move.to === to && move.captured);
  if (acceptances.length === 0) return false;

  const startingBalance = materialBalance(beforeFen, mover);
  const budget: RecoveryBudget = { nodes: 0 };

  // A sacrifice is voluntary only if another legal choice could avoid its local loss.
  let hasAvoidingAlternative = false;
  for (const alternative of alternatives) {
    const board = new Chess(beforeFen);
    board.move({
      from: alternative.from,
      to: alternative.to,
      ...(alternative.promotion ? { promotion: alternative.promotion } : {}),
    });
    const alternativeSquare = alternative.from === from ? alternative.to : from;
    const remainingPiece = board.get(alternativeSquare as Square);
    if (!remainingPiece || remainingPiece.color !== mover) continue;
    const alternativeAcceptances = board.moves({ verbose: true }).filter((move) =>
      move.to === alternativeSquare && move.captured,
    );
    if (alternativeAcceptances.length === 0) {
      hasAvoidingAlternative = true;
      break;
    }
    let worstAcceptanceBalance = Number.POSITIVE_INFINITY;
    for (const acceptance of alternativeAcceptances) {
      board.move({
        from: acceptance.from,
        to: acceptance.to,
        ...(acceptance.promotion ? { promotion: acceptance.promotion } : {}),
      });
      const recoveredBalance = bestMaterialAfterRecovery(board, mover, BRILLIANT_RECOVERY_PLIES, budget);
      board.undo();
      if (recoveredBalance === undefined) return false;
      worstAcceptanceBalance = Math.min(worstAcceptanceBalance, recoveredBalance);
    }
    if (worstAcceptanceBalance >= startingBalance - 0.01) {
      hasAvoidingAlternative = true;
      break;
    }
  }
  if (!hasAvoidingAlternative) return false;

  for (const acceptance of acceptances) {
    after.move({ from: acceptance.from, to: acceptance.to, ...(acceptance.promotion ? { promotion: acceptance.promotion } : {}) });
    const recoveredBalance = bestMaterialAfterRecovery(after, mover, BRILLIANT_RECOVERY_PLIES, budget);
    after.undo();
    // Budget exhaustion is lack of evidence, never a positive Brilliant signal.
    if (recoveredBalance === undefined) return false;
    if (recoveredBalance < startingBalance - 0.01) return true;
  }
  return false;
}

function isBrilliantSacrifice(
  before: PositionEvaluation,
  after: PositionEvaluation,
  beforeFen: string,
  afterFen: string,
  playedUci: string,
  mover: Side,
  playedSignal: ScoreSignal,
): boolean {
  const loss = rootMoveLoss(before, beforeFen, playedUci, mover);
  if (loss === undefined || loss > BRILLIANT_MAX_ROOT_LOSS_CP) return false;
  if (!exactAtDepth(after.lines[0], after.depth) || after.depth < 1) return false;
  if (playedSignal.kind === 'mate' ? playedSignal.winner !== mover : playedSignal.value < BRILLIANT_MIN_RESULT_PAWNS) return false;
  if (!hasCompetitiveAlternatives(before, beforeFen, playedUci, mover)) return false;
  return hasNetPieceSacrifice(beforeFen, afterFen, playedUci, mover);
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
  reviewComplete = false,
): MoveReview[] {
  if (!reviewComplete) return [];
  const sans = positions.slice(1).map((position) => position.san ?? '');
  const startsFromStandardPosition = positions[0]?.fen === DEFAULT_POSITION;
  const reviews: MoveReview[] = [];

  for (let ply = 1; ply < positions.length; ply += 1) {
    const before = evaluations[ply - 1];
    const after = evaluations[ply];
    const mover: Side = ply % 2 === 1 ? 'w' : 'b';
    const beforeFen = positions[ply - 1].fen;
    const playedFen = positions[ply].fen;
    const isMate = isCheckmatePosition(playedFen);
    if (!before || (!after && !isMate)) continue;
    const bestLine = before.lines[0];
    const bestSignal = outcomeForLine(bestLine, before, beforeFen, mover);
    const playedSignal: ScoreSignal = isMate
      ? { kind: 'mate', winner: mover }
      : outcomeForLine(after?.lines[0], after!, playedFen, mover);
    const forcedMateProof = after ? mateProvedByBestReply(
      positions[ply], positions[ply + 1], after, evaluations[ply + 1], mover,
    ) : undefined;
    const effectivePlayedSignal = forcedMateProof?.signal ?? playedSignal;
    const loss = isMate ? 0 : centipawnLoss(bestSignal, effectivePlayedSignal, mover);
    const expectedPointsLost = isMate ? 0 : Math.max(
      0,
      expectedScore(signalAsPawns(bestSignal)) - expectedScore(signalAsPawns(effectivePlayedSignal)),
    );
    const playedUci = playedMoveUci(positions[ply]);
    let category: MoveCategory;

    if (isMate) {
      category = 'Best';
    } else if (startsFromStandardPosition && isKnownBookPly(sans, ply)) {
      category = 'Book';
    } else if (!isMate && playedUci && after && isBrilliantSacrifice(
      before, after, beforeFen, playedFen, playedUci, mover, effectivePlayedSignal,
    )) {
      category = 'Brilliant';
    } else if (isGreatMove(before, beforeFen, mover, loss)) {
      category = 'Great';
    } else if (
      loss >= 100 &&
      playedUci &&
      after &&
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

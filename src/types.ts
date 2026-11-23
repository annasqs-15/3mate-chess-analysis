import type { Move, Square } from 'chess.js';

export type GameSource = 'pgn' | 'fen';

export interface ChessSnapshot {
  ply: number;
  fen: string;
  san?: string;
  move?: Move;
  lastMove?: { from: Square; to: Square };
}

export interface ParsedGame {
  positions: ChessSnapshot[];
  headers: Record<string, string>;
  pgn: string;
  source: GameSource;
}

export interface EngineLine {
  uci: string[];
  san: string[];
  evalWhite: number;
  mate?: number;
  bound?: 'lower' | 'upper';
  depth: number;
}

export interface PositionEvaluation {
  fen: string;
  evalWhite: number;
  lines: EngineLine[];
  depth: number;
}

export type MoveCategory =
  | 'Brilliant'
  | 'Great'
  | 'Best'
  | 'Excellent'
  | 'Good'
  | 'Book'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Miss'
  | 'Blunder';

export interface MoveReview {
  ply: number;
  color: 'w' | 'b';
  category: MoveCategory;
  expectedPointsLost: number;
  centipawnLoss: number;
  forcedMate?: { line: string[]; mateIn: number };
}

import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Move, Square } from 'chess.js';
import type { ChessSnapshot, ParsedGame } from '../types';

export function parsePgn(text: string): ParsedGame {
  const pgn = text.trim();
  if (!pgn) throw new Error('Paste a PGN game first.');

  const game = new Chess();
  try {
    game.loadPgn(pgn);
  } catch {
    throw new Error('This PGN could not be parsed. Check the notation and try again.');
  }

  const headers = game.header() as Record<string, string>;
  const initialFen = headers.FEN || DEFAULT_POSITION;
  const replay = new Chess(initialFen);
  const history = game.history({ verbose: true });
  const positions: ChessSnapshot[] = [{ ply: 0, fen: replay.fen() }];

  history.forEach((move: Move, index: number) => {
    const played = replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    positions.push({
      ply: index + 1,
      fen: replay.fen(),
      san: played.san,
      move: played,
      lastMove: { from: played.from, to: played.to },
    });
  });

  return {
    positions,
    headers,
    pgn: game.pgn(),
    source: 'pgn',
  };
}

export function parseFen(text: string): ParsedGame {
  const fen = text.trim();
  if (!fen) throw new Error('Paste a FEN position first.');

  try {
    const chess = new Chess(fen);
    return {
      positions: [{ ply: 0, fen: chess.fen() }],
      headers: {},
      pgn: '',
      source: 'fen',
    };
  } catch {
    throw new Error('This FEN position is invalid. Check all six fields and try again.');
  }
}

export function appendMoveToGame(
  game: ParsedGame,
  currentPly: number,
  from: Square,
  to: Square,
  promotion?: 'q' | 'r' | 'b' | 'n',
): { game: ParsedGame; ply: number } {
  const prefix = game.positions.slice(0, currentPly + 1);
  const chess = new Chess(prefix[prefix.length - 1].fen);
  const move = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
  const nextPly = prefix.length;
  const positions = [
    ...prefix,
    {
      ply: nextPly,
      fen: chess.fen(),
      san: move.san,
      move,
      lastMove: { from: move.from, to: move.to },
    },
  ];

  return {
    game: { ...game, positions, pgn: '' },
    ply: nextPly,
  };
}

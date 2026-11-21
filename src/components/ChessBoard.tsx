import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { RotateCcw } from 'lucide-react';

const PROMOTIONS = ['q', 'r', 'b', 'n'] as const;
type Promotion = (typeof PROMOTIONS)[number];

interface ChessBoardProps {
  fen: string;
  flipped: boolean;
  onFlip: () => void;
  onMove: (from: Square, to: Square, promotion?: Promotion) => void;
  lastMove?: { from: Square; to: Square };
}

export default function ChessBoard({ fen, flipped, onFlip, onMove, lastMove }: ChessBoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square; color: 'w' | 'b' } | null>(null);
  const game = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);
  const files = flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const targets = useMemo(() => {
    if (!selected) return new Set<Square>();
    try { return new Set(game.moves({ square: selected, verbose: true }).map((move) => move.to)); }
    catch { return new Set<Square>(); }
  }, [game, selected]);
  const board = game.board();
  const turn = game.turn();

  function handleSquareClick(square: Square): void {
    if (selected && targets.has(square)) {
      const piece = game.get(selected);
      const targetRank = square[1];
      if (piece?.type === 'p' && ((piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1'))) {
        setPromotionMove({ from: selected, to: square, color: piece.color });
        return;
      }
      onMove(selected, square);
      setSelected(null);
      return;
    }

    const piece = game.get(square);
    setSelected(piece?.color === turn ? square : null);
  }

  function pieceImage(color: 'w' | 'b', type: string): string {
    return `${import.meta.env.BASE_URL}pieces/${color}${type}.svg`;
  }

  return (
    <div className="board-wrap">
      <div className="board-frame">
        <div className="chess-board" role="grid" aria-label={`Chessboard, ${turn === 'w' ? 'White' : 'Black'} to move`}>
          {ranks.map((rank, rowIndex) => files.map((file, columnIndex) => {
            const square = `${file}${rank}` as Square;
            const boardPiece = board[8 - rank][file.charCodeAt(0) - 97];
            const isDark = (file.charCodeAt(0) - 97 + rank) % 2 === 1;
            const isLast = lastMove?.from === square || lastMove?.to === square;
            const isSelected = selected === square;
            const isTarget = targets.has(square);
            const fileLabel = rowIndex === 7 ? file : '';
            const rankLabel = columnIndex === 0 ? String(rank) : '';
            return (
              <button
                key={square}
                type="button"
                role="gridcell"
                className={`board-square ${isDark ? 'square-dark' : 'square-light'}${isLast ? ' square-last' : ''}${isSelected ? ' square-selected' : ''}`}
                onClick={() => handleSquareClick(square)}
                aria-label={`${square}${boardPiece ? `, ${boardPiece.color === 'w' ? 'White' : 'Black'} ${boardPiece.type}` : ''}`}
              >
                {rankLabel && <span className="coordinate coordinate-rank">{rankLabel}</span>}
                {fileLabel && <span className="coordinate coordinate-file">{fileLabel}</span>}
                {boardPiece && <img className="chess-piece" src={pieceImage(boardPiece.color, boardPiece.type)} alt="" draggable={false} />}
                {isTarget && <span className={boardPiece ? 'legal-capture' : 'legal-dot'} />}
              </button>
            );
          }))}
        </div>
      </div>
      <div className="board-underbar">
        <span className="board-turn"><span className={`turn-dot ${turn === 'w' ? 'turn-white' : 'turn-black'}`} />{turn === 'w' ? 'White to move' : 'Black to move'}</span>
        <button className="icon-button board-flip" type="button" onClick={onFlip} title="Flip board" aria-label="Flip board"><RotateCcw size={16} /></button>
      </div>
      {promotionMove && (
        <div className="promotion-shade" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
          <div className="promotion-card">
            <p>Promote pawn</p>
            <div className="promotion-options">
              {PROMOTIONS.map((piece) => (
                <button key={piece} type="button" onClick={() => {
                  onMove(promotionMove.from, promotionMove.to, piece);
                  setSelected(null);
                  setPromotionMove(null);
                }} aria-label={`Promote to ${piece}`}>
                  <img src={pieceImage(promotionMove.color, piece)} alt="" />
                </button>
              ))}
            </div>
            <button className="text-button" type="button" onClick={() => setPromotionMove(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

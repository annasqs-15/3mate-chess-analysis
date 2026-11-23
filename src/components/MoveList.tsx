import type { ChessSnapshot, MoveCategory, MoveReview } from '../types';
import MoveIcon from './MoveIcon';

const BADGE_CATEGORIES = new Set<MoveCategory>([
  'Brilliant', 'Great', 'Book', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder',
]);

interface MoveListProps {
  positions: ChessSnapshot[];
  reviews: MoveReview[];
  currentPly: number;
  onSelect: (ply: number) => void;
}

export default function MoveList({ positions, reviews, currentPly, onSelect }: MoveListProps) {
  const moves = positions.slice(1);
  const reviewByPly = new Map(reviews.map((review) => [review.ply, review]));
  const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => index);

  if (!moves.length) {
    return <div className="move-list-empty">No moves in this position yet. Make a move on the board to explore.</div>;
  }

  return (
    <div className="move-list" aria-label="Game moves">
      <div className="move-list-head"><span>Move</span><span>White</span><span>Black</span></div>
      {rows.map((row) => {
        const whitePly = row * 2 + 1;
        const blackPly = whitePly + 1;
        const whiteMove = moves[whitePly - 1];
        const blackMove = moves[blackPly - 1];
        return (
          <div className="move-row" key={row}>
            <span className="move-number">{row + 1}.</span>
            {[whiteMove, blackMove].map((move, sideIndex) => {
              if (!move) return <span className="move-cell move-cell-empty" key={sideIndex}>—</span>;
              const ply = move.ply;
              const review = reviewByPly.get(ply);
              return (
                <button
                  key={ply}
                  type="button"
                  className={`move-cell${currentPly === ply ? ' move-cell-active' : ''}`}
                  onClick={() => onSelect(ply)}
                  aria-current={currentPly === ply ? 'step' : undefined}
                >
                  {review && BADGE_CATEGORIES.has(review.category) && <MoveIcon category={review.category} small />}
                  <span>{move.san}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

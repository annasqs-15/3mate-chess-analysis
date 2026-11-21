import type { MoveCategory } from '../types';

const STYLES: Record<MoveCategory, { glyph: string; className: string; title: string }> = {
  Brilliant: { glyph: '!!', className: 'brilliant', title: 'Brilliant move' },
  Great: { glyph: '!', className: 'great', title: 'Great move' },
  Best: { glyph: '★', className: 'best', title: 'Best move' },
  Excellent: { glyph: '↑', className: 'excellent', title: 'Excellent move' },
  Good: { glyph: '✓', className: 'good', title: 'Good move' },
  Book: { glyph: '▤', className: 'book', title: 'Book move' },
  Inaccuracy: { glyph: '?!', className: 'inaccuracy', title: 'Inaccuracy' },
  Mistake: { glyph: '?', className: 'mistake', title: 'Mistake' },
  Miss: { glyph: '×', className: 'miss', title: 'Missed opportunity' },
  Blunder: { glyph: '??', className: 'blunder', title: 'Blunder' },
};

interface MoveIconProps {
  category: MoveCategory;
  showLabel?: boolean;
  small?: boolean;
}

export default function MoveIcon({ category, showLabel = false, small = false }: MoveIconProps) {
  const style = STYLES[category];
  return (
    <span className={`move-mark ${style.className}${small ? ' move-mark-small' : ''}`} title={style.title} aria-label={style.title}>
      <span className="move-mark-symbol" aria-hidden="true">{style.glyph}</span>
      {showLabel && <span className="move-mark-label">{category}</span>}
    </span>
  );
}

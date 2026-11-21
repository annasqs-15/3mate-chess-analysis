import { useMemo } from 'react';
import type { PointerEvent } from 'react';
import type { PositionEvaluation } from '../types';

interface EvaluationChartProps {
  evaluations: Array<PositionEvaluation | undefined>;
  currentPly: number;
  onSelect: (ply: number) => void;
}

const WIDTH = 560;
const HEIGHT = 160;
const PAD = { top: 12, right: 18, bottom: 20, left: 34 };
const LIMIT = 5;

export default function EvaluationChart({ evaluations, currentPly, onSelect }: EvaluationChartProps) {
  const points = useMemo(() => {
    const available = evaluations.flatMap((item, index) => item ? [{ index, score: item.evalWhite }] : []);
    const plotWidth = WIDTH - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    return available.map(({ index, score }) => ({
      index,
      x: PAD.left + (evaluations.length <= 1 ? plotWidth / 2 : (index / (evaluations.length - 1)) * plotWidth),
      y: PAD.top + ((LIMIT - Math.max(-LIMIT, Math.min(LIMIT, score))) / (LIMIT * 2)) * plotHeight,
      score,
    }));
  }, [evaluations]);

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const centerY = PAD.top + (HEIGHT - PAD.top - PAD.bottom) / 2;
  const activePoint = points.find((point) => point.index === currentPly);
  const maxPly = Math.max(0, evaluations.length - 1);

  function choosePly(event: PointerEvent<SVGRectElement>): void {
    if (!maxPly) return;
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    onSelect(Math.round(ratio * maxPly));
  }

  return (
    <div className="chart-shell">
      <div className="chart-labels"><span>+5</span><span>0</span><span>−5</span></div>
      <svg className="evaluation-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Evaluation graph, White advantage above the center line">
        <defs>
          <linearGradient id="evalFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6c9a56" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#6c9a56" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect x={PAD.left} y={PAD.top} width={WIDTH - PAD.left - PAD.right} height={centerY - PAD.top} className="chart-white-zone" />
        <rect x={PAD.left} y={centerY} width={WIDTH - PAD.left - PAD.right} height={HEIGHT - PAD.bottom - centerY} className="chart-black-zone" />
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={centerY} y2={centerY} className="chart-zero" />
        {points.length > 1 && <path d={`${path} L ${points[points.length - 1].x} ${HEIGHT - PAD.bottom} L ${points[0].x} ${HEIGHT - PAD.bottom} Z`} fill="url(#evalFill)" />}
        {points.length > 0 && <path d={path} className="chart-line" />}
        <rect x={PAD.left} y={PAD.top} width={WIDTH - PAD.left - PAD.right} height={HEIGHT - PAD.top - PAD.bottom} fill="transparent" onPointerDown={choosePly} />
        {activePoint && <circle cx={activePoint.x} cy={activePoint.y} r="4.5" className="chart-current" />}
      </svg>
      {points.length > 0 && <div className="chart-captions"><span>White advantage</span><span>Move {Math.ceil(currentPly / 2)}</span><span>Black advantage</span></div>}
      {evaluations.length === 0 && <div className="chart-empty">Run a review to chart the evaluation.</div>}
    </div>
  );
}

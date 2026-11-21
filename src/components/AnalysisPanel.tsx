import { Activity, ArrowRight, Cpu, Play, ShieldCheck, Sparkles } from 'lucide-react';
import type { EngineLine, MoveCategory, MoveReview, PositionEvaluation } from '../types';
import MoveIcon from './MoveIcon';
import { formatEvaluation } from '../lib/format';

interface AnalysisPanelProps {
  evaluation?: PositionEvaluation;
  reviews: MoveReview[];
  currentReview?: MoveReview;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  isAnalyzing: boolean;
  progress: { done: number; total: number };
  error: string;
  onAnalyze: () => void;
  onPlayLine: (line: EngineLine) => void;
}

const CATEGORY_ORDER: MoveCategory[] = ['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Book', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder'];

export default function AnalysisPanel({
  evaluation,
  reviews,
  currentReview,
  whiteAccuracy,
  blackAccuracy,
  isAnalyzing,
  progress,
  error,
  onAnalyze,
  onPlayLine,
}: AnalysisPanelProps) {
  const counts = CATEGORY_ORDER.map((category) => ({ category, count: reviews.filter((review) => review.category === category).length })).filter((item) => item.count > 0);
  const topLines = evaluation?.lines ?? [];

  return (
    <aside className="analysis-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">POSITION REVIEW</span>
          <h2>Engine analysis</h2>
        </div>
        <div className="engine-chip"><span className="engine-pulse" /><Cpu size={13} /> Local engine</div>
      </div>

      <div className="eval-card">
        <div className="eval-topline">
          <div>
            <span className="subtle-label">POSITION EVALUATION</span>
            <div className={`eval-number ${(evaluation?.evalWhite ?? 0) >= 0 ? 'eval-positive' : 'eval-negative'}`}>
              {evaluation ? formatEvaluation(evaluation.evalWhite) : '—'}
            </div>
          </div>
          {currentReview && <MoveIcon category={currentReview.category} showLabel />}
          {evaluation && !currentReview && <span className="depth-tag">Depth {evaluation.depth}</span>}
        </div>
        <div className="eval-meter" aria-label={evaluation ? `Evaluation ${formatEvaluation(evaluation.evalWhite)} for White` : 'Evaluation not available'}>
          <span className="eval-meter-white" style={{ width: `${evaluation ? Math.max(8, Math.min(92, 50 + evaluation.evalWhite * 8)) : 50}%` }} />
          <span className="eval-meter-center" />
        </div>
        <div className="meter-legend"><span>Black</span><span>Equal</span><span>White</span></div>
      </div>

      <div className="line-section">
        <div className="section-title-row">
          <div><span className="eyebrow">TOP LINES</span><h3>Best continuations</h3></div>
          {evaluation && <span className="depth-tag">Depth {evaluation.depth}</span>}
        </div>
        {topLines.length ? (
          <div className="variation-list">
            {topLines.map((line, index) => (
              <button className="variation-row" key={`${line.uci[0] ?? index}-${index}`} type="button" onClick={() => onPlayLine(line)}>
                <span className={`variation-number${index === 0 ? ' variation-number-best' : ''}`}>{index + 1}</span>
                <span className="variation-text">{line.san.slice(0, 9).join(' ') || 'Line unavailable'}</span>
                <span className={`variation-eval${line.evalWhite >= 0 ? ' eval-positive' : ' eval-negative'}`}>{formatEvaluation(line.evalWhite)}</span>
                <ArrowRight className="variation-arrow" size={14} />
              </button>
            ))}
          </div>
        ) : (
          <div className="lines-empty"><Activity size={19} /><span>Run a local review to see engine lines and move feedback.</span></div>
        )}
      </div>

      <button className="review-button" type="button" onClick={onAnalyze} disabled={isAnalyzing}>
        {isAnalyzing ? <span className="button-spinner" /> : <Play size={15} fill="currentColor" />}
        {isAnalyzing ? `Reviewing ${progress.done} / ${progress.total} positions` : reviews.length ? 'Run review again' : 'Analyze this game'}
      </button>
      {isAnalyzing && <div className="progress-track"><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
      {error && <div className="engine-error" role="alert">{error}</div>}

      <div className="privacy-note"><ShieldCheck size={16} /><span>Analysis runs on this device. PGN and FEN are never uploaded.</span></div>

      <div className="review-summary">
        <div className="section-title-row"><div><span className="eyebrow">GAME REVIEW</span><h3>Move quality</h3></div><Sparkles size={16} className="summary-sparkle" /></div>
        <div className="accuracy-row">
          <div className="accuracy-player"><span className="accuracy-avatar white-avatar">W</span><span>White</span><strong>{whiteAccuracy === null ? '—' : `${whiteAccuracy}%`}</strong></div>
          <div className="accuracy-player"><span className="accuracy-avatar black-avatar">B</span><span>Black</span><strong>{blackAccuracy === null ? '—' : `${blackAccuracy}%`}</strong></div>
        </div>
        {counts.length > 0 ? (
          <div className="category-counts">
            {counts.map(({ category, count }) => <div className="category-count" key={category}><MoveIcon category={category} small /><span>{category}</span><strong>{count}</strong></div>)}
          </div>
        ) : <p className="summary-empty">Classifications will appear after the review finishes.</p>}
        <p className="heuristic-note">Scores and labels are 3mate estimates based on local engine evaluations.</p>
      </div>
    </aside>
  );
}

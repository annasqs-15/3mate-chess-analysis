import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import { ChevronLeft, ChevronRight, Clipboard, FilePlus2, Flag, Keyboard, RotateCcw, Shield, Sparkles } from 'lucide-react';
import AnalysisPanel from './components/AnalysisPanel';
import ChessBoard from './components/ChessBoard';
import EvaluationChart from './components/EvaluationChart';
import ImportDialog from './components/ImportDialog';
import MoveList from './components/MoveList';
import { appendMoveToGame, parseFen, parsePgn } from './lib/pgn';
import { accuracyForColor, classifyMoves } from './lib/scoring';
import { LocalStockfish } from './lib/engine';
import { playerName } from './lib/format';
import type { EngineLine, GameSource, ParsedGame, PositionEvaluation } from './types';

const DEMO_PGN = `[Event "Ruy Lopez · study sample"]
[Site "3mate local demo"]
[Date "2024.01.01"]
[Round "1"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 *`;

export default function App() {
  const [game, setGame] = useState<ParsedGame>(() => parsePgn(DEMO_PGN));
  const [currentPly, setCurrentPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [evaluations, setEvaluations] = useState<Array<PositionEvaluation | undefined>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [engineError, setEngineError] = useState('');
  const [toast, setToast] = useState('');
  const engineRef = useRef<LocalStockfish | null>(null);
  const runIdRef = useRef(0);
  const currentSnapshot = game.positions[Math.min(currentPly, game.positions.length - 1)];
  const currentEvaluation = evaluations[currentPly];
  const reviews = useMemo(() => classifyMoves(game.positions, evaluations), [game.positions, evaluations]);
  const currentReview = reviews.find((review) => review.ply === currentPly);
  const whiteAccuracy = accuracyForColor(reviews, 'w');
  const blackAccuracy = accuracyForColor(reviews, 'b');
  const lastMove = currentSnapshot.lastMove;
  const positionList = game.positions;
  const gameLabel = game.headers.Event && game.headers.Event !== '?' ? game.headers.Event : 'Imported chess game';
  const whiteName = playerName(game.headers.White, 'White');
  const blackName = playerName(game.headers.Black, 'Black');
  const evaluationValues = evaluations;

  const cancelReview = useCallback(() => {
    runIdRef.current += 1;
    engineRef.current?.stop();
    setIsAnalyzing(false);
  }, []);

  useEffect(() => () => {
    runIdRef.current += 1;
    engineRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectPly = useCallback((ply: number) => {
    setCurrentPly(Math.max(0, Math.min(ply, game.positions.length - 1)));
  }, [game.positions.length]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      const active = document.activeElement;
      if (importOpen || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLButtonElement) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); setCurrentPly((ply) => Math.max(0, ply - 1)); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setCurrentPly((ply) => Math.min(game.positions.length - 1, ply + 1)); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [game.positions.length, importOpen]);

  function importGame(mode: GameSource, text: string): string | null {
    try {
      const parsed = mode === 'pgn' ? parsePgn(text) : parseFen(text);
      cancelReview();
      setGame(parsed);
      setCurrentPly(0);
      setEvaluations([]);
      setProgress({ done: 0, total: 0 });
      setEngineError('');
      setFlipped(false);
      setToast(mode === 'pgn' ? 'PGN loaded locally' : 'FEN position loaded locally');
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not load this game.';
    }
  }

  function makeMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): void {
    try {
      cancelReview();
      const result = appendMoveToGame(game, currentPly, from, to, promotion);
      setGame(result.game);
      setCurrentPly(result.ply);
      setEvaluations([]);
      setProgress({ done: 0, total: 0 });
      setEngineError('');
    } catch {
      setToast('That move is not legal in this position.');
    }
  }

  async function analyzeGame(): Promise<void> {
    if (isAnalyzing) return;
    const runId = ++runIdRef.current;
    setIsAnalyzing(true);
    setEngineError('');
    setEvaluations([]);
    setProgress({ done: 0, total: positionList.length });
    const result = new Array<PositionEvaluation | undefined>(positionList.length);

    try {
      const worker = engineRef.current ?? new LocalStockfish();
      engineRef.current = worker;
      await worker.ready();
      for (let index = 0; index < positionList.length; index += 1) {
        if (runIdRef.current !== runId) return;
        result[index] = await worker.analyze(positionList[index].fen, 10, 3);
        if (runIdRef.current !== runId) return;
        setEvaluations([...result]);
        setProgress({ done: index + 1, total: positionList.length });
      }
      setToast('Local review complete');
    } catch (error) {
      if (runIdRef.current === runId) {
        setEngineError(error instanceof Error ? error.message : 'The local engine could not start.');
      }
    } finally {
      if (runIdRef.current === runId) setIsAnalyzing(false);
    }
  }

  function exploreLine(line: EngineLine): void {
    const firstMove = line.uci[0];
    const match = firstMove?.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match) return;
    makeMove(match[1] as Square, match[2] as Square, match[3] as 'q' | 'r' | 'b' | 'n' | undefined);
  }

  async function copyCurrentFen(): Promise<void> {
    try {
      await navigator.clipboard.writeText(currentSnapshot.fen);
      setToast('FEN copied to clipboard');
    } catch {
      setToast('Clipboard access is unavailable in this browser');
    }
  }

  const gameResult = game.headers.Result && game.headers.Result !== '*' ? game.headers.Result : 'In progress';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="3mate home">
          <span className="brand-mark"><span>3</span><span>m</span></span>
          <span className="brand-word">3mate<span className="brand-dot">.</span></span>
        </a>
        <div className="topbar-center"><span className="workspace-tag"><span className="workspace-dot" /> GAME REVIEW</span><span className="topbar-divider" /><span className="topbar-private"><Shield size={14} /> Private by design</span></div>
        <div className="topbar-actions">
          <button className="quiet-button copy-button" type="button" onClick={() => void copyCurrentFen()}><Clipboard size={15} /><span>Copy FEN</span></button>
          <button className="primary-button top-import" type="button" onClick={() => setImportOpen(true)}><FilePlus2 size={16} /><span>Import game</span></button>
        </div>
      </header>

      <main className="main-content">
        <div className="page-intro">
          <div>
            <div className="breadcrumb"><span>ANALYSIS STUDIO</span><ChevronRight size={12} /><span>GAME REVIEW</span></div>
            <h1>Make every move <span>make sense.</span></h1>
            <p>Review a game, find the turning points, and see what the engine saw — all on your device.</p>
          </div>
          <div className="privacy-pill"><Shield size={14} /> No account. No upload. Just chess.</div>
        </div>

        <div className="game-meta-card">
          <div className="game-meta-icon"><Sparkles size={18} /></div>
          <div className="game-meta-text"><span className="eyebrow">CURRENT GAME</span><strong>{gameLabel}</strong></div>
          <div className="player-pair"><span className="player-name"><i className="player-dot player-dot-white" />{whiteName}</span><span className="vs-divider">vs</span><span className="player-name"><i className="player-dot player-dot-black" />{blackName}</span></div>
          <span className={`result-chip${gameResult === 'In progress' ? ' result-live' : ''}`}>{gameResult}</span>
          <button className="icon-button meta-refresh" type="button" title="Reload demo game" aria-label="Reload demo game" onClick={() => { cancelReview(); setGame(parsePgn(DEMO_PGN)); setCurrentPly(0); setEvaluations([]); setEngineError(''); }}><RotateCcw size={16} /></button>
        </div>

        <div className="review-layout">
          <section className="board-column" aria-label="Game board and moves">
            <div className="board-card">
              <div className="opponent-strip"><span className="player-avatar black-avatar">B</span><span className="opponent-name">{blackName}</span><span className="opponent-rating">{game.headers.BlackElo ? `(${game.headers.BlackElo})` : 'Opponent'}</span><span className="clock-label">{game.headers.TimeControl ?? 'ANALYSIS'}</span></div>
              <ChessBoard fen={currentSnapshot.fen} flipped={flipped} onFlip={() => setFlipped((value) => !value)} onMove={makeMove} lastMove={lastMove} />
              <div className="player-strip"><span className="player-avatar white-avatar">W</span><span className="opponent-name">{whiteName}</span><span className="opponent-rating">{game.headers.WhiteElo ? `(${game.headers.WhiteElo})` : 'You'}</span><span className="clock-label">{game.headers.Date && game.headers.Date !== '?' ? game.headers.Date : '3MATE REVIEW'}</span></div>
              <div className="board-controls">
                <span className="move-position">{currentPly === 0 ? 'Starting position' : `${Math.ceil(currentPly / 2)}${currentPly % 2 ? '…' : '.'} ${currentSnapshot.san ?? ''}`}</span>
                <div className="navigation-buttons">
                  <button className="icon-button nav-step" type="button" onClick={() => selectPly(0)} disabled={currentPly === 0} aria-label="Go to start"><Flag size={15} /></button>
                  <button className="icon-button nav-step" type="button" onClick={() => selectPly(currentPly - 1)} disabled={currentPly === 0} aria-label="Previous move"><ChevronLeft size={18} /></button>
                  <button className="icon-button nav-step nav-step-next" type="button" onClick={() => selectPly(currentPly + 1)} disabled={currentPly >= positionList.length - 1} aria-label="Next move"><ChevronRight size={18} /></button>
                  <button className="icon-button nav-step" type="button" onClick={() => selectPly(positionList.length - 1)} disabled={currentPly >= positionList.length - 1} aria-label="Go to end"><Flag size={15} /></button>
                </div>
                <span className="ply-count">{currentPly} / {positionList.length - 1}</span>
              </div>
            </div>

            <div className="content-card chart-card">
              <div className="section-title-row"><div><span className="eyebrow">GAME FLOW</span><h2>Evaluation graph</h2></div><span className="chart-legend"><i className="legend-dot-white" /> White <i className="legend-dot-black" /> Black</span></div>
              <EvaluationChart evaluations={evaluationValues} currentPly={currentPly} onSelect={selectPly} />
            </div>

            <div className="content-card moves-card">
              <div className="section-title-row moves-title-row"><div><span className="eyebrow">MOVE BY MOVE</span><h2>Game notation</h2></div><span className="keyboard-hint"><Keyboard size={14} /> Use ← → to step</span></div>
              <MoveList positions={positionList} reviews={reviews} currentPly={currentPly} onSelect={selectPly} />
            </div>
          </section>

          <AnalysisPanel
            evaluation={currentEvaluation}
            reviews={reviews}
            currentReview={currentReview}
            whiteAccuracy={whiteAccuracy}
            blackAccuracy={blackAccuracy}
            isAnalyzing={isAnalyzing}
            progress={progress}
            error={engineError}
            onAnalyze={() => void analyzeGame()}
            onPlayLine={exploreLine}
          />
        </div>

        <footer className="site-footer">
          <span>3mate is an independent chess analysis tool and is not affiliated with Chess.com.</span>
          <span className="footer-links"><a href="https://commons.wikimedia.org/wiki/File:Chess_kdt45.svg" target="_blank" rel="noreferrer">Piece artwork: Cburnett</a><span>·</span><a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a><span>·</span><a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish.js GPLv3</a></span>
        </footer>
      </main>

      <div className="bottom-note"><Shield size={13} /><span>Everything stays in your browser. This site does not send game data to a server.</span></div>
      {toast && <div className="toast-message" role="status">{toast}</div>}
      <ImportDialog open={importOpen} initialPgn={game.pgn || DEMO_PGN} onClose={() => setImportOpen(false)} onImport={importGame} />
    </div>
  );
}

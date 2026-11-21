import { useEffect, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import type { GameSource } from '../types';

interface ImportDialogProps {
  open: boolean;
  initialPgn: string;
  onClose: () => void;
  onImport: (mode: GameSource, text: string) => string | null;
}

export default function ImportDialog({ open, initialPgn, onClose, onImport }: ImportDialogProps) {
  const [mode, setMode] = useState<GameSource>('pgn');
  const [text, setText] = useState(initialPgn);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  async function readFile(file?: File): Promise<void> {
    if (!file) return;
    try {
      setText(await file.text());
      setMode(file.name.toLowerCase().endsWith('.fen') ? 'fen' : 'pgn');
      setError('');
    } catch {
      setError('Could not read this file. Try pasting its contents instead.');
    }
  }

  function submit(): void {
    const message = onImport(mode, text);
    if (message) setError(message);
    else onClose();
  }

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading">
          <div><span className="eyebrow">LOAD A GAME</span><h2 id="import-title">Bring your game to the board</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close import dialog"><X size={19} /></button>
        </div>
        <p className="modal-copy">Paste notation or a position. Your game stays on this device.</p>
        <div className="import-tabs" role="tablist" aria-label="Import format">
          <button type="button" role="tab" aria-selected={mode === 'pgn'} className={mode === 'pgn' ? 'tab-active' : ''} onClick={() => { setMode('pgn'); setError(''); }}>PGN game</button>
          <button type="button" role="tab" aria-selected={mode === 'fen'} className={mode === 'fen' ? 'tab-active' : ''} onClick={() => { setMode('fen'); setError(''); }}>FEN position</button>
        </div>
        <label className="sr-only" htmlFor="game-notation">{mode === 'pgn' ? 'Paste PGN' : 'Paste FEN'}</label>
        <textarea
          id="game-notation"
          className="notation-input"
          value={text}
          onChange={(event) => { setText(event.target.value); setError(''); }}
          placeholder={mode === 'pgn' ? '[Event "Friendly game"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
          spellCheck={false}
          autoFocus
        />
        <div className="modal-actions-row">
          <label className="upload-file-button">
            <FileUp size={16} /> Browse file
            <input type="file" accept=".pgn,.fen,.txt,text/plain" onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
          <span className="format-hint">{mode === 'pgn' ? 'Standard PGN notation' : 'Six-field FEN notation'}</span>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-footer">
          <span><span className="privacy-dot" /> Private by design</span>
          <button className="primary-button" type="button" onClick={submit}>Load {mode.toUpperCase()}</button>
        </div>
      </section>
    </div>
  );
}

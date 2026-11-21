import { Chess } from 'chess.js';
import type { EngineLine, PositionEvaluation } from '../types';

interface ParsedInfo {
  depth: number;
  multipv: number;
  evalWhite: number;
  mate?: number;
  uci: string[];
}

interface ActiveSearch {
  fen: string;
  lines: Map<number, ParsedInfo>;
  resolve: (result: PositionEvaluation) => void;
  timeout: number;
}

export class LocalStockfish {
  private worker: Worker;
  private waiters = new Set<(line: string) => void>();
  private activeSearch: ActiveSearch | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor() {
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    this.worker.onmessage = (event: MessageEvent<string>) => this.handleLine(String(event.data));
  }

  private handleLine(line: string): void {
    this.waiters.forEach((waiter) => waiter(line));
    const search = this.activeSearch;
    if (!search) return;

    if (line.startsWith('info ')) {
      const parsed = this.parseInfo(line, search.fen);
      if (parsed) {
        const previous = search.lines.get(parsed.multipv);
        if (!previous || parsed.depth >= previous.depth) search.lines.set(parsed.multipv, parsed);
      }
      return;
    }

    if (line.startsWith('bestmove ')) {
      window.clearTimeout(search.timeout);
      const parsedLines = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv);
      const lines: EngineLine[] = parsedLines.map((lineInfo) => ({
        uci: lineInfo.uci,
        san: this.toSanLine(search.fen, lineInfo.uci),
        evalWhite: lineInfo.evalWhite,
        ...(lineInfo.mate === undefined ? {} : { mate: lineInfo.mate }),
        depth: lineInfo.depth,
      }));
      const top = parsedLines[0];
      search.resolve({
        fen: search.fen,
        evalWhite: top?.evalWhite ?? 0,
        lines,
        depth: top?.depth ?? 0,
      });
      this.activeSearch = null;
    }
  }

  private parseInfo(line: string, fen: string): ParsedInfo | null {
    const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
    const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
    const score = line.match(/\bscore (cp|mate) (-?\d+)/);
    const pv = line.match(/\bpv\s+(.+)$/)?.[1];
    if (!score || !pv) return null;

    const rawScore = Number(score[2]);
    const mate = score[1] === 'mate' ? rawScore : undefined;
    const pawns = score[1] === 'cp' ? rawScore / 100 : rawScore > 0 ? 12 : -12;
    const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';

    return {
      depth,
      multipv,
      evalWhite: turn === 'w' ? pawns : -pawns,
      ...(mate === undefined ? {} : { mate }),
      uci: pv.trim().split(/\s+/),
    };
  }

  private toSanLine(fen: string, uci: string[]): string[] {
    const chess = new Chess(fen);
    const san: string[] = [];
    for (const token of uci) {
      const match = token.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      if (!match) break;
      try {
        const move = chess.move({
          from: match[1] as `${string}${number}`,
          to: match[2] as `${string}${number}`,
          ...(match[3] ? { promotion: match[3] as 'q' | 'r' | 'b' | 'n' } : {}),
        });
        san.push(move.san);
      } catch {
        break;
      }
    }
    return san;
  }

  private waitFor(prefix: string, timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Stockfish did not respond with ${prefix}.`));
      }, timeoutMs);
      const waiter = (line: string) => {
        if (line.startsWith(prefix)) {
          window.clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve();
        }
      };
      this.waiters.add(waiter);
    });
  }

  async ready(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      const uci = this.waitFor('uciok');
      this.worker.postMessage('uci');
      await uci;
      this.worker.postMessage('setoption name Threads value 1');
      const ready = this.waitFor('readyok');
      this.worker.postMessage('isready');
      await ready;
    })();
    return this.readyPromise;
  }

  async analyze(fen: string, depth = 10, multipv = 3): Promise<PositionEvaluation> {
    await this.ready();
    if (this.activeSearch) throw new Error('The engine is already analyzing a position.');

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        const search = this.activeSearch;
        if (!search) return;
        this.activeSearch = null;
        const top = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv)[0];
        resolve({
          fen: search.fen,
          evalWhite: top?.evalWhite ?? 0,
          lines: [...search.lines.values()].sort((a, b) => a.multipv - b.multipv).map((item) => ({
            uci: item.uci,
            san: this.toSanLine(search.fen, item.uci),
            evalWhite: item.evalWhite,
            ...(item.mate === undefined ? {} : { mate: item.mate }),
            depth: item.depth,
          })),
          depth: top?.depth ?? 0,
        });
      }, 60_000);

      this.activeSearch = { fen, lines: new Map(), resolve, timeout };
      this.worker.postMessage(`setoption name MultiPV value ${multipv}`);
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  stop(): void {
    if (this.activeSearch) this.worker.postMessage('stop');
  }

  destroy(): void {
    this.stop();
    this.worker.terminate();
    this.activeSearch = null;
  }
}

import assert from 'node:assert/strict';
import { createServer } from 'vite';

const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
globalThis.window = {
  setTimeout: (callback, delay, ...args) => nativeSetTimeout(callback, delay === 60_000 ? 5 : delay, ...args),
  clearTimeout: (timer) => nativeClearTimeout(timer),
};

class MockWorker {
  static instances = [];
  onmessage;
  terminated = false;

  constructor() {
    this.index = MockWorker.instances.length;
    MockWorker.instances.push(this);
  }

  emit(data) {
    if (!this.terminated) this.onmessage?.({ data });
  }

  postMessage(command) {
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
    if (command.startsWith('go depth')) {
      queueMicrotask(() => this.emit('info depth 12 multipv 1 score cp 25 upperbound pv e2e4'));
      if (this.index > 0) {
        queueMicrotask(() => this.emit('info depth 12 multipv 1 score cp 25 lowerbound pv e2e4'));
        queueMicrotask(() => this.emit('bestmove e2e4'));
      }
    }
  }

  terminate() {
    this.terminated = true;
  }
}

globalThis.Worker = MockWorker;
const vite = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { LocalStockfish } = await vite.ssrLoadModule('/src/lib/engine.ts');
  const engine = new LocalStockfish();
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  await assert.rejects(
    engine.analyze(startFen, 12, 3),
    /timed out; partial engine output was discarded/,
    'a search timeout must reject instead of returning partial lines as a completed evaluation',
  );
  assert.equal(MockWorker.instances[0].terminated, true, 'the timed-out worker must be terminated to prevent stale bestmove output');
  assert.equal(MockWorker.instances.length, 2, 'a fresh worker must be available for retry');

  const retry = await engine.analyze(startFen, 12, 3);
  assert.equal(retry.lines[0]?.bound, 'lower', 'UCI score bound metadata should be retained for the Brilliant evidence gate');
  assert.equal(retry.lines[0]?.depth, 12);
  engine.destroy();

  console.log('Engine regression checks passed: partial timeout rejected, worker recovered, and UCI score bounds retained.');
} finally {
  await vite.close();
}

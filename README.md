# 3mate Chess Analysis

A browser-only PGN/FEN chess review tool. Import a game or position, step through moves, explore legal moves on the board, then run Stockfish locally in a Web Worker. No account or application backend is required, and game notation is not uploaded for analysis.

## Features

- Import PGN or FEN by pasting text or reading a local `.pgn`, `.fen`, or `.txt` file.
- Interactive Cburnett board with move navigation, last-move highlighting, board flip, legal-move hints, and promotion choice.
- Local Stockfish 19 Lite single-threaded analysis, evaluation, and up to three principal variations.
- Evaluation graph, move-by-move classifications, and estimated accuracy summary.
- Responsive layout for desktop and mobile.

Move labels and accuracy are 3mate heuristics based on local engine evaluations. Quality categories use centipawn loss from the engine's best move: Best ≤10 cp, Excellent ≤30 cp, Good ≤60 cp, Inaccuracy ≤100 cp, Mistake ≤200 cp, and Blunder >200 cp. Brilliant marks an engine-supported material sacrifice that remains near the best result; Great marks a near-best move (≤20 cp loss) in a critical position where it is at least 80 cp better than the next distinct engine candidate. Miss marks a missed forced mate, a concrete material win of at least 2.7 pawns, or a clear engine-confirmed winning chance of at least 2.7 pawns that is lost with at least 100 cp loss. Book labels follow the opening lines bundled with the site, and a move delivering checkmate is classified as Best with zero cp loss. Brilliant, Great, Book, and Miss replace the ordinary quality label rather than stacking with it. These are educational estimates, not official Chess.com classifications or a promise of engine-perfect annotation.

## Run locally

Requires Node.js 22 or newer and pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

Create a production build with:

```sh
pnpm build
```

Vite writes the static site to `dist/`. The GitHub Actions workflow in `.github/workflows/pages.yml` builds and deploys that directory to GitHub Pages when a commit is pushed to `main`.

Before the first deployment, enable Pages in the repository's **Settings → Pages** and set the source to **GitHub Actions**. The official [`actions/configure-pages`](https://github.com/actions/configure-pages) action then reads the Pages configuration for the workflow.

## Privacy

PGN and FEN parsing and engine analysis run in the visitor's browser. The engine JavaScript, WebAssembly, piece images, and fonts are served as static site files; no game-data API or application server is used. The hosting provider still receives ordinary web request metadata needed to deliver static files.

## Third-party assets and licenses

- **Stockfish.js 19 Lite, single-threaded WASM build:** GNU GPL version 3.0. The distributed engine files and full license text are in `public/engine/`. Source: [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js).
- **Cburnett chess-piece SVGs:** CC BY-SA 3.0. The SVG artwork is redistributed unchanged in `public/pieces/` under compact color/piece filenames. Attribution and source links are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the site footer.

The 3mate-specific application code is not given a blanket license by the third-party notices; the notices cover only the named third-party components.

## Custom domain

`public/CNAME` contains `3mate.site`. GitHub Pages also needs DNS records at the domain provider. GitHub's current instructions for an apex domain list four `A` records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`); an optional `www` alias uses a `CNAME` to `annasqs-15.github.io`. See GitHub's [custom-domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) for current details. Do not replace existing DNS records until you have confirmed what they serve.

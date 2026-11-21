# 3mate Chess Analysis

A browser-only PGN/FEN chess review tool. Import a game or position, step through moves, explore legal moves on the board, then run Stockfish locally in a Web Worker. No account or application backend is required, and game notation is not uploaded for analysis.

## Features

- Import PGN or FEN by pasting text or reading a local `.pgn`, `.fen`, or `.txt` file.
- Interactive Cburnett board with move navigation, last-move highlighting, board flip, legal-move hints, and promotion choice.
- Local Stockfish 19 Lite single-threaded analysis, evaluation, and up to three principal variations.
- Evaluation graph, move-by-move classifications, and estimated accuracy summary.
- Responsive layout for desktop and mobile.

Move labels and accuracy are 3mate heuristics based on local engine evaluations. They are educational estimates, not official Chess.com classifications or a promise of engine-perfect annotation.

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

## Privacy

PGN and FEN parsing and engine analysis run in the visitor's browser. The engine JavaScript, WebAssembly, piece images, and fonts are served as static site files; no game-data API or application server is used. The hosting provider still receives ordinary web request metadata needed to deliver static files.

## Third-party assets and licenses

- **Stockfish.js 19 Lite, single-threaded WASM build:** GNU GPL version 3.0. The distributed engine files and full license text are in `public/engine/`. Source: [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js).
- **Cburnett chess-piece SVGs:** CC BY-SA 3.0. The SVG artwork is redistributed unchanged in `public/pieces/` under compact color/piece filenames. Attribution and source links are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the site footer.

The 3mate-specific application code is not given a blanket license by the third-party notices; the notices cover only the named third-party components.

## Custom domain

`public/CNAME` contains `3mate.site`. GitHub Pages also needs DNS records at the domain provider. GitHub's current instructions for an apex domain list four `A` records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`); an optional `www` alias uses a `CNAME` to `annasqs-15.github.io`. See GitHub's [custom-domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) for current details. Do not replace existing DNS records until you have confirmed what they serve.

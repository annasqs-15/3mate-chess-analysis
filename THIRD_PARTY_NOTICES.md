# Third-party notices

## Cburnett chess-piece artwork

The 12 SVG chess-piece images in `public/pieces/` are Cburnett's piece artwork, redistributed unchanged from the corresponding `Chess_*t45.svg` files on Wikimedia Commons. The files use compact `{color}{piece}.svg` names (`w`/`b` for side and `kqrbnp` for piece type). Each file is licensed under Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0), with additional GNU Free Documentation License terms stated on the Commons file pages. The files are not endorsed by their author.

Attribution: Cburnett, [Chess pieces on Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces). Example file and license statement: [Chess kdt45.svg](https://commons.wikimedia.org/wiki/File:Chess_kdt45.svg). License: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

No artwork changes have been made. The board itself and the interface are original 3mate code.

## Stockfish.js

The browser engine assets in `public/engine/` are the Stockfish.js 19 Lite single-threaded WebAssembly build, distributed under GNU General Public License version 3.0. The matching license text is in `public/engine/Copying.txt`.

Source: [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js). Release: [v19.0.1](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1). The paired engine files are `stockfish-19-lite-single.js` and `stockfish-19-lite-single.wasm`; the WASM file must retain the matching basename and is served next to the JavaScript worker.

The third-party licenses above apply only to their respective assets; they are not a blanket license for 3mate application code.

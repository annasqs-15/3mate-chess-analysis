import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { classifyMoves, qualityCategoryForCentipawnLoss } = await vite.ssrLoadModule('/src/lib/scoring.ts');
  const { parsePgn } = await vite.ssrLoadModule('/src/lib/pgn.ts');

  const thresholds = [
    [0, 'Best'],
    [10, 'Best'],
    [10.01, 'Excellent'],
    [30, 'Excellent'],
    [30.01, 'Good'],
    [60, 'Good'],
    [60.01, 'Inaccuracy'],
    [100, 'Inaccuracy'],
    [100.01, 'Mistake'],
    [200, 'Mistake'],
    [200.01, 'Blunder'],
  ];
  for (const [loss, expected] of thresholds) {
    assert.equal(qualityCategoryForCentipawnLoss(loss), expected, `${loss} cp should be ${expected}`);
  }

  const blankEvaluation = (fen) => ({ fen, evalWhite: 0, lines: [], depth: 12 });
  const emptyEvaluations = (positions) => positions.map(({ fen }) => blankEvaluation(fen));
  const completeReview = (positions, evaluations) => classifyMoves(positions, evaluations, true);

  const bookGame = parsePgn('1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bf4');
  const bookReviews = completeReview(bookGame.positions, emptyEvaluations(bookGame.positions));
  assert.equal(bookReviews.filter(({ category }) => category === 'Book').length, 20, 'Caro-Kann line should mark the first 20 plies as Book');
  assert.notEqual(bookReviews.find(({ ply }) => ply === 21)?.category, 'Book', 'the first move after the known line should not remain Book');

  const greatGame = parsePgn('1. d4 d5 2. c4 dxc4 3. e3');
  const greatPositions = greatGame.positions;
  const greatEvaluations = emptyEvaluations(greatPositions);
  const greatPly = 5;
  greatEvaluations[greatPly - 1] = {
    fen: greatPositions[greatPly - 1].fen,
    evalWhite: 0.5,
    depth: 12,
    lines: [
      { uci: ['e2e3'], san: ['e3'], evalWhite: 0.5, depth: 12 },
      { uci: ['b1c3'], san: ['Nc3'], evalWhite: -0.4, depth: 12 },
      { uci: ['e2e4'], san: ['e4'], evalWhite: -0.6, depth: 12 },
    ],
  };
  greatEvaluations[greatPly] = {
    fen: greatPositions[greatPly].fen,
    evalWhite: 0.5,
    depth: 12,
    lines: [{ uci: ['e7e6', 'b1c3', 'f8d6', 'c1f4', 'g8f6'], san: [], evalWhite: 0.5, depth: 12 }],
  };
  assert.equal(completeReview(greatPositions, greatEvaluations).find(({ ply }) => ply === greatPly)?.category, 'Great', 'a near-best move clearly better than alternatives should be Great');

  const missFen = 'r3k3/8/8/8/8/8/7p/R3K3 w - - 0 1';
  const missBoard = new Chess(missFen);
  const missedMove = missBoard.move({ from: 'e1', to: 'f2' });
  const missPositions = [
    { ply: 0, fen: missFen },
    { ply: 1, fen: missBoard.fen(), move: missedMove, san: missedMove.san },
  ];
  const missEvaluations = [
    {
      fen: missFen,
      evalWhite: 5,
      depth: 12,
      lines: [
        { uci: ['a1a8'], san: ['Rxa8+'], evalWhite: 5, depth: 12 },
        { uci: ['e1f2'], san: ['Kf2'], evalWhite: -5, depth: 12 },
      ],
    },
    {
      fen: missBoard.fen(),
      evalWhite: -5,
      depth: 12,
      lines: [{ uci: ['a8a1'], san: ['Rxa1'], evalWhite: -5, depth: 12 }],
    },
  ];
  assert.equal(completeReview(missPositions, missEvaluations)[0]?.category, 'Miss', 'missing a concrete rook win should be Miss');

  const foxwoods = parsePgn('1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bf4 Bb4+ 12. c3 Be7 13. O-O-O Ngf6 14. Kb1 O-O 15. Ne5 c5 16. Qf3 Qb6 17. Nxd7 Nxd7 18. d5 exd5 19. Nf5 Bf6 20. Rxd5 Qe6 21. Bxh6 Ne5 22. Qe4 Nc6 23. Qf3 Ne5 24. Qe4 Nc6 25. Qg4 Qxd5 26. Bxg7 Qd3+ 27. Ka1 Ne5 28. Ne7+ Kh7 29. Qg6+ fxg6 30. hxg6+ Kxg7 31. Rh7#');
  const missedWinningChance = emptyEvaluations(foxwoods.positions);
  missedWinningChance[44] = {
    fen: foxwoods.positions[44].fen,
    evalWhite: 4.28,
    depth: 12,
    lines: [{ uci: ['e4g4', 'g7g6', 'f5e3', 'a8d8', 'h5g6', 'd8d5', 'g6f7', 'g8f7', 'g4e6'], san: [], evalWhite: 4.28, depth: 12 }],
  };
  missedWinningChance[45] = {
    fen: foxwoods.positions[45].fen,
    evalWhite: 0,
    depth: 12,
    lines: [{ uci: ['g7h6', 'd5d6', 'e6e5'], san: [], evalWhite: 0, depth: 12 }],
  };
  assert.equal(completeReview(foxwoods.positions, missedWinningChance).find(({ ply }) => ply === 45)?.category, 'Miss', '23.Qf3 should be Miss after dropping a clear engine-confirmed winning chance');

  const forcedMateEvaluations = emptyEvaluations(foxwoods.positions);
  forcedMateEvaluations[54] = {
    fen: foxwoods.positions[54].fen,
    evalWhite: -0.46,
    depth: 12,
    lines: [
      { uci: ['h5h6'], san: [], evalWhite: -0.46, depth: 12 },
      { uci: ['g4f4'], san: [], evalWhite: -2.54, depth: 12 },
      { uci: ['f5e7'], san: [], evalWhite: -4.84, depth: 12 },
    ],
  };
  forcedMateEvaluations[55] = {
    fen: foxwoods.positions[55].fen,
    evalWhite: -4.8,
    depth: 12,
    lines: [
      { uci: ['g8h7'], san: ['Kh7'], evalWhite: -4.8, depth: 12 },
      { uci: ['f6e7'], san: ['Bxe7'], evalWhite: 12, mate: -6, depth: 12 },
    ],
  };
  forcedMateEvaluations[56] = {
    fen: foxwoods.positions[56].fen,
    evalWhite: 12,
    depth: 12,
    lines: [{ uci: ['g4g6', 'f7g6', 'h5g6', 'h7g7', 'h1h7'], san: ['Qg6+', 'fxg6', 'hxg6+', 'Kxg7', 'Rh7#'], evalWhite: 12, mate: 3, depth: 12 }],
  };
  const forcedMateReview = completeReview(foxwoods.positions, forcedMateEvaluations).find(({ ply }) => ply === 55);
  assert.equal(forcedMateReview?.category, 'Great', '28.Ne7+ should be Great when the engine-best reply is followed by a proved forced mate');
  assert.equal(forcedMateReview?.centipawnLoss, 0, 'a forcing move proven to lead to mate should not inherit a shallow centipawn loss');
  assert.deepEqual(forcedMateReview?.forcedMate, { line: ['Kh7', 'Qg6+', 'fxg6', 'hxg6+', 'Kxg7', 'Rh7#'], mateIn: 3 }, 'the review should retain the engine-verified continuation that supports the Great label');

  const brilliantPositions = foxwoods.positions;
  const brilliantPly = 57;
  const brilliantEvaluations = emptyEvaluations(brilliantPositions);
  brilliantEvaluations[brilliantPly - 1] = {
    fen: brilliantPositions[brilliantPly - 1].fen,
    evalWhite: 12,
    depth: 12,
    lines: [
      { uci: ['g4g6'], san: ['Qg6+'], evalWhite: 12, mate: 5, depth: 12 },
      { uci: ['g4g3'], san: ['Qg3'], evalWhite: -3, depth: 12 },
    ],
  };
  brilliantEvaluations[brilliantPly] = {
    fen: brilliantPositions[brilliantPly].fen,
    evalWhite: 12,
    depth: 12,
    lines: [{ uci: ['f7g6', 'h5g6', 'h7g7', 'h1h7'], san: ['fxg6', 'hxg6+', 'Kxg7', 'Rh7#'], evalWhite: 12, mate: -2, depth: 12 }],
  };
  assert.equal(classifyMoves(brilliantPositions, brilliantEvaluations).length, 0, 'no move labels should appear while review completion has not been confirmed');
  const brilliantReview = completeReview(brilliantPositions, brilliantEvaluations);
  assert.equal(brilliantReview.find(({ ply }) => ply === brilliantPly)?.category, 'Brilliant', 'a voluntary sound queen sacrifice with a verified acceptance line should be Brilliant');

  const noRootProof = brilliantEvaluations.map((evaluation) => evaluation && ({ ...evaluation, lines: evaluation.lines }));
  noRootProof[brilliantPly - 1] = {
    ...brilliantEvaluations[brilliantPly - 1],
    lines: brilliantEvaluations[brilliantPly - 1].lines.filter((line) => line.uci[0] !== 'g4g6'),
  };
  assert.notEqual(completeReview(brilliantPositions, noRootProof).find(({ ply }) => ply === brilliantPly)?.category, 'Brilliant', 'a played move missing from the same-root candidate lines must not be Brilliant');

  const boundedRootProof = brilliantEvaluations.map((evaluation) => evaluation && ({ ...evaluation, lines: evaluation.lines }));
  boundedRootProof[brilliantPly - 1] = {
    ...brilliantEvaluations[brilliantPly - 1],
    lines: brilliantEvaluations[brilliantPly - 1].lines.map((line) => line.uci[0] === 'g4g6' ? { ...line, bound: 'upper' } : line),
  };
  assert.notEqual(completeReview(brilliantPositions, boundedRootProof).find(({ ply }) => ply === brilliantPly)?.category, 'Brilliant', 'a bound engine score is insufficient proof for Brilliant');

  const winningWithoutAlternatives = brilliantEvaluations.map((evaluation) => evaluation && ({ ...evaluation, lines: evaluation.lines }));
  winningWithoutAlternatives[brilliantPly - 1] = {
    ...brilliantEvaluations[brilliantPly - 1],
    lines: brilliantEvaluations[brilliantPly - 1].lines.slice(0, 1),
  };
  assert.notEqual(completeReview(brilliantPositions, winningWithoutAlternatives).find(({ ply }) => ply === brilliantPly)?.category, 'Brilliant', 'an already-winning sacrifice without a scored alternative must not be Brilliant');

  const unsoundSacrifice = brilliantEvaluations.map((evaluation) => evaluation && ({ ...evaluation, lines: evaluation.lines }));
  unsoundSacrifice[brilliantPly] = {
    ...brilliantEvaluations[brilliantPly],
    evalWhite: -1,
    lines: [{ uci: ['f7g6'], san: ['fxg6'], evalWhite: -1, depth: 12 }],
  };
  assert.notEqual(completeReview(brilliantPositions, unsoundSacrifice).find(({ ply }) => ply === brilliantPly)?.category, 'Brilliant', 'an offer that leaves the mover losing must not be Brilliant');

  const quietSacrificeBoard = new Chess(brilliantPositions[brilliantPly - 1].fen);
  const quietQueenMove = quietSacrificeBoard.move({ from: 'g4', to: 'f4' });
  const quietSacrificePositions = brilliantPositions.slice();
  quietSacrificePositions[brilliantPly] = {
    ...quietSacrificePositions[brilliantPly],
    fen: quietSacrificeBoard.fen(),
    move: quietQueenMove,
    san: quietQueenMove.san,
  };
  const quietReply = quietSacrificeBoard.moves({ verbose: true })[0];
  const quietReplyUci = `${quietReply.from}${quietReply.to}${quietReply.promotion ?? ''}`;
  const quietSacrificeEvaluations = brilliantEvaluations.map((evaluation) => evaluation && ({ ...evaluation, lines: evaluation.lines }));
  quietSacrificeEvaluations[brilliantPly - 1] = {
    ...brilliantEvaluations[brilliantPly - 1],
    evalWhite: 0,
    lines: [
      { uci: ['g4f4'], san: ['Qf4'], evalWhite: 0, depth: 12 },
      { uci: ['g4g6'], san: ['Qg6+'], evalWhite: 0, depth: 12 },
    ],
  };
  quietSacrificeEvaluations[brilliantPly] = {
    fen: quietSacrificeBoard.fen(),
    evalWhite: 0,
    depth: 12,
    lines: [{ uci: [quietReplyUci], san: [quietReply.san], evalWhite: 0, depth: 12 }],
  };
  assert.notEqual(completeReview(quietSacrificePositions, quietSacrificeEvaluations).find(({ ply }) => ply === brilliantPly)?.category, 'Brilliant', 'a quiet move that offers no capturable piece must not be Brilliant');

  const mateGame = parsePgn('1. f3 e5 2. g4 Qh4#');
  const mateEvaluations = emptyEvaluations(mateGame.positions);
  mateEvaluations[3] = {
    fen: mateGame.positions[3].fen,
    evalWhite: -12,
    depth: 12,
    lines: [{ uci: ['d8h4'], san: ['Qh4#'], evalWhite: -12, mate: 1, depth: 12 }],
  };
  mateEvaluations[4] = undefined;
  const mateReviews = completeReview(mateGame.positions, mateEvaluations);
  assert.equal(mateReviews.find(({ ply }) => ply === 4)?.category, 'Best', 'a move delivering checkmate should not be marked as a blunder');
  assert.equal(mateReviews.find(({ ply }) => ply === 4)?.centipawnLoss, 0, 'a checkmating move should have no centipawn loss');
  assert.equal(mateReviews.find(({ ply }) => ply === 4)?.expectedPointsLost, 0, 'a checkmating move should not reduce estimated accuracy');

  const allCategories = [
    ...bookReviews,
    ...completeReview(greatPositions, greatEvaluations),
    ...completeReview(missPositions, missEvaluations),
    ...brilliantReview,
    ...mateReviews,
  ];
  assert.ok(allCategories.every(({ category }) => typeof category === 'string'), 'each move receives a single primary category');

  console.log('Scoring regression checks passed: CPL thresholds, 20-ply Book line, Foxwoods Miss and forced mate, Great, Brilliant, and zero-loss checkmate.');
} finally {
  await vite.close();
}

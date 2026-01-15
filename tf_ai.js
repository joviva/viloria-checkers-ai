// TF.js global AI helper (inference only)
// Loaded by index.html before script.js.

(function () {
  const BOARD_SIZE = 10;

  function getPlayables() {
    const squares = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 1) squares.push([r, c]);
      }
    }
    return squares;
  }

  const PLAYABLES = getPlayables(); // length 50

  function encodeMove(fromRow, fromCol, toRow, toCol) {
    let fromIdx = -1;
    let toIdx = -1;
    for (let i = 0; i < PLAYABLES.length; i++) {
      const [r, c] = PLAYABLES[i];
      if (r === fromRow && c === fromCol) fromIdx = i;
      if (r === toRow && c === toCol) toIdx = i;
      if (fromIdx !== -1 && toIdx !== -1) break;
    }
    if (fromIdx === -1 || toIdx === -1) return -1;
    return fromIdx * PLAYABLES.length + toIdx; // 0..2499
  }

  function parseMoveString(moveStr) {
    const parts = moveStr.split("->");
    const fromParts = parts[0].split(",");
    const toParts = parts[1].split(",");
    return {
      fromRow: parseInt(fromParts[0], 10),
      fromCol: parseInt(fromParts[1], 10),
      toRow: parseInt(toParts[0], 10),
      toCol: parseInt(toParts[1], 10),
    };
  }

  function encodeStateChannelsLast(boardState) {
    // Matches docs/model/encoder.py, but returns channels-last: (10,10,5)
    const state = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      const row = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = boardState[r][c];
        const ch = [0, 0, 0, 0, 0];
        if ((r + c) % 2 === 1) ch[4] = 1;
        if (cell) {
          const color = cell.color;
          const king = !!cell.king;
          if (color === "red") ch[king ? 1 : 0] = 1;
          if (color === "black") ch[king ? 3 : 2] = 1;
        }
        row.push(ch);
      }
      state.push(row);
    }
    return state;
  }

  async function fetchJsonNoStore(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
    return await r.json();
  }

  const api = {
    model: null,
    modelVersion: null,

    async init({ manifestUrl, modelUrl }) {
      if (!globalThis.tf) {
        throw new Error("TensorFlow.js not loaded (tf missing)");
      }

      let finalModelUrl = modelUrl;
      if (!finalModelUrl && manifestUrl) {
        const manifest = await fetchJsonNoStore(manifestUrl);
        finalModelUrl = manifest?.model_url;
        this.modelVersion = manifest?.version ?? null;
      }

      if (!finalModelUrl) {
        throw new Error(
          "Missing model URL (set CHECKERS_AI_TFJS_MODEL_URL or manifest)"
        );
      }

      // Bust caches for daily updates.
      const cacheBust = this.modelVersion
        ? `v=${encodeURIComponent(this.modelVersion)}`
        : `t=${Date.now()}`;
      const sep = finalModelUrl.includes("?") ? "&" : "?";
      finalModelUrl = `${finalModelUrl}${sep}${cacheBust}`;

      this.model = await globalThis.tf.loadLayersModel(finalModelUrl);
      return true;
    },

    async selectMove({ boardState, legalMoves }) {
      if (!this.model) return null;
      if (!Array.isArray(legalMoves) || legalMoves.length === 0) return null;

      // Encode legal moves -> indices
      const encodedMoves = [];
      for (const moveStr of legalMoves) {
        const m = parseMoveString(moveStr);
        const idx = encodeMove(m.fromRow, m.fromCol, m.toRow, m.toCol);
        if (idx >= 0) encodedMoves.push([moveStr, idx]);
      }
      if (encodedMoves.length === 0) return legalMoves[0];

      const legalIndicesSet = new Set(encodedMoves.map(([, idx]) => idx));
      const legalIndices = Array.from(legalIndicesSet);

      // Predict policy
      const moveStr = globalThis.tf.tidy(() => {
        const x = encodeStateChannelsLast(boardState);
        const input = globalThis.tf.tensor(
          x,
          [1, BOARD_SIZE, BOARD_SIZE, 5],
          "float32"
        );
        const out = this.model.predict(input);
        // out can be Tensor or array; we expect single output tensor
        const policy = Array.isArray(out) ? out[0] : out;
        const probs = policy.dataSync();

        // Pick best legal index
        let bestIdx = legalIndices[0];
        let bestVal = -Infinity;
        for (const idx of legalIndices) {
          const v = probs[idx];
          if (v > bestVal) {
            bestVal = v;
            bestIdx = idx;
          }
        }

        // Map back to a move string (stable order)
        for (const [s, idx] of encodedMoves) {
          if (idx === bestIdx) return s;
        }
        return legalMoves[0];
      });

      return moveStr;
    },
  };

  globalThis.checkersTfAi = api;
})();

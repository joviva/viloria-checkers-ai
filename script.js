// Enhanced AI Checkers - Working Implementation

// API Configuration for Neural Network AI
// Automatically detects backend and enables if available
const DEFAULT_LOCAL_API_BASE_URL = "http://localhost:8000";

// Optional: Global AI (TF.js) for static hosting.
// Inject these in index.html BEFORE loading script.js:
//   window.CHECKERS_AI_TFJS_MANIFEST_URL = "https://.../storage/v1/object/public/models/tfjs/latest.json";
//   window.CHECKERS_AI_TFJS_MODEL_URL = "https://.../storage/v1/object/public/models/tfjs/latest/model.json";
//   window.CHECKERS_AI_SUBMIT_GAME_URL = "https://YOURPROJECT.functions.supabase.co/submit-game";

function getInjectedTfjsManifestUrl() {
  try {
    const injected = window?.CHECKERS_AI_TFJS_MANIFEST_URL;
    if (typeof injected !== "string") return null;
    const trimmed = injected.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function getInjectedTfjsModelUrl() {
  try {
    const injected = window?.CHECKERS_AI_TFJS_MODEL_URL;
    if (typeof injected !== "string") return null;
    const trimmed = injected.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function getInjectedSubmitGameUrl() {
  try {
    const injected = window?.CHECKERS_AI_SUBMIT_GAME_URL;
    if (typeof injected !== "string") return null;
    const trimmed = injected.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

const TFJS_CONFIG = {
  enabled: false,
  modelReady: false,
  manifestUrl: null,
  modelUrl: null,
  loadError: null,
};

// Optional: allow deployments to inject a backend URL without editing this file.
// Example (in index.html before loading script.js):
//   <script>window.CHECKERS_AI_API_BASE_URL = "https://your-backend.onrender.com";</script>
function getInjectedApiBaseUrl() {
  try {
    const injected = window?.CHECKERS_AI_API_BASE_URL;
    if (typeof injected !== "string") return null;
    const trimmed = injected.trim();
    return trimmed.length > 0 ? trimmed.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function isHttpOrigin() {
  try {
    return (
      window?.location?.protocol === "http:" ||
      window?.location?.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function isLocalDevHost() {
  try {
    const host = window?.location?.hostname;
    // file:// has empty hostname in many browsers; treat as local for dev workflow.
    if (!host) return window?.location?.protocol === "file:";
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  for (const val of list) {
    if (!val || typeof val !== "string") continue;
    if (seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

const API_CONFIG = {
  enabled: false, // Will be auto-enabled if backend is detected
  // NOTE: For deployments we auto-detect /api on the current origin.
  // This remains as the local-dev fallback.
  baseUrl: DEFAULT_LOCAL_API_BASE_URL,
  timeout: 5000,
};

// Enable/disable the local service controller (auto-launcher) depending on host.
// In production you generally cannot start local processes from a webpage.
const SERVICE_CONTROLLER_ENABLED = isLocalDevHost();

// AUTO-DETECT: Check if backend is available on page load
(async function initializeAILearning() {
  try {
    // If TF.js global AI is configured, prefer it over the Python backend.
    TFJS_CONFIG.manifestUrl = getInjectedTfjsManifestUrl();
    TFJS_CONFIG.modelUrl = getInjectedTfjsModelUrl();
    if (
      (TFJS_CONFIG.manifestUrl || TFJS_CONFIG.modelUrl) &&
      window?.checkersTfAi
    ) {
      try {
        await window.checkersTfAi.init({
          manifestUrl: TFJS_CONFIG.manifestUrl,
          modelUrl: TFJS_CONFIG.modelUrl,
        });
        TFJS_CONFIG.enabled = true;
        TFJS_CONFIG.modelReady = true;
        API_CONFIG.enabled = false;

        const v = window.checkersTfAi?.modelVersion;
        const statusLabel = v ? `Global AI (${v})` : "Global Neural Net";
        updateAIStatus(statusLabel);

        console.log("═══════════════════════════════════════");
        console.log("🌐 GLOBAL AI ONLINE (TF.js)");
        console.log("═══════════════════════════════════════");
        console.log("✓ Model loaded in browser");
        if (TFJS_CONFIG.manifestUrl) {
          console.log(`✓ Manifest URL: ${TFJS_CONFIG.manifestUrl}`);
        } else {
          console.log(`✓ Model URL: ${TFJS_CONFIG.modelUrl}`);
        }
        console.log("✓ Updates: daily (via model refresh)");
        console.log("═══════════════════════════════════════");
        return;
      } catch (e) {
        TFJS_CONFIG.enabled = false;
        TFJS_CONFIG.modelReady = false;
        TFJS_CONFIG.loadError = e.message;
        console.warn(
          "TF.js model load failed; falling back to backend/offline.",
          e
        );
        updateAIStatus("AI Error (See Console)");
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    // Deployment-aware backend discovery order:
    // 1) If served over http(s), try same-origin first (supports Vercel rewrites / reverse proxies)
    // 2) Try injected backend URL (Render, etc.)
    // 3) Fall back to localhost dev server
    const injectedBaseUrl = getInjectedApiBaseUrl();
    const candidates = uniqueStrings([
      ...(isHttpOrigin() ? [""] : []),
      ...(injectedBaseUrl ? [injectedBaseUrl] : []),
      API_CONFIG.baseUrl,
      DEFAULT_LOCAL_API_BASE_URL,
    ]);

    let response = null;
    let selectedBaseUrl = null;
    for (const baseUrl of candidates) {
      try {
        const statsUrl = baseUrl ? `${baseUrl}/api/stats` : `/api/stats`;
        const r = await fetch(statsUrl, {
          signal: controller.signal,
          method: "GET",
        });
        if (r && r.ok) {
          response = r;
          selectedBaseUrl = baseUrl;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    clearTimeout(timeoutId);

    if (response && response.ok) {
      // If we found a working backend, lock it in.
      API_CONFIG.baseUrl = selectedBaseUrl ?? API_CONFIG.baseUrl;
      const data = await response.json();
      API_CONFIG.enabled = true;
      // Backend AI learning system connected successfully
    }
  } catch (error) {
    API_CONFIG.enabled = false;
    // Running in offline mode with heuristic AI
  }
})();

// Service Controller Configuration
const SERVICE_CONTROLLER_URL = "http://localhost:9000";
let keepAliveInterval = null;
let servicesStarted = false;
let servicesOffline = false; // Track if we're in offline mode
let lastServiceCheckTime = 0;
const SERVICE_CHECK_COOLDOWN = 30000; // Don't check too frequently (30 seconds)

async function startServices() {
  if (!SERVICE_CONTROLLER_ENABLED) {
    servicesOffline = true;
    return false;
  }
  // Start FastAPI server and learning worker via auto-launcher
  try {
    const response = await fetch(`${SERVICE_CONTROLLER_URL}/start`, {
      method: "GET",
      mode: "cors",
      timeout: 4000,
    }).catch((e) => {
      servicesOffline = true;
      // Auto-launcher not responding
      return null;
    });

    if (!response) {
      servicesOffline = true;
      return false;
    }

    const result = await response.json();

    // Check if services are actually running
    if (result.both_running) {
      // Both API and worker are running
      servicesStarted = true;
      servicesOffline = false;
      console.log("✓ Services verified running");
      startKeepAlive();
      return true;
    } else if (result.api_running) {
      // At least API is running
      servicesStarted = true;
      servicesOffline = false;
      console.log("✓ API server running");
      startKeepAlive();
      return true;
    } else {
      // Services not responding
      servicesOffline = true;
      console.log("using offline mode");
      return false;
    }
  } catch (error) {
    servicesOffline = true;
    console.log("using offline mode", error.message);
    return false;
  }
}

function startKeepAlive() {
  if (!SERVICE_CONTROLLER_ENABLED) return;
  // Keep services active while game is running by periodically checking status
  if (keepAliveInterval) return;

  keepAliveInterval = setInterval(async () => {
    // Only check if enough time has passed and game is still running
    if (gameOver || !servicesStarted) {
      return;
    }

    const now = Date.now();
    if (now - lastServiceCheckTime < SERVICE_CHECK_COOLDOWN) {
      return;
    }
    lastServiceCheckTime = now;

    try {
      const response = await fetch(`${SERVICE_CONTROLLER_URL}/status`, {
        method: "GET",
        mode: "cors",
        timeout: 2000,
      });

      if (response && response.ok) {
        const status = await response.json();
        if (!status.both_running) {
          // Services crashed, but don't try to restart - go offline instead
          servicesOffline = true;
          // Switching to offline mode
        } else {
          servicesOffline = false;
        }
      }
    } catch (error) {
      // Service controller is down - switch to offline mode
      servicesOffline = true;
    }
  }, 20000); // Check every 20 seconds (but cooldown prevents frequent checks)
}

function stopKeepAlive() {
  // Stop the keep-alive interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

async function stopServices() {
  if (!SERVICE_CONTROLLER_ENABLED) return;
  // Stop FastAPI server and learning worker
  try {
    const response = await fetch(`${SERVICE_CONTROLLER_URL}/stop`, {
      method: "GET",
      mode: "cors",
      timeout: 5000,
    });

    if (response && response.ok) {
      const result = await response.json();
      if (result.status === "stopped") {
        servicesStarted = false;
        stopKeepAlive();
      }
    }
  } catch (error) {
    // Silent fail
  }
}

// Backend refresh / failure handling
let API_FAILURES = 0;
const API_FAILURE_THRESHOLD = 10; // Increased threshold - be more tolerant of failures
let API_DISABLED = false;
let apiHealthInterval = null;
const API_HEALTH_CHECK_INTERVAL = 15000; // ms

function disableApi(reason) {
  API_CONFIG.enabled = false;
  API_DISABLED = true;
  // Don't show error for offline mode - just silently disable
  if (!servicesOffline) {
    console.log(`[NETWORK] API disabled: ${reason}`);
  }
  startApiHealthChecks();
}

function enableApi() {
  API_CONFIG.enabled = true;
  API_DISABLED = false;
  API_FAILURES = 0;
  stopApiHealthChecks();
  servicesOffline = false;
}

function startApiHealthChecks() {
  if (apiHealthInterval) return;
  apiHealthInterval = setInterval(async () => {
    try {
      const url = `${API_CONFIG.baseUrl}/api/stats`;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000); // Shorter timeout
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (res && res.ok) {
        enableApi();
      }
    } catch (e) {
      // still down; keep retrying
    }
  }, API_HEALTH_CHECK_INTERVAL);
}

function stopApiHealthChecks() {
  if (apiHealthInterval) {
    clearInterval(apiHealthInterval);
    apiHealthInterval = null;
  }
}

async function apiFetch(path, options = {}) {
  // If services are offline or API is disabled, fail gracefully and continue
  if (!API_CONFIG.enabled || servicesOffline) {
    return Promise.reject(
      new Error("API offline - continuing in offline mode")
    );
  }

  const fullUrl = `${API_CONFIG.baseUrl}${path}`;
  const timeout = 2000; // Reduced timeout

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const fetchOptions = { ...options, signal: controller.signal };
    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(id);

    if (!response.ok) {
      API_FAILURES++;
      if (API_FAILURES >= API_FAILURE_THRESHOLD) {
        disableApi(`HTTP ${response.status}`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    // success
    API_FAILURES = 0;
    return response;
  } catch (err) {
    API_FAILURES++;
    if (API_FAILURES >= API_FAILURE_THRESHOLD) {
      disableApi(err.message || "network error");
    }
    // Don't throw - fail silently to allow offline play
    return Promise.reject(err);
  }
}

// Game state
const board = document.getElementById("board");
const BOARD_SIZE = 10;
const squares = [];
let selectedPiece = null;
let currentPlayer = "red";
let selectedPieceRow = null;
let selectedPieceCol = null;
let mustContinueCapture = false;
let forcedCapturePiece = null;
let gameOver = false;
let aiEnabled = true;
let aiThinking = false;
let moveCount = 0;
let redScore = 0;
let blackScore = 0;
let lastJumpDirection = null; // Track direction to prevent 180U-turns in multi-captures

// Game tracking for AI learning
let gameId = null;
let gameStartTime = null;
let gameTrajectory = [];
let gameResultSent = false; // Track if result already sent for this game

// ═══════════════════════════════════════════════════════════════════
// PHASE 3: PERIODIC DEFENSE MONITORING & OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════

// Periodic defense evaluation variables
let defensiveMetrics = null;
let defensiveState = null;
let cachedFormationState = null;

const PERIODIC_EVAL_INTERVAL = 1; // Every 1 move (Continuous monitoring)
const HEALTH_WARNING_THRESHOLD = 60;

// Centralized Piece Values for Dynamic Adjustment
const PIECE_VALUES = {
  opening: { pawn: 100, king: 300 },
  endgame: { pawn: 150, king: 500 } // Higher value enforces "Anti-Sacrifice" in endgame
};

let currentPhase = "opening"; // "opening" or "endgame"
const HEALTH_CRITICAL_THRESHOLD = 40;

// Enhanced AI system
const enhancedAI = {
  difficulty: 99,
  maxDepth: 10,

  // Base weights that evolve over many games
  baseWeights: {
    // Core values
    material: 1000000, // ABSOLUTE: Base unit (1 Pawn)
    king: 4000000, // Kings are worth 4 Pawns (Strategic Balance)

    // Strategic weights - ABSOLUTE DEFENSE
    position: 10,
    safety: 1000000,
    mobility: 1,
    center: 5,
    advancement: 5, // Near zero: Only advance in absolute vacuum
    cohesion: 50000, // MASSIVE INCREASE: Groups must stick together like glue
    selfDanger: 1500000, // High penalty, but allows calculated risks (1.5 Pawns)

    // Tactical weights - DEFENSIVE CAPTURES ONLY
    captureBase: 8000,
    multiCaptureBonus: 2000,
    kingCaptureBonus: 10000,
    safeCaptureBonus: 3000,
    promotionBonus: 2000000, // Significance incentive (2 Pawns)
    promotionRush: 500000, // Strong drive to promote
    nearPromotionAdvancement: 3000, // NEW: Reward forward movement when close
    threatCreation: 50, // Purely reactive defense
    defensiveValue: 2000,
    kingProtection: 10000,
    kingExposurePenalty: 50000,
    tacticalThreatBonus: 1,
    kingEndangerPenalty: 4500000, // Risking a King is very bad (4.5 Pawns), but not infinite

    // Attack mode weights - BLOCKED
    sacrificeThreshold: 10000000, // Effectively infinite
    exchangeFavorable: 10, // Even a "good" trade is avoided
    exchangeUnfavorable: 10000000,
    chainPreventionMajor: 10000,
    chainPreventionMinor: 5000,
    threatNeutralization: 2000,
    tacticalPressure: 1,
    activityGain: 1,

    // Positional weights - MAXIMUM DEFENSIVE FOCUS WITH GAP CLOSURE
    gapClosure: 100000, // SUPREME PRIORITY: Closing gaps is now a primary objective
    gapClosureBonus: 80000, // HUGE REWARD for each connection made
    support: 5000,
    edgeSafety: 2000,
    isolationPenalty: 100000, // Increased: Being alone is death
    cohesionBonus: 10000, // Increased: Stick together
    isolationPenaltyFromCohesion: 10000,
    tightFormationBonus: 20000, // Increased: Tight formations are mandatory
    supportBonus: 10000,
    leavingGapPenalty: 2000000, // ABSOLUTE LOCK: Never create a gap voluntarily
    fragmentationPenalty: 1000000, // Breaking the wall is forbidden
    defensiveLinePenalty: 500000,
    defensiveHolePenalty: 1500000,
    penetrationRiskPenalty: 50000,
    followLeaderBonus: 5000, // Follow the leader to close the gap behind them
    advancementBonus: 20, // Reduced - very cautious advancement
    fillGapBonus: 50000, // TOP PRIORITY: If you see a hole, fill it immediately
    compactFormationBonus: 10000, // Compactness is key
    centerControlDirect: 20, // Reduced
    centerControlNear: 10, // Reduced
    centerControlInfluence: 2, // Reduced

    // Side square occupation weights - DEFENSIVE POSITIONS
    sideOccupation: 400, // Increased from 300 - side squares are safe
    sideProximity: 150, // Increased from 120 - get to safe positions
    sideAvailable: 200, // Increased from 180 - strong incentive for safety

    // Strategic weights - MAXIMUM DEFENSIVE PLAY
    kingActivity: 2, // Reduced - don't expose kings
    kingThreatBonus: 2, // Reduced - don't threaten with kings
    keySquareControl: 100, // Increased - control important defensive squares
    tempo: 1, // Reduced - no tempo pressure
    tempoCaptureBonus: 5,

    // Phase-specific weights
    endgameKingBonus: 60,
    openingCenterBonusFactor: 0.1, // Reduced - less center aggression
    opponentThreatPenalty: 60, // Increased - avoid opponent threats

    // Learning weights
    learnedWinPattern: 10,
    learnedLossPattern: 50, // Increased - learn from losses more

    // NEW: Defensive weights for comprehensive evaluation
    formationGap: 50000, // Filling formation gaps is critical
    backRankLeaving: 1000000, // ABSOLUTE BACK RANK LOCK
    backRankDefense: 100000,
    holeFilling: 100000, // Massive bonus for hole filling

    // Dynamic Valuation System Weights
    stuckPiecePenalty: 50000, // Penalty for having no moves
    attackZoneBonus: 80000, // Bonus for rows 7/8 influence
    backRankDecayRate: 0.4, // Multiplier for back rank when front line is active

    // Team-Based Advancement (Wall Format)
    frontLineSolidarityBonus: 20000,
    isolationLockdownPenalty: 500000, // Massive penalty for going rogue
    phalanxAlignmentBonus: 15000,

    openingBackfill: 1000000,
    lonePiecePenalty: 5000000, // ABSOLUTE NO
    groupSpreadPenalty: 50000,
    phalanxBonus: 50000,
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: SIMPLIFIED WEIGHT SYSTEM (3-Tier Hierarchy)
  // ═══════════════════════════════════════════════════════════════════
  // Optional replacement for baseWeights above - provides clearer hierarchy
  simplifiedWeights: {
    // TIER 1: CRITICAL (Must haves - 5000-10000)
    // These protect basic game integrity
    critical: {
      avoidCapture: 5000, // Must not lose pieces
      kingProtection: 8000, // Kings are irreplaceable
      avoidTrap: 6000, // Don't get trapped
    },

    // TIER 2: STRUCTURAL (Formation - 1000-2000)
    // These maintain formation integrity
    structural: {
      gapClosure: 1000, // Fill gaps
      support: 1500, // Keep pieces supported
      isolation: 2000, // Never isolate pieces
      cohesion: 1200, // Stay grouped
    },

    // TIER 3: POSITIONAL (Nice-to-haves - 100-500)
    // These improve position but aren't critical
    positional: {
      backRank: 300, // Defend back rank
      lineStrength: 200, // Maintain defensive lines
      sideSquares: 150, // Prefer edge positions
      advancement: 100, // Cautious forward movement
    },
  },

  // Track last move to facilitate gap closure
  lastMoveFromRow: null,
  lastMoveFromCol: null,

  // Dynamic weights used for the current move calculation
  weights: {},

  // Monte Carlo Tree Search Configuration
  mcts: {
    enabled: true, // Enable MCTS for advanced AI capabilities
    simulationsPerMove: 500,
    explorationConstant: Math.sqrt(2),
    maxDepth: 50,
    timeLimit: 2000,
    useParallelization: false,
    totalSimulations: 0,
    averageSimulationDepth: 0,
    nodesCached: 0,
    cacheHits: 0,
  },

  // Transposition Table and Zobrist Hashing
  transpositionTable: new Map(),
  zobristKeys: null,
  historyTable: {}, // For move ordering
  killerMoves: Array.from({ length: 32 }, () => []), // [depth][move]

  initZobrist() {
    if (this.zobristKeys) return;

    const size = 10; // BOARD_SIZE
    const pieceTypes = 4; // Black Pawn, Black King, Red Pawn, Red King

    this.zobristKeys = Array.from({ length: size }, () =>
      Array.from({ length: size }, () =>
        Array.from(
          { length: pieceTypes },
          () =>
            (BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) <<
              32n) |
            BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
        )
      )
    );

    // Side to move key
    this.zobristSideKey =
      (BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) << 32n) |
      BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  },

  getZobristHash(board, side) {
    let hash = 0n;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const p = board[r][c];
        if (p) {
          let typeIdx = (p.color === "black" ? 0 : 2) + (p.king ? 1 : 0);
          hash ^= this.zobristKeys[r][c][typeIdx];
        }
      }
    }
    if (side === "red") hash ^= this.zobristSideKey;
    return hash;
  },

  // Enhanced Learning System with Advanced AI Memory
  memory: {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    patterns: new Map(),
    moveOutcomes: [],
    positionDatabase: new Map(),
    openingBook: new Map(),
    endgameKnowledge: new Map(),
    tacticalPatterns: new Map(),
    averageGameLength: 0,
    totalMoves: 0,
    captureSuccess: 0,
    captureAttempts: 0,
    kingPromotions: 0,
    lastGameMoves: [],
    winningMoveTypes: new Map(),
    losingMoveTypes: new Map(),

    // Enhanced Learning Components
    gameHistory: [], // Store complete game records
    playerPatterns: new Map(), // Learn human player patterns
    evaluationAccuracy: 0, // Track how accurate move evaluations were
    timeSpentThinking: [], // Track thinking time vs game outcome
    averageThinkingTime: 0,
    strategyEffectiveness: new Map(), // Track which strategies work best
    adaptiveWeights: new Map(), // Store learned weight adjustments
    positionOutcomes: new Map(), // Map positions to their outcomes
    mistakePatterns: new Map(), // Common mistake patterns to avoid
    successfulSequences: [], // Store successful move sequences
    opponentWeaknesses: new Map(), // Learn opponent tendencies
    contextualLearning: new Map(), // Learn based on game context
    learningRate: 0.1, // How fast the AI adapts
    confidenceLevel: 0.5, // AI's confidence in its learning
    experienceLevel: 0, // Accumulated experience points

    // NEW: Enhanced Learning Mechanisms
    losingMovesByPosition: new Map(), // Position-specific losing patterns
    losingPatternsByContext: new Map(), // Context-aware (phase+type) losing patterns
    losingMoveTimestamps: new Map(), // Timestamps for time-decay calculation
    criticalBlunders: new Map(), // Tracks critical blunders (200+ eval drop)
  },

  // Advanced position evaluation
  evaluatePosition(color) {
    return this.evaluatePositionEnhanced(this.getCurrentBoardState(), color);
  },

  // NEW: Check for endgame status (<= 8 pieces)
  checkEndgameStatus() {
    let blackPieces = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "black") {
          blackPieces++;
        }
      }
    }

    if (blackPieces <= 8) {
      if (currentPhase !== "endgame") {
        console.log("⚠️ ENDGAME DETECTED: Switching to Absolute Defense Mode (Pieces <= 8)");
        currentPhase = "endgame";
        // Force update of weights immediately when phase changes
        this.updateEndgameWeights();
      }
    } else {
      currentPhase = "opening";
    }
    return currentPhase;
  },

  // NEW: Dynamically adjust weights for endgame
  updateEndgameWeights() {
    if (currentPhase === "endgame") {
      // Significantly boost defensive weights
      this.weights.kingEndangerPenalty = 9000000; // Almost double the penalty
      this.weights.sacrificeThreshold = 20000000; // Impossible to jump over
      this.weights.isolationPenalty = 150000;
      this.weights.formationIntegrity = 100000; // New weight priority
      this.weights.avoidCapture = 10000; // Must not lose pieces
      
      console.log("🛡️ DEFENSE PROTOCOL ACTIVE: Weights adjusted for maximum survival.");
    } else {
       // Reset to base weights (implicit, as this.weights is usually a copy of baseWeights)
       // But to be safe, we can re-assign base values if needed, or rely on the copy mechanism at start of move
    }
  },

  evaluateTacticalThreats(color) {
    let threats = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (!piece || piece.dataset.color !== color) continue;

        threats += this.countThreats(row, col, piece);
      }
    }

    return threats * this.weights.tacticalThreatBonus;
  },

  countThreats(row, col, piece) {
    let threatCount = 0;
    const isKing = piece.dataset.king === "true";
    const color = piece.dataset.color;
    const opponentColor = color === "black" ? "red" : "black";

    const directions = isKing
      ? [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]
      : color === "black"
      ? [
          [1, -1],
          [1, 1],
        ]
      : [
          [-1, -1],
          [-1, 1],
        ];

    for (const [dRow, dCol] of directions) {
      const jumpRow = row + dRow * 2;
      const jumpCol = col + dCol * 2;

      if (
        jumpRow >= 0 &&
        jumpRow < BOARD_SIZE &&
        jumpCol >= 0 &&
        jumpCol < BOARD_SIZE
      ) {
        const middleRow = row + dRow;
        const middleCol = col + dCol;
        const middlePiece = this.getPieceAt(middleRow, middleCol);
        const landSquare = this.getPieceAt(jumpRow, jumpCol);

        if (
          middlePiece &&
          middlePiece.dataset.color === opponentColor &&
          !landSquare
        ) {
          threatCount++;
        }
      }
    }

    return threatCount;
  },

  evaluateKingSafety(color) {
    // Implementation for king safety evaluation
    return 0;
  },

  // Enhanced cohesion evaluation functions
  evaluateCohesion(move) {
    // Evaluate how well this move keeps pieces grouped together
    let cohesionScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;
    const fromRow = move.fromRow;
    const fromCol = move.fromCol;

    // Count friendly pieces near the destination
    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    let nearbyFriendlyAtDestination = 0;
    let nearbyFriendlyAtSource = 0;
    let isolatedPiecesLeftBehind = 0;

    // Count pieces near destination
    for (const [dRow, dCol] of directions) {
      const checkRow = toRow + dRow;
      const checkCol = toCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          nearbyFriendlyAtDestination++;
        }
      }
    }

    // Count pieces near current position (what we're leaving behind)
    for (const [dRow, dCol] of directions) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (
          piece &&
          piece.dataset.color === "black" &&
          !(checkRow === toRow && checkCol === toCol)
        ) {
          nearbyFriendlyAtSource++;

          // Check if this piece will be isolated after we move
          let willBeIsolated = true;
          for (const [dRow2, dCol2] of directions) {
            const neighborRow = checkRow + dRow2;
            const neighborCol = checkCol + dCol2;

            if (
              neighborRow >= 0 &&
              neighborRow < BOARD_SIZE &&
              neighborCol >= 0 &&
              neighborCol < BOARD_SIZE
            ) {
              // Skip the square we're moving from
              if (neighborRow === fromRow && neighborCol === fromCol) continue;

              const neighbor = this.getPieceAt(neighborRow, neighborCol);
              if (neighbor && neighbor.dataset.color === "black") {
                willBeIsolated = false;
                break;
              }
            }
          }

          if (willBeIsolated) {
            isolatedPiecesLeftBehind++;
          }
        }
      }
    }

    // Reward joining groups, penalize leaving isolated pieces
    cohesionScore = nearbyFriendlyAtDestination * this.weights.cohesionBonus;

    // HEAVY penalty for leaving pieces isolated
    cohesionScore -=
      isolatedPiecesLeftBehind * this.weights.fragmentationPenalty;

    // Additional penalty for leaving a supported position to go to a less supported one
    if (nearbyFriendlyAtSource > nearbyFriendlyAtDestination) {
      cohesionScore -=
        (nearbyFriendlyAtSource - nearbyFriendlyAtDestination) *
        this.weights.isolationPenaltyFromCohesion;
    }

    // Extra bonus for creating tight formations (3+ pieces together)
    if (nearbyFriendlyAtDestination >= 3) {
      cohesionScore += this.weights.tightFormationBonus;
    }

    // Bonus for maintaining group cohesion (moving but staying connected)
    if (nearbyFriendlyAtDestination >= 2 && nearbyFriendlyAtSource >= 2) {
      cohesionScore += this.weights.cohesionBonus * 2;
    }

    return cohesionScore;
  },

  // ENHANCED GAP CLOSURE - Prioritize filling empty squares and defensive formation
  evaluateGapClosure(move) {
    const toRow = move.toRow;
    const toCol = move.toCol;
    const fromRow = move.fromRow;
    const fromCol = move.fromCol;
    let gapScore = 0;

    // CRITICAL: Identify key defensive gaps that MUST be filled
    const criticalGapFill = this.evaluateCriticalGapFill(toRow, toCol);
    gapScore += criticalGapFill;

    // Evaluate basic connections at destination
    const connectionsCreated = this.countConnections(toRow, toCol);
    gapScore += connectionsCreated * this.weights.gapClosureBonus * 2; // Doubled importance

    // PENALTY for creating gaps by leaving (defensive integrity)
    const gapsCreatedByLeaving = this.countGapsCreatedByLeaving(
      fromRow,
      fromCol,
      toRow,
      toCol
    );
    gapScore -= gapsCreatedByLeaving * this.weights.leavingGapPenalty * 1.5; // Increased penalty

    // BONUS: Creating defensive lines and walls
    const defensiveLineBonus = this.evaluateDefensiveLineCreation(toRow, toCol);
    gapScore += defensiveLineBonus;

    // MAJOR BONUS: Filling holes in our back ranks (critical defensive squares)
    const backRankFill = this.evaluateBackRankFill(toRow, toCol);
    gapScore += backRankFill;

    // Extra bonus for multiple connections (forming strong defensive clusters)
    if (connectionsCreated >= 2) {
      gapScore += this.weights.gapClosureBonus * 3; // Triple bonus for multiple connections
    }

    // STRICT OPENING LOGIC
    // 1. GRAVITY: Pull pieces to rows 0, 1, 2. Rewarding occupying the back is good.
    // 2. ADHESION: Penalize leaving the back rows heavily.

    if (fromRow <= 2 && toRow > 2 && !move.isCapture) {
      gapScore -= 15000; // Do not leave the opening 3 rows empty!
    }

    // COMPULSORY BACKFILLING IN OPENING:
    // We pass the full move now to check context
    const backfillBonus = this.evaluateOpeningBackfill(toRow, toCol);
    gapScore += backfillBonus;

    // STRICT PENALTY APPLICATION:
    // Never waive penalties. A gap created is a gap created.
    gapScore -= gapsCreatedByLeaving * this.weights.leavingGapPenalty;

    // SPECIFIC USER REQUEST: Fill the empty space from the PREVIOUS move
    // "the second ai openning move is to fill the emptied space from the first move"
    const previousFillBonus = this.evaluatePreviousGapFill(move);
    gapScore += previousFillBonus;

    return gapScore;
  },

  // NEW: Specifically target the square we just vacated
  evaluatePreviousGapFill(move) {
    if (this.lastMoveFromRow !== null && this.lastMoveFromCol !== null) {
      if (
        move.toRow === this.lastMoveFromRow &&
        move.toCol === this.lastMoveFromCol
      ) {
        return 12000; // SUPREME PRIORITY - Must happen if possible
      }
    }
    return 0;
  },

  // REWRITTEN: Evaluate Solidarity (Cluster moving)
  evaluateOpeningBackfill(row, col) {
    // OPENING GRAVITY
    // If we are in the opening phase (first ~10-15 moves), we want to occupy the first 3 rows.

    let solidarityBonus = 0;

    if (row === 0) solidarityBonus += 5000; // Back rank is GOLD
    if (row === 1) solidarityBonus += 3000; // Row 1 is SILVER
    if (row === 2) solidarityBonus += 1000; // Row 2 is BRONZE

    // Reward forming a horizontal pair (same as before)
    const left = this.getPieceAt(row, col - 1);
    const right = this.getPieceAt(row, col + 1);

    if (left && left.dataset.color === "black") solidarityBonus += 800;
    if (right && right.dataset.color === "black") solidarityBonus += 800;

    // Reward forming a horizontal line of 3
    if (
      left &&
      right &&
      left.dataset.color === "black" &&
      right.dataset.color === "black"
    ) {
      solidarityBonus += 4000; // HUGE BONUS for completing a wall
    }

    return solidarityBonus;
  },

  // NEW: Evaluate critical gaps that MUST be filled for defense
  evaluateCriticalGapFill(row, col) {
    let criticalScore = 0;

    // Check if this position fills a dangerous hole in our defense
    const surroundingPieces = this.countSurroundingFriendlyPieces(row, col);
    if (surroundingPieces >= 3) {
      criticalScore += 200; // High value for filling surrounded gaps
    }

    // Check if this creates a defensive barrier against opponent advancement
    const blocksOpponentAdvance = this.checksOpponentAdvancement(row, col);
    if (blocksOpponentAdvance) {
      criticalScore += 150;
    }

    return criticalScore;
  },

  // NEW: Count connections this position would create
  countConnections(row, col) {
    const diagonals = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    let connections = 0;

    for (const [dRow, dCol] of diagonals) {
      const pos1Row = row + dRow;
      const pos1Col = col + dCol;
      const pos2Row = row - dRow;
      const pos2Col = col - dCol;

      if (
        this.isValidPosition(pos1Row, pos1Col) &&
        this.isValidPosition(pos2Row, pos2Col)
      ) {
        const piece1 = this.getPieceAt(pos1Row, pos1Col);
        const piece2 = this.getPieceAt(pos2Row, pos2Col);

        if (
          piece1?.dataset.color === "black" &&
          piece2?.dataset.color === "black"
        ) {
          connections++;
        }
      }
    }
    return connections;
  },

  // NEW: Count gaps created by leaving a position
  countGapsCreatedByLeaving(fromRow, fromCol, toRow, toCol) {
    const diagonals = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    let gapsCreated = 0;

    for (const [dRow, dCol] of diagonals) {
      const pos1Row = fromRow + dRow;
      const pos1Col = fromCol + dCol;
      const pos2Row = fromRow - dRow;
      const pos2Col = fromCol - dCol;

      if (
        this.isValidPosition(pos1Row, pos1Col) &&
        this.isValidPosition(pos2Row, pos2Col)
      ) {
        const piece1 = this.getPieceAt(pos1Row, pos1Col);
        const piece2 = this.getPieceAt(pos2Row, pos2Col);

        // If we're leaving and there are pieces on opposite sides, we're creating a gap
        if (
          piece1?.dataset.color === "black" &&
          piece2?.dataset.color === "black" &&
          !(pos1Row === toRow && pos1Col === toCol) &&
          !(pos2Row === toRow && pos2Col === toCol)
        ) {
          gapsCreated++;
        }
      }
    }
    return gapsCreated;
  },

  // NEW: Evaluate creation of defensive lines
  evaluateDefensiveLineCreation(row, col) {
    let lineBonus = 0;

    // Check if this creates horizontal defensive line
    const horizontalLine = this.checksHorizontalDefensiveLine(row, col);
    if (horizontalLine >= 2) {
      lineBonus += horizontalLine * 50;
    }

    // Check if this creates diagonal defensive line
    const diagonalLine = this.checksDiagonalDefensiveLine(row, col);
    if (diagonalLine >= 2) {
      lineBonus += diagonalLine * 40;
    }

    return lineBonus;
  },

  // NEW: Evaluate filling holes between pieces
  evaluateHoleFilling(row, col) {
    let bonus = 0;

    // 1. Horizontal Hole Filling (Piece - Empty - Piece)
    if (col > 0 && col < BOARD_SIZE - 1) {
      const leftPiece = this.getPieceAt(row, col - 1);
      const rightPiece = this.getPieceAt(row, col + 1);
      if (
        leftPiece &&
        leftPiece.dataset.color === "black" &&
        rightPiece &&
        rightPiece.dataset.color === "black"
      ) {
        bonus += this.weights.holeFilling || 500;
      }

      // Also check wider gaps (Piece - Empty - Empty - Piece) where we fill one
      if (col > 1 && col < BOARD_SIZE - 2) {
        const leftFar = this.getPieceAt(row, col - 2);
        const rightFar = this.getPieceAt(row, col + 2);
        if (leftFar && leftFar.dataset.color === "black")
          bonus += (this.weights.holeFilling || 500) * 0.5;
        if (rightFar && rightFar.dataset.color === "black")
          bonus += (this.weights.holeFilling || 500) * 0.5;
      }
    }

    // 2. Diagonal Hole Filling (Piece - Empty - Piece)
    const diagonals = [
      [
        [-1, -1],
        [1, 1],
      ], // Top-Left to Bottom-Right
      [
        [-1, 1],
        [1, -1],
      ], // Top-Right to Bottom-Left
    ];

    for (const [dir1, dir2] of diagonals) {
      const r1 = row + dir1[0],
        c1 = col + dir1[1];
      const r2 = row + dir2[0],
        c2 = col + dir2[1];

      if (this.isValidPosition(r1, c1) && this.isValidPosition(r2, c2)) {
        const p1 = this.getPieceAt(r1, c1);
        const p2 = this.getPieceAt(r2, c2);

        if (
          p1 &&
          p1.dataset.color === "black" &&
          p2 &&
          p2.dataset.color === "black"
        ) {
          bonus += this.weights.holeFilling || 500;
        }
      }
    }

    return bonus;
  },

  // NEW: Evaluate filling critical back rank positions
  evaluateBackRankFill(row, col) {
    let backRankScore = 0;

    // Prioritize filling our back 2 rows (rows BOARD_SIZE-2 to BOARD_SIZE-1)
    if (row >= BOARD_SIZE - 2) {
      backRankScore += 100; // High priority for back rank defense

      // Extra bonus for corner and edge protection
      if (col === 0 || col === BOARD_SIZE - 1) {
        backRankScore += 50; // Protect the edges
      }

      // Check if this prevents opponent king formation
      if (this.preventsOpponentKingFormation(row, col)) {
        backRankScore += 75;
      }
    }

    return backRankScore;
  },

  // Helper functions for enhanced gap closure evaluation
  countSurroundingFriendlyPieces(row, col) {
    const adjacent = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    let count = 0;

    for (const [dRow, dCol] of adjacent) {
      const newRow = row + dRow;
      const newCol = col + dCol;
      if (this.isValidPosition(newRow, newCol)) {
        const piece = this.getPieceAt(newRow, newCol);
        if (piece?.dataset.color === "black") count++;
      }
    }
    return count;
  },

  checksOpponentAdvancement(row, col) {
    // Check if placing a piece here blocks red pieces from advancing
    const redThreats = this.getRedThreatsToPosition(row, col);
    return redThreats.length > 0;
  },

  getRedThreatsToPosition(row, col) {
    const threats = [];
    const attackPositions = [
      [row + 1, col - 1],
      [row + 1, col + 1],
      [row - 1, col - 1],
      [row - 1, col + 1],
    ];

    for (const [r, c] of attackPositions) {
      if (this.isValidPosition(r, c)) {
        const piece = this.getPieceAt(r, c);
        if (piece?.dataset.color === "red") {
          threats.push({ row: r, col: c });
        }
      }
    }
    return threats;
  },

  checksHorizontalDefensiveLine(row, col) {
    let lineLength = 0;

    // Count pieces to the left and right on the same row
    for (let c = col - 1; c >= 0; c -= 2) {
      const piece = this.getPieceAt(row, c);
      if (piece?.dataset.color === "black") lineLength++;
      else break;
    }

    for (let c = col + 1; c < BOARD_SIZE; c += 2) {
      const piece = this.getPieceAt(row, c);
      if (piece?.dataset.color === "black") lineLength++;
      else break;
    }

    return lineLength;
  },

  checksDiagonalDefensiveLine(row, col) {
    let maxLineLength = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      let lineLength = 0;

      // Count in one direction
      for (let i = 1; i < BOARD_SIZE; i++) {
        const r = row + dRow * i;
        const c = col + dCol * i;
        if (!this.isValidPosition(r, c)) break;
        const piece = this.getPieceAt(r, c);
        if (piece?.dataset.color === "black") lineLength++;
        else break;
      }

      // Count in opposite direction
      for (let i = 1; i < BOARD_SIZE; i++) {
        const r = row - dRow * i;
        const c = col - dCol * i;
        if (!this.isValidPosition(r, c)) break;
        const piece = this.getPieceAt(r, c);
        if (piece?.dataset.color === "black") lineLength++;
        else break;
      }

      maxLineLength = Math.max(maxLineLength, lineLength);
    }

    return maxLineLength;
  },

  preventsOpponentKingFormation(row, col) {
    // Check if this position prevents red pieces from reaching the back rank
    return row === BOARD_SIZE - 3 && this.hasRedPieceApproaching(row, col);
  },

  hasRedPieceApproaching(row, col) {
    // Check if there are red pieces that could reach this position
    const approachPositions = [
      [row - 1, col - 1],
      [row - 1, col + 1],
    ];

    for (const [r, c] of approachPositions) {
      if (this.isValidPosition(r, c)) {
        const piece = this.getPieceAt(r, c);
        if (piece?.dataset.color === "red") return true;
      }
    }
    return false;
  },

  isValidPosition(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  },

  // NEW: Enhanced defensive formation evaluation
  evaluateDefensiveFormation(move) {
    let defenseScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;
    const fromRow = move.fromRow;

    // CRITICAL: Filling empty squares in defensive zone (rows 0-3)
    if (toRow <= 3) {
      defenseScore += this.weights.fillGapBonus * 1.5;

      // Extra bonus for back ranks (rows 0-1)
      if (toRow <= 1) {
        defenseScore += this.weights.fillGapBonus * 2;
      }

      // Check if this creates a defensive wall
      const wallStrength = this.evaluateDefensiveWall(toRow, toCol);
      defenseScore += wallStrength * 50;
    }

    // PENALTY: Leaving defensive zone without good reason
    if (fromRow <= 3 && toRow > 3 && !move.isCapture) {
      defenseScore -= this.weights.backRankLeaving * 2;
    }

    // BONUS: Creating mutual support in defensive formation
    const supportCount = this.countDefensiveSupport(toRow, toCol);
    defenseScore += supportCount * this.weights.supportBonus * 1.5;

    return defenseScore;
  },

  // NEW: Evaluate defensive wall strength
  evaluateDefensiveWall(row, col) {
    let wallStrength = 0;

    // Check horizontal defensive line (same row)
    let horizontalPieces = 0;
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = this.getPieceAt(row, c);
      if (piece && piece.dataset.color === "black") {
        horizontalPieces++;
      }
    }
    wallStrength += Math.min(horizontalPieces, 4); // Cap at 4 for full row

    // Check diagonal defensive chain
    const diagonalChain = this.countDiagonalChain(row, col);
    wallStrength += diagonalChain;

    return wallStrength;
  },

  // NEW: Count pieces in diagonal defensive chain
  countDiagonalChain(row, col) {
    let chainLength = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      let r = row + dRow;
      let c = col + dCol;
      let consecutivePieces = 0;

      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "black") {
          consecutivePieces++;
        } else {
          break;
        }
        r += dRow;
        c += dCol;
      }

      chainLength = Math.max(chainLength, consecutivePieces);
    }

    return chainLength;
  },

  // NEW: Count defensive support for a position
  countDefensiveSupport(row, col) {
    let supportCount = 0;
    const supportPositions = [
      [row - 1, col - 1],
      [row - 1, col + 1],
      [row + 1, col - 1],
      [row + 1, col + 1],
    ];

    for (const [r, c] of supportPositions) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "black") {
          supportCount++;
        }
      }
    }

    return supportCount;
  },

  evaluateSupport(move) {
    // Evaluate if this piece will have support from other pieces
    const toRow = move.toRow;
    const toCol = move.toCol;
    let supportScore = 0;

    // Check diagonal support positions (where pieces can protect each other)
    const diagonals = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of diagonals) {
      const supportRow = toRow + dRow;
      const supportCol = toCol + dCol;

      if (
        supportRow >= 0 &&
        supportRow < BOARD_SIZE &&
        supportCol >= 0 &&
        supportCol < BOARD_SIZE
      ) {
        const supportPiece = this.getPieceAt(supportRow, supportCol);
        if (supportPiece && supportPiece.dataset.color === "black") {
          supportScore += this.weights.supportBonus;
        }
      }
    }

    return supportScore;
  },

  evaluateIsolation(move) {
    // Penalize moves that leave pieces isolated
    const fromRow = move.fromRow;
    const fromCol = move.fromCol;
    const toRow = move.toRow;
    const toCol = move.toCol;
    let isolationPenalty = 0;

    // Check if moving this piece leaves other pieces isolated
    const adjacents = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    for (const [dRow, dCol] of adjacents) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          // Check if this piece would become isolated after we move
          let hasOtherNeighbors = 0;
          for (const [dRow2, dCol2] of adjacents) {
            const neighborRow = checkRow + dRow2;
            const neighborCol = checkCol + dCol2;

            if (
              neighborRow >= 0 &&
              neighborRow < BOARD_SIZE &&
              neighborCol >= 0 &&
              neighborCol < BOARD_SIZE &&
              !(neighborRow === fromRow && neighborCol === fromCol) // Don't count the moving piece
            ) {
              const neighbor = this.getPieceAt(neighborRow, neighborCol);
              if (neighbor && neighbor.dataset.color === "black") {
                hasOtherNeighbors++;
              }
            }
          }

          if (hasOtherNeighbors === 0) {
            isolationPenalty += this.weights.isolationPenalty * 2; // HEAVY penalty for isolating a piece
          } else if (hasOtherNeighbors === 1) {
            isolationPenalty += this.weights.isolationPenalty; // Moderate penalty for weak support
          }
        }
      }
    }

    // Also check if the destination itself is isolated (discourage moving to isolated positions)
    let destinationSupport = 0;
    for (const [dRow, dCol] of adjacents) {
      const checkRow = toRow + dRow;
      const checkCol = toRow + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          destinationSupport++;
        }
      }
    }

    // Penalty for moving to an isolated square (unless it's a capture)
    if (destinationSupport === 0 && !move.isCapture) {
      isolationPenalty += this.weights.isolationPenalty;
    }

    return isolationPenalty;
  },

  // ADVANCED EVALUATION FUNCTIONS FOR SKILL-BASED AI

  evaluateThreatCreation(move) {
    let threatScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;

    // Check if this move creates threats against opponent pieces
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const jumpRow = toRow + dRow * 2;
      const jumpCol = toCol + dCol * 2;

      if (
        jumpRow >= 0 &&
        jumpRow < BOARD_SIZE &&
        jumpCol >= 0 &&
        jumpCol < BOARD_SIZE
      ) {
        const middleRow = toRow + dRow;
        const middleCol = toCol + dCol;
        const middlePiece = this.getPieceAt(middleRow, middleCol);
        const landSquare = this.getPieceAt(jumpRow, jumpCol);

        if (middlePiece && middlePiece.dataset.color === "red" && !landSquare) {
          threatScore += this.weights.threatCreation; // Creates a capture threat
          if (middlePiece.dataset.king === "true") {
            threatScore += this.weights.kingCaptureBonus; // Threatening a king is valuable
          }
        }
      }
    }

    return threatScore;
  },

  evaluateDefensiveValue(move) {
    let defenseScore = 0;
    const fromRow = move.fromRow;
    const fromCol = move.fromCol;

    // Check if this move protects other pieces
    const adjacents = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of adjacents) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (
          piece &&
          piece.dataset.color === "black" &&
          !(checkRow === toRow && checkCol === toCol)
        ) {
          defenseScore++;
        }
      }
    }
    return defenseScore;
  },

  // NEW: Evaluate if this move puts our piece in danger
  evaluateSelfDanger(move) {
    let dangerScore = 0;

    // Check if the destination square puts our piece at risk
    if (this.willBeUnderThreat(move.toRow, move.toCol, move.piece)) {
      dangerScore -= this.weights.selfDanger; // Heavy penalty for self-endangerment

      // Extra penalty if it's a king being endangered
      if (move.piece.dataset.king === "true") {
        dangerScore -= this.weights.kingEndangerPenalty;
      }
    }

    return dangerScore;
  },

  // Check if a piece would be under threat at a specific position
  willBeUnderThreat(row, col, piece) {
    const opponentColor = "red";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // To be captured AT (row, col), an attacker must be in direction -dRow, -dCol
      // and land in direction +dRow, +dCol

      const landingRow = row + dRow;
      const landingCol = col + dCol;

      // Check if landing square is on board
      if (
        landingRow < 0 ||
        landingRow >= BOARD_SIZE ||
        landingCol < 0 ||
        landingCol >= BOARD_SIZE
      ) {
        continue;
      }

      // Landing square MUST be empty (or be the moving piece's OLD position, which is effectively empty)
      const landPiece = this.getPieceAt(landingRow, landingCol);
      if (
        landPiece &&
        !(landingRow === piece.dataset.row && landingCol === piece.dataset.col)
      ) {
        continue;
      }

      // Now look for attackers in the opposite direction (-dRow, -dCol)
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const attackRow = row - dRow * dist;
        const attackCol = col - dCol * dist;

        if (
          attackRow < 0 ||
          attackRow >= BOARD_SIZE ||
          attackCol < 0 ||
          attackCol >= BOARD_SIZE
        )
          break;

        const attacker = this.getPieceAt(attackRow, attackCol);
        if (attacker) {
          if (attacker.dataset.color === opponentColor) {
            const isKing = attacker.dataset.king === "true";

            // Regular pieces can only capture from dist = 1
            if (!isKing && dist > 1) break;

            // Regular pieces can capture in all directions in 10x10 International Drafts
            // (Note: standard 10x10 allows backward captures for single pieces)
            return true;
          } else {
            // Friendly piece blocks the capture path
            break;
          }
        }
        // If it's an empty square, a regular piece cannot jump from here, but a King might be further back
      }
    }

    return false;
  },

  // Count total threats to a piece (for periodic defense evaluation)
  countThreatsTo(row, col, piece) {
    let threatCount = 0;
    const opponentColor = "red";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const landingRow = row + dRow;
      const landingCol = col + dCol;

      if (
        landingRow < 0 ||
        landingRow >= BOARD_SIZE ||
        landingCol < 0 ||
        landingCol >= BOARD_SIZE
      ) {
        continue;
      }

      const landPiece = this.getPieceAt(landingRow, landingCol);
      if (landPiece) continue;

      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const attackRow = row - dRow * dist;
        const attackCol = col - dCol * dist;

        if (
          attackRow < 0 ||
          attackRow >= BOARD_SIZE ||
          attackCol < 0 ||
          attackCol >= BOARD_SIZE
        ) {
          break;
        }

        const attacker = this.getPieceAt(attackRow, attackCol);
        if (attacker) {
          if (attacker.dataset.color === opponentColor) {
            const isKing = attacker.dataset.king === "true";
            if (!isKing && dist > 1) break;
            threatCount++;
          }
          break;
        }
      }
    }

    return threatCount;
  },

  // ═══════════════════════════════════════════════════════════════════
  // UNIFIED THREAT EVALUATION (replaces 3+ redundant functions)
  // ═══════════════════════════════════════════════════════════════════
  evaluateThreatLevel(row, col, piece, depth = 1) {
    const threats = {
      immediate: 0,
      chain: 0,
      total: 0,
      details: [],
    };

    // Early exit: invalid position
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return threats;
    }

    const opponentColor = piece.dataset.color === "red" ? "black" : "red";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // Check if landing square is empty
      const landRow = row + dRow;
      const landCol = col + dCol;

      if (
        landRow < 0 ||
        landRow >= BOARD_SIZE ||
        landCol < 0 ||
        landCol >= BOARD_SIZE
      ) {
        continue;
      }

      if (this.getPieceAt(landRow, landCol)) {
        continue;
      }

      // Look for attacker pieces along opposite diagonal
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const atkRow = row - dRow * dist;
        const atkCol = col - dCol * dist;

        if (
          atkRow < 0 ||
          atkRow >= BOARD_SIZE ||
          atkCol < 0 ||
          atkCol >= BOARD_SIZE
        ) {
          break;
        }

        const attacker = this.getPieceAt(atkRow, atkCol);

        if (!attacker) {
          continue;
        }

        if (attacker.dataset.color === opponentColor) {
          const isKing = attacker.dataset.king === "true";

          if (isKing || dist === 1) {
            threats.immediate++;
            threats.details.push({
              from: [atkRow, atkCol],
              via: [row, col],
              to: [landRow, landCol],
              pieceType: isKing ? "king" : "regular",
            });

            if (depth > 0) {
              const chainDepth = this.checkContinuationCaptures(
                landRow,
                landCol,
                opponentColor,
                depth - 1
              );
              threats.chain = Math.max(threats.chain, chainDepth);
            }
          }
        }

        break;
      }
    }

    threats.total = threats.immediate + threats.chain * 0.5;
    return threats;
  },

  // Helper: Check for continuation captures
  checkContinuationCaptures(row, col, opponentColor, depth) {
    if (depth <= 0) return 0;

    let maxChain = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const landRow = row + dRow;
      const landCol = col + dCol;

      if (
        landRow < 0 ||
        landRow >= BOARD_SIZE ||
        landCol < 0 ||
        landCol >= BOARD_SIZE
      ) {
        continue;
      }

      if (this.getPieceAt(landRow, landCol)) {
        continue;
      }

      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const atkRow = row - dRow * dist;
        const atkCol = col - dCol * dist;

        if (
          atkRow < 0 ||
          atkRow >= BOARD_SIZE ||
          atkCol < 0 ||
          atkCol >= BOARD_SIZE
        ) {
          break;
        }

        const attacker = this.getPieceAt(atkRow, atkCol);
        if (!attacker) continue;

        if (attacker.dataset.color === opponentColor) {
          const isKing = attacker.dataset.king === "true";
          if (isKing || dist === 1) {
            const chainDepth =
              1 +
              this.checkContinuationCaptures(
                landRow,
                landCol,
                opponentColor,
                depth - 1
              );
            maxChain = Math.max(maxChain, chainDepth);
          }
        }
        break;
      }
    }

    return maxChain;
  },

  // NEW: Comprehensive safety evaluation - ensures we don't sacrifice pieces needlessly
  evaluateMoveSafety(move) {
    let safetyScore = 0;

    // 1. Check if destination is safe
    const destinationSafe = !this.willBeUnderThreat(
      move.toRow,
      move.toCol,
      move.piece
    );

    if (!destinationSafe) {
      // Destination is dangerous
      if (move.isCapture) {
        // If it's a capture, we might accept some risk, but still penalize
        safetyScore -= this.weights.selfDanger * 0.5;
      } else {
        // For non-captures, heavily penalize moving into danger
        safetyScore -= this.weights.selfDanger;
      }
    }

    // 2. Check if there are safe alternatives available
    const hasSafeAlternative = this.hasSafeAlternativeMove(move);
    if (!destinationSafe && hasSafeAlternative) {
      // Extra penalty if we have safe options but choosing dangerous one
      safetyScore -= this.weights.selfDanger * 0.3;
    }

    // 3. Bonus for maintaining protected positions
    if (destinationSafe && this.hasAdjacentAllies(move.toRow, move.toCol)) {
      safetyScore += this.weights.supportBonus || 10000;
    }

    return safetyScore;
  },

  // NEW: Look ahead to evaluate consequences of this move
  evaluateMoveConsequences(move) {
    let consequenceScore = 0;

    // Simulate making this move and evaluate the resulting position
    const simulatedBoard = this.simulateMove(move);

    // 1. Check what opponent can do after this move
    const opponentThreats = this.getOpponentThreatsAfterMove(
      simulatedBoard,
      move
    );

    if (opponentThreats.canCapturePiece) {
      // Opponent can capture our piece after this move
      // STRICT PUNISHMENT: Use material weight + penalty
      consequenceScore -= (this.weights.material || 1000000); 

      if (opponentThreats.captureIsUnavoidable) {
        // If we're sacrificing the piece with no gain
        consequenceScore -= this.weights.selfDanger;
      }
    }

    // 2. Check if move creates future opportunities for us
    if (opponentThreats.createsOurFutureCapture) {
      consequenceScore += 150;
    }

    // 3. Check if move improves our position
    const positionImprovement =
      this.evaluatePositionImprovement(simulatedBoard);
    consequenceScore += positionImprovement;

    return consequenceScore;
  },

  // NEW: Enhanced anti-sacrifice evaluation - CRITICAL for stopping piece giveaways
  evaluateAntiSacrifice(move) {
    let antiSacrificeScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;
    
    // Dynamic piece value based on phase
    const values = PIECE_VALUES[currentPhase] || PIECE_VALUES.opening;
    const pieceValue = move.piece.dataset.king === "true" ? values.king : values.pawn;

    // EMERGENCY CHECK: Is this a completely pointless sacrifice?
    if (this.willBeUnderThreat(toRow, toCol, move.piece) && !move.isCapture) {
      antiSacrificeScore -= (this.weights.sacrificeThreshold || 10000000); // MASSIVE penalty to block this move
      return antiSacrificeScore;
    }

    // Check if this creates a chain of sacrifices
    const chainRisk = this.evaluateSacrificeChain(move);
    antiSacrificeScore -= chainRisk * 500;

    // Check if we're in material advantage and shouldn't take risks
    const materialBalance = this.getMaterialBalance();
    if (
      materialBalance > 0 &&
      this.willBeUnderThreat(toRow, toCol, move.piece)
    ) {
      const cautionPenalty = materialBalance * 200;
      antiSacrificeScore -= cautionPenalty;
    }

    return antiSacrificeScore;
  },

  // NEW: Check for sacrifice chain reactions
  evaluateSacrificeChain(move) {
    let chainRisk = 0;

    // Check if moving this piece exposes others to immediate capture
    const exposedPieces = this.getPiecesExposedByMove(move);
    chainRisk += exposedPieces.length;

    if (exposedPieces.length > 0) {
    }

    return chainRisk;
  },

  // NEW: Get pieces that would be exposed by this move
  getPiecesExposedByMove(move) {
    const exposedPieces = [];
    const fromRow = move.fromRow;
    const fromCol = move.fromCol;

    // Check pieces that were relying on this piece for protection
    const adjacentPositions = [
      [fromRow - 1, fromCol - 1],
      [fromRow - 1, fromCol + 1],
      [fromRow + 1, fromCol - 1],
      [fromRow + 1, fromCol + 1],
    ];

    for (const [r, c] of adjacentPositions) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "black") {
          // Check if this piece will be under threat after we move
          const otherProtection = this.hasOtherProtection(
            r,
            c,
            fromRow,
            fromCol
          );
          if (!otherProtection && this.wouldBeUnderThreat(r, c)) {
            exposedPieces.push({ row: r, col: c, piece: piece });
          }
        }
      }
    }

    return exposedPieces;
  },

  // NEW: Check if piece has protection other than the moving piece
  hasOtherProtection(pieceRow, pieceCol, excludeRow, excludeCol) {
    const protectionPositions = [
      [pieceRow - 1, pieceCol - 1],
      [pieceRow - 1, pieceCol + 1],
      [pieceRow + 1, pieceCol - 1],
      [pieceRow + 1, pieceCol + 1],
    ];

    for (const [r, c] of protectionPositions) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (r === excludeRow && c === excludeCol) continue; // Skip the moving piece
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "black") {
          return true; // Has other protection
        }
      }
    }
    return false; // No other protection
  },

  // NEW: Proactively hunt for capture opportunities (Traps & Setups)
  evaluateCaptureOpportunities(move) {
    let opportunityScore = 0;

    // 1. Immediate threats created (The "Threat" logic)
    const simBoard = this.simulateMove(move);

    // Scan for pieces we can capture NEXT turn from this new position
    // We look at the piece we moved to [move.toRow, move.toCol]
    const potentialCaptures = this.findPossibleCapturesOnBoard(
      simBoard,
      move.toRow,
      move.toCol,
      { dataset: { color: "black", king: move.piece.dataset.king } } // Mock piece
    );

    if (potentialCaptures.length > 0) {
      // We set up a capture! But is it forced?
      // Check if opponent can move away.
      // For now, raw threat is good.
      opportunityScore += 200 * potentialCaptures.length;
    }

    // 2. Traps: Did we force a move?
    // (Simplified: Did we limit opponent mobility significantly?)

    return opportunityScore;
  },

  // NEW: Simple material balance calculation
  getMaterialBalance() {
    let blackPieces = 0;
    let redPieces = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (piece) {
          const values = PIECE_VALUES[currentPhase] || PIECE_VALUES.opening;
          const value = piece.dataset.king === "true" ? values.king : values.pawn;
          if (piece.dataset.color === "black") blackPieces += value;
          else redPieces += value;
        }
      }
    }

    return blackPieces - redPieces;
  },

  // NEW: Simple threat check for any position
  wouldBeUnderThreat(row, col) {
    // Check if red pieces can capture at this position
    const capturePositions = [
      [row - 1, col - 1],
      [row - 1, col + 1],
      [row + 1, col - 1],
      [row + 1, col + 1],
    ];

    for (const [r, c] of capturePositions) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "red") {
          // Check if this red piece can actually capture
          const canCapture = this.canPieceCaptureAt(r, c, piece, row, col);
          if (canCapture) return true;
        }
      }
    }
    return false;
  },

  // NEW: Check if a piece can capture at specific position
  canPieceCaptureAt(fromRow, fromCol, piece, targetRow, targetCol) {
    const rowDiff = targetRow - fromRow;
    const colDiff = targetCol - fromCol;

    // Must be diagonal move
    if (Math.abs(rowDiff) !== Math.abs(colDiff)) return false;

    // Regular piece movement rules
    if (piece.dataset.king !== "true") {
      // Red pieces move upward (decreasing row numbers)
      if (piece.dataset.color === "red" && rowDiff > 0) return false;
      // Black pieces move downward (increasing row numbers)
      if (piece.dataset.color === "black" && rowDiff < 0) return false;
    }

    // Must be adjacent (distance 1) for capture
    return Math.abs(rowDiff) === 1 && Math.abs(colDiff) === 1;
  },

  // Check if there are safer alternative moves available
  hasSafeAlternativeMove(currentMove) {
    const allMoves = this.getAllMoves("black");

    for (const move of allMoves) {
      // Skip the current move
      if (
        move.fromRow === currentMove.fromRow &&
        move.fromCol === currentMove.fromCol &&
        move.toRow === currentMove.toRow &&
        move.toCol === currentMove.toCol
      ) {
        continue;
      }

      // Check if this alternative is safe
      if (!this.willBeUnderThreat(move.toRow, move.toCol, move.piece)) {
        return true;
      }
    }

    return false;
  },

  // Check if a position has adjacent allied pieces for protection
  hasAdjacentAllies(row, col) {
    const adjacentPositions = [
      [row - 1, col - 1],
      [row - 1, col + 1],
      [row + 1, col - 1],
      [row + 1, col + 1],
    ];

    for (const [r, c] of adjacentPositions) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const piece = this.getPieceAt(r, c);
        if (piece && piece.dataset.color === "black") {
          return true;
        }
      }
    }

    return false;
  },

  // Simulate a move without actually making it on the board
  simulateMove(move) {
    // Create a simplified board state
    const simBoard = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null));

    // Copy current board state
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = this.getPieceAt(r, c);
        if (piece) {
          simBoard[r][c] = {
            color: piece.dataset.color,
            king: piece.dataset.king === "true",
          };
        }
      }
    }

    // Apply the move
    simBoard[move.toRow][move.toCol] = simBoard[move.fromRow][move.fromCol];
    simBoard[move.fromRow][move.fromCol] = null;

    // Handle captures
    if (move.isCapture) {
      // Handle multi-capture (king captures with capturedPieces array)
      if (move.capturedPieces && Array.isArray(move.capturedPieces)) {
        for (const captured of move.capturedPieces) {
          if (captured.row !== undefined && captured.col !== undefined) {
            simBoard[captured.row][captured.col] = null;
          }
        }
      } else if (
        move.capturedRow !== undefined &&
        move.capturedCol !== undefined
      ) {
        // Explicit capture position provided
        simBoard[move.capturedRow][move.capturedCol] = null;
      } else {
        // Calculate capture position for regular pieces (must be exactly 2 squares apart)
        const rowDiff = Math.abs(move.toRow - move.fromRow);
        const colDiff = Math.abs(move.toCol - move.fromCol);

        // Only calculate if it's a standard 2-square jump
        if (rowDiff === 2 && colDiff === 2) {
          const capturedRow = (move.fromRow + move.toRow) / 2;
          const capturedCol = (move.fromCol + move.toCol) / 2;
          simBoard[capturedRow][capturedCol] = null;
        }
      }
    }

    return simBoard;
  },

  // Evaluate what threats opponent has after our move
  getOpponentThreatsAfterMove(simBoard, move) {
    const threats = {
      canCapturePiece: false,
      captureIsUnavoidable: false,
      createsOurFutureCapture: false,
    };

    // Check if opponent can capture the piece we just moved
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const attackRow = move.toRow - dRow * 2;
      const attackCol = move.toCol - dCol * 2;
      const jumpRow = move.toRow - dRow;
      const jumpCol = move.toCol - dCol;

      if (
        attackRow >= 0 &&
        attackRow < BOARD_SIZE &&
        attackCol >= 0 &&
        attackCol < BOARD_SIZE
      ) {
        const attacker = simBoard[attackRow]?.[attackCol];
        const jumpSquare = simBoard[jumpRow]?.[jumpCol];

        if (attacker && attacker.color === "red" && !jumpSquare) {
          // Check if attacker can legally move in this direction
          const canAttack =
            attacker.king || (attacker.color === "red" && dRow > 0);

          if (canAttack) {
            threats.canCapturePiece = true;
            threats.captureIsUnavoidable = !move.isCapture; // If we didn't gain anything
            break;
          }
        }
      }
    }

    // Check if our move creates future capture opportunities
    for (const [dRow, dCol] of directions) {
      const targetRow = move.toRow + dRow * 2;
      const targetCol = move.toCol + dCol * 2;
      const jumpRow = move.toRow + dRow;
      const jumpCol = move.toCol + dCol;

      if (
        targetRow >= 0 &&
        targetRow < BOARD_SIZE &&
        targetCol >= 0 &&
        targetCol < BOARD_SIZE
      ) {
        const target = simBoard[jumpRow]?.[jumpCol];
        const landing = simBoard[targetRow]?.[targetCol];

        if (target && target.color === "red" && !landing) {
          threats.createsOurFutureCapture = true;
        }
      }
    }

    return threats;
  },

  // Evaluate overall position improvement from the move
  // Evaluate overall position improvement from the move
  evaluatePositionImprovement(simBoard) {
    let improvement = 0;

    // ANNIHILATION LOGIC:
    // Compare opponent pieces on simBoard vs real board
    const currentRedPieces = document.querySelectorAll(".red-piece").length;
    let simRedPieces = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = simBoard[r][c];

        if (piece) {
          if (piece.color === "red") {
            simRedPieces++;
          } else if (piece.color === "black") {
            // Advancement bonus
            improvement += r * 2;
            // King bonus
            if (piece.king) improvement += 30;
          }
        }
      }
    }

    // HUGE reward for reducing opponent count
    const piecesEliminated = currentRedPieces - simRedPieces;
    if (piecesEliminated > 0) {
      improvement += piecesEliminated * 2000;
    }

    return improvement;
  },

  // NEW: Evaluate if a move sets up future multi-capture opportunities
  evaluateMultiCaptureSetup(move) {
    let setupValue = 0;

    // Simulate the move
    const simBoard = this.simulateMove(move);

    // After this move, check if our OTHER pieces have new multi-capture opportunities
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = simBoard[row][col];
        if (piece && piece.color === "black" && piece !== move.piece) {
          // Check if this piece now has multi-capture potential
          const captures = this.findPossibleCapturesOnBoard(
            simBoard,
            row,
            col,
            piece
          );

          for (const capture of captures) {
            const potential = this.calculateCapturePotentialRecursive(
              simBoard,
              capture,
              0
            );
            if (potential >= 2) {
              // This move creates a multi-capture opportunity for another piece
              setupValue += 100 * (potential - 1);
            }
          }
        }
      }
    }

    // Also check if the moved piece itself has follow-up multi-captures available
    if (move.isCapture) {
      const furtherCaptures = this.findPossibleCapturesOnBoard(
        simBoard,
        move.toRow,
        move.toCol,
        move.piece
      );

      for (const capture of furtherCaptures) {
        const potential = this.calculateCapturePotentialRecursive(
          simBoard,
          capture,
          0
        );
        if (potential >= 2) {
          // Direct continuation multi-capture (already rewarded but boost it)
          setupValue += 50 * potential;
        }
      }
    }

    return setupValue;
  },

  // NEW: Calculate total capture potential for a move (including sequential captures)
  calculateCapturePotential(move) {
    // If it's a king multi-capture, we already have the total count
    if (move.capturedPieces && move.capturedPieces.length > 0) {
      return move.capturedPieces.length;
    }

    // For regular pieces, simulate the capture and check for continuation
    if (!move.isCapture) {
      return 0;
    }

    // Start with 1 capture (the immediate one)
    let totalCaptures = 1;

    // Simulate this capture and check what's available next
    const simBoard = this.simulateMove(move);
    const furtherCaptures = this.findPossibleCapturesOnBoard(
      simBoard,
      move.toRow,
      move.toCol,
      move.piece
    );

    if (furtherCaptures.length > 0) {
      // Recursively find the maximum capture chain
      let maxAdditionalCaptures = 0;

      for (const nextMove of furtherCaptures) {
        const additionalCaptures = this.calculateCapturePotentialRecursive(
          simBoard,
          nextMove,
          1 // Already counted the first capture
        );
        maxAdditionalCaptures = Math.max(
          maxAdditionalCaptures,
          additionalCaptures
        );
      }

      totalCaptures += maxAdditionalCaptures;
    }

    return totalCaptures;
  },

  // Helper function to recursively calculate capture potential
  calculateCapturePotentialRecursive(board, move, depth) {
    // Limit depth to prevent infinite loops
    if (depth > 10) return 0;

    // Simulate this capture
    const simBoard = this.simulateMoveOnBoard(board, move);

    // Check for further captures
    const furtherCaptures = this.findPossibleCapturesOnBoard(
      simBoard,
      move.toRow,
      move.toCol,
      move.piece
    );

    if (furtherCaptures.length === 0) {
      return 1; // Just this capture
    }

    // Find the maximum chain
    let maxCaptures = 1;
    for (const nextMove of furtherCaptures) {
      const additional = this.calculateCapturePotentialRecursive(
        simBoard,
        nextMove,
        depth + 1
      );
      maxCaptures = Math.max(maxCaptures, 1 + additional);
    }

    return maxCaptures;
  },

  // Find possible captures on a simulated board
  findPossibleCapturesOnBoard(board, row, col, piece) {
    const captures = [];
    const opponentColor = "red";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const middleRow = row + dRow;
      const middleCol = col + dCol;
      const jumpRow = row + dRow * 2;
      const jumpCol = col + dCol * 2;

      if (
        jumpRow >= 0 &&
        jumpRow < BOARD_SIZE &&
        jumpCol >= 0 &&
        jumpCol < BOARD_SIZE
      ) {
        const middlePiece = board[middleRow]?.[middleCol];
        const landSquare = board[jumpRow]?.[jumpCol];

        if (middlePiece && middlePiece.color === opponentColor && !landSquare) {
          captures.push({
            fromRow: row,
            fromCol: col,
            toRow: jumpRow,
            toCol: jumpCol,
            piece: piece,
            isCapture: true,
            capturedRow: middleRow,
            capturedCol: middleCol,
          });
        }
      }
    }

    return captures;
  },

  // Simulate a move on a given board state
  simulateMoveOnBoard(board, move) {
    // Create a copy of the board
    const newBoard = board.map((row) => [...row]);

    // Apply the move
    newBoard[move.toRow][move.toCol] = newBoard[move.fromRow][move.fromCol];
    newBoard[move.fromRow][move.fromCol] = null;

    // Handle capture
    if (move.isCapture && move.capturedRow !== undefined) {
      newBoard[move.capturedRow][move.capturedCol] = null;
    }

    return newBoard;
  },

  // NEW: Evaluate if this move creates holes in the defensive line
  evaluateDefensiveLineBreaks(move) {
    let penalty = 0;
    const fromRow = move.fromRow;
    const fromCol = move.fromCol;
    const toRow = move.toRow;
    const toCol = move.toCol;

    // Check if moving creates a hole that allows opponent penetration
    // A "hole" is an empty square behind our defensive line that opponents can exploit

    // First, check if we're leaving a critical defensive position
    if (this.isDefensivePosition(fromRow, fromCol)) {
      // Check if this position will become a penetration point
      if (
        this.createsOpponentPenetrationRoute(fromRow, fromCol, toRow, toCol)
      ) {
        penalty += this.weights.defensiveLinePenalty;
      }
    }

    // Check if moving creates a hole pattern (diagonal gaps opponent can exploit)
    const holesCreated = this.countDefensiveHoles(
      fromRow,
      fromCol,
      toRow,
      toCol
    );
    penalty += holesCreated * this.weights.defensiveHolePenalty;

    // Check if move allows opponent multi-capture opportunities
    if (this.enablesOpponentMultiCapture(fromRow, fromCol, toRow, toCol)) {
      penalty += this.weights.penetrationRiskPenalty;
    }

    return penalty;
  },

  // Check if a position is part of the defensive line
  isDefensivePosition(row, col) {
    // Defensive positions are typically in rows 1-3 for black (the back area)
    // and should have pieces nearby forming a line
    if (row < 1 || row > 4) return false;

    const piece = this.getPieceAt(row, col);
    if (!piece || piece.dataset.color !== "black") return false;

    // Check if there are friendly pieces nearby forming a defensive structure
    let nearbyDefenders = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [0, -2],
      [0, 2],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = toRow + dRow;
      const checkCol = toCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          nearbyFriendlyAtDestination++;
        }
      }
    }
    return nearbyDefenders >= 1;
  },

  // Check if moving creates a route for opponent to penetrate
  createsOpponentPenetrationRoute(fromRow, fromCol, toRow, toCol) {
    // After moving, check if opponent can now reach deeper into our territory

    // Simulate: what if an opponent piece lands at our old position?
    // Can they continue capturing from there?
    const directions = [
      [1, -1],
      [1, 1], // Black's backward direction (opponent moving forward)
    ];

    for (const [dRow, dCol] of directions) {
      const behindRow = fromRow + dRow;
      const behindCol = fromCol + dCol;

      if (
        behindRow >= 0 &&
        behindRow < BOARD_SIZE &&
        behindCol >= 0 &&
        behindCol < BOARD_SIZE
      ) {
        const behindPiece = this.getPieceAt(behindRow, behindCol);

        // If there's a friendly piece behind and nothing to block opponent
        if (behindPiece && behindPiece.dataset.color === "black") {
          // Check if opponent could capture it from fromRow
          const landRow = behindRow + dRow;
          const landCol = behindCol + dCol;

          if (
            landRow >= 0 &&
            landRow < BOARD_SIZE &&
            landCol >= 0 &&
            landCol < BOARD_SIZE
          ) {
            const landSquare = this.getPieceAt(landRow, landCol);
            // If landing square is empty or is where we're moving to, this creates exposure
            if (!landSquare || (landRow === toRow && landCol === toCol)) {
              // Additional check: is there an opponent piece that could exploit this?
              if (this.hasOpponentInRange(fromRow, fromCol)) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  },

  // Count defensive holes created by this move
  countDefensiveHoles(fromRow, fromCol, toRow, toCol) {
    let holes = 0;

    // Check the squares diagonal to our current position
    // If we have pieces on both sides and we move, we create a hole
    const diagonalPairs = [
      [
        [-1, -1],
        [-1, 1],
      ], // Upper diagonals
      [
        [1, -1],
        [1, 1],
      ], // Lower diagonals
    ];

    for (const [dir1, dir2] of diagonalPairs) {
      const pos1Row = fromRow + dir1[0];
      const pos1Col = fromCol + dir1[1];
      const pos2Row = fromRow + dir2[0];
      const pos2Col = fromCol + dir2[1];

      if (
        pos1Row >= 0 &&
        pos1Row < BOARD_SIZE &&
        pos1Col >= 0 &&
        pos1Col < BOARD_SIZE &&
        pos2Row >= 0 &&
        pos2Row < BOARD_SIZE &&
        pos2Col >= 0 &&
        pos2Col < BOARD_SIZE
      ) {
        const piece1 = this.getPieceAt(pos1Row, pos1Col);
        const piece2 = this.getPieceAt(pos2Row, pos2Col);

        // If we have friendly pieces on both diagonals, leaving creates a hole
        if (
          piece1 &&
          piece1.dataset.color === "black" &&
          piece2 &&
          piece2.dataset.color === "black"
        ) {
          // Unless we're moving to fill another critical gap
          if (!(toRow === pos1Row || toRow === pos2Row)) {
            holes++;
          }
        }
      }
    }

    return holes;
  },

  // Comprehensive defensive evaluation
  evaluateDefensive(move) {
    try {
      let defensiveScore = 0;
      const { fromRow, fromCol, toRow, toCol } = move;

      // 1. Evaluate piece safety after move
      defensiveScore += this.evaluatePieceSafety(move);

      // 2. Evaluate formation integrity
      defensiveScore += this.evaluateFormationIntegrity(move);

      // 3. Evaluate defensive line strength
      defensiveScore += this.evaluateDefensiveLines(move);

      // 4. Evaluate piece support structure
      defensiveScore += this.evaluatePieceSupport(move);

      // 5. Evaluate back rank defense
      defensiveScore += this.evaluateBackRankDefense(move);

      return defensiveScore;
    } catch (error) {
      return 0; // Return neutral score on error
    }
  },

  // Evaluate piece safety at destination
  evaluatePieceSafety(move) {
    let safetyScore = 0;
    const { toRow, toCol, piece } = move;

    // Edge squares are safer
    if (
      toRow === 0 ||
      toRow === BOARD_SIZE - 1 ||
      toCol === 0 ||
      toCol === BOARD_SIZE - 1
    ) {
      safetyScore += this.weights.edgeSafety || 100;
    }

    // Corner squares are extremely safe
    if (
      (toRow === 0 || toRow === BOARD_SIZE - 1) &&
      (toCol === 0 || toCol === BOARD_SIZE - 1)
    ) {
      safetyScore += (this.weights.sideOccupation || 250) * 2;
    }

    // Count threatening opponent pieces - simplified check
    const threatCount = this.countThreatsSimplified(toRow, toCol, "black");
    safetyScore -= threatCount * 50;

    // Count protecting pieces
    const protectors = this.countProtectors(toRow, toCol);
    safetyScore += protectors * 30;

    return safetyScore;
  },

  // ═══════════════════════════════════════════════════════════════════
  // FORMATION STATE CACHING (reduces board scans by 97.5%)
  // ═══════════════════════════════════════════════════════════════════

  getCurrentBoardHash() {
    let hash = "";
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = this.getPieceAt(r, c);
        if (piece) {
          hash +=
            piece.dataset.color[0] +
            (piece.dataset.king === "true" ? "K" : "P");
        } else {
          hash += ".";
        }
      }
    }
    return hash;
  },

  precomputeFormationState() {
    const currentBoardHash = this.getCurrentBoardHash();
    if (
      cachedFormationState &&
      cachedFormationState.boardHash === currentBoardHash
    ) {
      return cachedFormationState;
    }

    const state = {
      boardHash: currentBoardHash,
      supportMap: new Map(),
      gapMap: new Map(),
      isolatedPieces: [],
      defensiveWalls: [],
      backRankStrength: 0,
      formationScore: 0,
      timestamp: Date.now(),
    };

    // Single pass through board
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = this.getPieceAt(r, c);
        if (!piece || piece.dataset.color !== "black") continue;

        const support = this.countAdjacentAllies(r, c);
        const gaps = this.countNearbyGaps(r, c);

        state.supportMap.set(`${r},${c}`, support);
        state.gapMap.set(`${r},${c}`, gaps);

        if (support === 0) {
          state.isolatedPieces.push({ row: r, col: c });
        }

        if (r <= 1) {
          state.backRankStrength += support * 10;
        }
      }
    }

    cachedFormationState = state;
    return state;
  },

  countNearbyGaps(row, col) {
    let gaps = 0;
    for (const [dRow, dCol] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const r = row + dRow;
      const c = col + dCol;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (!this.getPieceAt(r, c)) gaps++;
      }
    }
    return gaps;
  },

  wouldIsolatePiece(move) {
    const { fromRow, fromCol } = move;
    const cached = this.precomputeFormationState();

    for (const [r, c] of [
      [fromRow - 1, fromCol - 1],
      [fromRow - 1, fromCol + 1],
      [fromRow + 1, fromCol - 1],
      [fromRow + 1, fromCol + 1],
    ]) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const support = cached.supportMap.get(`${r},${c}`) || 0;
        if (support === 1) return true;
      }
    }
    return false;
  },

  createsOpponentChain(move) {
    const { toRow, toCol, fromRow, fromCol } = move;

    for (const [dRow, dCol] of [
      [1, -1],
      [1, 1],
    ]) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (checkRow < 0 || checkRow >= BOARD_SIZE) continue;
      if (checkCol < 0 || checkCol >= BOARD_SIZE) continue;

      const piece = this.getPieceAt(checkRow, checkCol);
      if (piece && piece.dataset.color === "black") {
        const jumpRow = checkRow + dRow;
        const jumpCol = checkCol + dCol;

        if (
          jumpRow >= 0 &&
          jumpRow < BOARD_SIZE &&
          jumpCol >= 0 &&
          jumpCol < BOARD_SIZE
        ) {
          const landing = this.getPieceAt(jumpRow, jumpCol);

          if (!landing || (jumpRow === fromRow && jumpCol === fromCol)) {
            const opponentRow = checkRow + dRow;
            const opponentCol = checkCol + dCol;
            const opponentPiece = this.getPieceAt(opponentRow, opponentCol);

            if (opponentPiece && opponentPiece.dataset.color === "red") {
              return true;
            }
          }
        }
      }
    }

    return false;
  },

  // Evaluate formation integrity
  evaluateFormationIntegrity(move) {
    let formationScore = 0;
    const { fromRow, fromCol, toRow, toCol } = move;

    // Check for gaps created in defensive formation
    const gapsCreated = this.countDefensiveGaps(fromRow, fromCol);
    formationScore -=
      gapsCreated * this.weights.formationGap || gapsCreated * 40;

    // Check for formation strengthening
    const formationStrength = this.countAdjacentAllies(toRow, toCol);
    formationScore += formationStrength * this.weights.support;

    // Penalize creating holes in defensive wall
    if (this.createsDefensiveHole(move)) {
      formationScore -= 80;
    }

    return formationScore;
  },

  // Evaluate defensive line strength
  evaluateDefensiveLines(move) {
    let lineScore = 0;
    const { fromRow, fromCol, toRow, toCol } = move;

    // Reward maintaining/creating diagonal control
    lineScore += this.evaluateDiagonalControl(toRow, toCol);

    // Penalize breaking defensive chains
    if (this.breaksDefensiveChain(fromRow, fromCol)) {
      lineScore -= 60;
    }

    // Reward creating defensive barriers
    if (this.createsDefensiveBarrier(toRow, toCol)) {
      lineScore += 50;
    }

    return lineScore;
  },

  // Evaluate piece support structure
  evaluatePieceSupport(move) {
    let supportScore = 0;
    const { toRow, toCol } = move;

    // Count supporting pieces
    const supporters = this.countSupportingPieces(toRow, toCol);
    supportScore += supporters * this.weights.support;

    // Evaluate mutual protection
    const mutualProtection = this.evaluateMutualProtection(toRow, toCol);
    supportScore += mutualProtection * 25;

    return supportScore;
  },

  // Evaluate back rank defense
  evaluateBackRankDefense(move) {
    let backRankScore = 0;
    const { fromRow, toRow } = move;

    // Penalize leaving back rank (rows 0-2 for black)
    if (fromRow <= 2 && toRow > 2) {
      backRankScore -= this.weights.backRankLeaving || 40;
    }

    // Reward strengthening back rank
    if (toRow <= 2) {
      backRankScore += this.weights.backRankDefense || 30;
    }

    return backRankScore;
  },

  // Count defensive gaps created
  countDefensiveGaps(fromRow, fromCol) {
    let gaps = 0;

    // Check adjacent diagonals for unsupported pieces
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          // Check if this piece will be unsupported after we move
          const supportCount =
            this.countSupportingPieces(checkRow, checkCol) - 1; // -1 because we're moving
          if (supportCount === 0) {
            gaps++;
          }
        }
      }
    }

    return gaps;
  },

  // Check if move creates defensive hole
  createsDefensiveHole(move) {
    const { fromRow, fromCol } = move;

    // Check if removing this piece creates a hole in defensive formation
    let adjacentAllies = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          adjacentAllies++;
        }
      }
    }

    // If we had many adjacent allies, moving creates a hole
    return adjacentAllies >= 2;
  },

  // Check if move breaks defensive chain
  breaksDefensiveChain(fromRow, fromCol) {
    // A chain is broken if moving disconnects two defensive pieces
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    let chainPieces = [];

    for (const [dRow, dCol] of directions) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          chainPieces.push([checkRow, checkCol]);
        }
      }
    }

    // If we have 2+ chain pieces, check if they'll be disconnected
    if (chainPieces.length >= 2) {
      // Check if any two chain pieces will lose connection
      for (let i = 0; i < chainPieces.length; i++) {
        for (let j = i + 1; j < chainPieces.length; j++) {
          if (
            this.areConnectedThrough(chainPieces[i], chainPieces[j], [
              fromRow,
              fromCol,
            ])
          ) {
            return true;
          }
        }
      }
    }

    return false;
  },

  // Check if two pieces are connected through a specific position
  areConnectedThrough(pos1, pos2, throughPos) {
    const [row1, col1] = pos1;
    const [row2, col2] = pos2;
    const [throughRow, throughCol] = throughPos;

    // Check if throughPos is on the path between pos1 and pos2
    const deltaRow1 = Math.abs(row1 - throughRow);
    const deltaCol1 = Math.abs(col1 - throughCol);
    const deltaRow2 = Math.abs(row2 - throughRow);
    const deltaCol2 = Math.abs(col2 - throughCol);

    // For diagonal connections on checkerboard
    return (
      deltaRow1 === 1 && deltaCol1 === 1 && deltaRow2 === 1 && deltaCol2 === 1
    );
  },

  // Check if move creates defensive barrier
  createsDefensiveBarrier(toRow, toCol) {
    // A barrier is created when we form a defensive line with other pieces
    let barrierStrength = 0;

    // Check horizontal and diagonal lines
    const directions = [
      [-1, -1],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      let lineLength = 1; // Include ourselves

      // Check in one direction
      let checkRow = toRow + dRow;
      let checkCol = toCol + dCol;
      while (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          lineLength++;
          checkRow += dRow;
          checkCol += dCol;
        } else {
          break;
        }
      }

      // Check in opposite direction
      checkRow = toRow - dRow;
      checkCol = toCol - dCol;
      while (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          lineLength++;
          checkRow -= dRow;
          checkCol -= dCol;
        } else {
          break;
        }
      }

      if (lineLength >= 3) {
        barrierStrength += lineLength * 10;
      }
    }

    return barrierStrength > 0;
  },

  // Count supporting pieces around a position
  countSupportingPieces(row, col) {
    let supporters = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = row + dRow;
      const checkCol = col + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          supporters++;
        }
      }
    }

    return supporters;
  },

  // Count adjacent allied pieces (same as countSupportingPieces)
  countAdjacentAllies(row, col) {
    return this.countSupportingPieces(row, col);
  },

  // Evaluate mutual protection between pieces
  evaluateMutualProtection(row, col) {
    let protection = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = row + dRow;
      const checkCol = col + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          // Check if this piece can also protect others
          const theirProtections = this.countSupportingPieces(
            checkRow,
            checkCol
          );
          protection += Math.min(theirProtections, 2); // Cap the bonus
        }
      }
    }

    return protection;
  },

  // Count protectors around a position (helper for defensive evaluation)
  countProtectors(row, col) {
    let protectors = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = row + dRow;
      const checkCol = col + dCol;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          protectors++;
        }
      }
    }

    return protectors;
  },

  // Simplified threat counter for defensive evaluation
  countThreatsSimplified(row, col, color) {
    let threatCount = 0;
    const opponentColor = color === "black" ? "red" : "black";

    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // Find space behind us for a jump
      const landingRow = row + dRow;
      const landingCol = col + dCol;

      if (
        landingRow >= 0 &&
        landingRow < BOARD_SIZE &&
        landingCol >= 0 &&
        landingCol < BOARD_SIZE
      ) {
        const landingPiece = this.getPieceAt(landingRow, landingCol);
        if (!landingPiece) {
          // Now look for attackers in the opposite direction
          for (let dist = 1; dist < BOARD_SIZE; dist++) {
            const attackRow = row - dRow * dist;
            const attackCol = col - dCol * dist;

            if (
              attackRow < 0 ||
              attackRow >= BOARD_SIZE ||
              attackCol < 0 ||
              attackCol >= BOARD_SIZE
            )
              break;

            const attacker = this.getPieceAt(attackRow, attackCol);
            if (attacker) {
              if (attacker.dataset.color === opponentColor) {
                const isKing = attacker.dataset.king === "true";
                if (isKing || dist === 1) {
                  threatCount++;
                }
              }
              break; // Blocked by any piece
            }
          }
        }
      }
    }

    return threatCount;
  },

  // Evaluate diagonal control from a position
  evaluateDiagonalControl(row, col) {
    let controlScore = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      let diagonalLength = 0;
      let checkRow = row + dRow;
      let checkCol = col + dCol;

      // Count how far we can see along this diagonal
      while (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);

        if (piece) {
          if (piece.dataset.color === "black") {
            // Friendly piece - adds to control
            diagonalLength++;
            controlScore += 10;
          } else {
            // Enemy piece - blocks diagonal
            break;
          }
        } else {
          // Empty square - extends control
          diagonalLength++;
          controlScore += 5;
        }

        checkRow += dRow;
        checkCol += dCol;

        // Don't look too far ahead
        if (diagonalLength >= 3) break;
      }
    }

    return controlScore;
  },

  // Check if this move enables opponent to make multi-captures
  enablesOpponentMultiCapture(fromRow, fromCol, toRow, toCol) {
    // Look for patterns where moving creates a sequence for opponent

    // Check if removing our piece from fromRow, fromCol creates a capture chain
    const testDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of testDirections) {
      let captureChain = 0;
      let currentRow = fromRow + dRow;
      let currentCol = fromCol + dCol;

      // Look ahead for potential capture chains
      for (let i = 0; i < 3; i++) {
        // Check up to 3 pieces deep
        if (
          currentRow < 0 ||
          currentRow >= BOARD_SIZE ||
          currentCol < 0 ||
          currentCol >= BOARD_SIZE
        )
          break;

        const piece = this.getPieceAt(currentRow, currentCol);
        if (piece && piece.dataset.color === "black") {
          // Check if opponent could land after capturing this
          const landRow = currentRow + dRow;
          const landCol = currentCol + dCol;

          if (
            landRow >= 0 &&
            landRow < BOARD_SIZE &&
            landCol >= 0 &&
            landCol < BOARD_SIZE
          ) {
            const landSquare = this.getPieceAt(landRow, landCol);
            if (!landSquare || (landRow === toRow && landCol === toCol)) {
              captureChain++;
              currentRow = landRow + dRow;
              currentCol = landCol + dCol;
              continue;
            }
          }
        }
        break;
      }

      // If we found a chain of 2+ captures, this is dangerous
      if (captureChain >= 2) {
        return true;
      }
    }

    return false;
  },

  // Check if there's an opponent piece in range to exploit a gap
  hasOpponentInRange(row, col) {
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const checkRow = row + dRow * dist;
        const checkCol = col + dCol * dist;

        if (
          checkRow < 0 ||
          checkRow >= BOARD_SIZE ||
          checkCol < 0 ||
          checkCol >= BOARD_SIZE
        )
          break;

        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece) {
          if (piece.dataset.color === "red") {
            const isKing = piece.dataset.king === "true";
            // Check if this piece could capture our piece if we move to (row, col)
            // Or if it's just 'nearby' in a generic sense
            if (isKing || dist <= 2) {
              return true;
            }
          }
          break; // Blocked by any piece
        }
      }
    }
    return false;
  },

  /**
   * Evaluate if this move fills a gap left by an advanced friendly piece.
   * Promotes formation integrity by encouraging backfilling.
   *
   * @param {Object} move - The move object
   * @returns {number} The gap-filling bonus
   */
  evaluateGapFilling(move) {
    let fillScore = 0;
    const { toRow, toCol, fromRow } = move;

    // We only care about forward advancement for gap filling
    if (toRow <= fromRow) return 0;

    // Check for friendly pieces ahead of the destination
    const searchOffsets = [
      [1, -1],
      [1, 0],
      [1, 1],
      [2, -1],
      [2, 0],
      [2, 1],
    ];

    let alliesAheadCount = 0;
    for (const [rowOffset, colOffset] of searchOffsets) {
      const checkRow = toRow + rowOffset;
      const checkCol = toCol + colOffset;

      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const pieceAtPos = this.getPieceAt(checkRow, checkCol);
        if (pieceAtPos && pieceAtPos.dataset.color === "black") {
          alliesAheadCount++;
        }
      }
    }

    // If there are allies ahead, this move likely fills a gap or provides support
    if (alliesAheadCount > 0) {
      fillScore += this.weights.fillGapBonus;

      // Extra bonus for maintaining a tight, supporting formation
      if (alliesAheadCount >= 2) {
        fillScore += this.weights.compactFormationBonus;
      }
    }

    return fillScore;
  },

  /**
   * Reward following advanced friendly pieces to maintain group cohesion.
   *
   * @param {Object} move - The move object
   * @returns {number} The follow-leader bonus
   */
  evaluateFollowLeader(move) {
    let followScore = 0;
    const { toRow, fromRow } = move;

    // Only reward forward advancement
    if (toRow <= fromRow) return 0;

    // Find the current "phalanx leader" (most advanced friendly pawn)
    let leadRow = -1;
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (
          piece &&
          piece.dataset.color === "black" &&
          piece.dataset.king !== "true"
        ) {
          if (row > leadRow) {
            leadRow = row;
          }
        }
      }
    }

    if (leadRow > 0) {
      const currentDist = Math.abs(fromRow - leadRow);
      const newDist = Math.abs(toRow - leadRow);

      // Reward reducing distance to the group leader
      if (newDist < currentDist) {
        followScore += this.weights.followLeaderBonus;
      }

      // Extra bonus if we align with or stay within one row of the leader
      if (Math.abs(toRow - leadRow) <= 1) {
        followScore += this.weights.advancementBonus;
      }
    }

    return followScore;
  },

  /**
   * Reward maintaining a compact formation while advancing.
   * Pieces in a 3-row band provide maximum defensive solidity.
   *
   * @param {Object} move - The move object
   * @returns {number} The compactness score
   */
  evaluateCompactAdvancement(move) {
    let compactScore = 0;
    const targetRow = move.toRow;

    // Count allies in the target row and adjacent rows to evaluate local density
    let alliesInFormationCount = 0;
    for (let col = 0; col < BOARD_SIZE; col++) {
      // Current target row
      const sameRowPiece = this.getPieceAt(targetRow, col);
      if (sameRowPiece && sameRowPiece.dataset.color === "black") {
        alliesInFormationCount++;
      }

      // Row behind
      if (targetRow - 1 >= 0) {
        const behindPiece = this.getPieceAt(targetRow - 1, col);
        if (behindPiece && behindPiece.dataset.color === "black") {
          alliesInFormationCount++;
        }
      }

      // Row ahead
      if (targetRow + 1 < BOARD_SIZE) {
        const aheadPiece = this.getPieceAt(targetRow + 1, col);
        if (aheadPiece && aheadPiece.dataset.color === "black") {
          alliesInFormationCount++;
        }
      }
    }

    // Large bonus for belonging to a dense 'phalanx' (6+ pieces in a 3-row band)
    if (alliesInFormationCount >= 6) {
      compactScore += this.weights.compactFormationBonus;
    } else if (alliesInFormationCount >= 4) {
      compactScore += this.weights.compactFormationBonus * 0.5;
    }

    return compactScore;
  },

  /**
   * Evaluate control of the central squares.
   * Central squares are (4,4), (4,5), (5,4), and (5,5) on a 10x10 board.
   *
   * @param {Object} move - The move object
   * @returns {number} The center control score
   */
  evaluateCenterControl(move) {
    const centerSquares = [
      [4, 4],
      [4, 5],
      [5, 4],
      [5, 5],
    ];
    let centerScore = 0;
    const { toRow: targetRow, toCol: targetCol } = move;

    for (const [centerRow, centerCol] of centerSquares) {
      const manhattanDistance =
        Math.abs(targetRow - centerRow) + Math.abs(targetCol - centerCol);

      if (manhattanDistance === 0) {
        centerScore += this.weights.centerControlDirect;
      } else if (manhattanDistance === 1) {
        centerScore += this.weights.centerControlNear;
      } else if (manhattanDistance === 2) {
        centerScore += this.weights.centerControlInfluence;
      }
    }

    return centerScore;
  },

  /**
   * Evaluate the activity and mobility of a king.
   * Kings should be mobile and placed where they can threaten the opponent.
   *
   * @param {Object} move - The move object
   * @returns {number} The king activity score
   */
  evaluateKingActivity(move) {
    if (move.piece.dataset.king !== "true") return 0;

    let activityScore = 0;
    const { toRow: targetRow, toCol: targetCol } = move;

    // Kings should be mobile: encourage moves to squares with high mobility
    const mobilityCount = this.countKingMoves(targetRow, targetCol);
    activityScore += mobilityCount * this.weights.kingActivity;

    // Kings should participate: reward placement that threatens opponent pieces
    const opponentThreatCount = this.countOpponentThreatsFromPosition(
      targetRow,
      targetCol
    );
    activityScore += opponentThreatCount * this.weights.kingThreatBonus;

    return activityScore;
  },

  /**
   * Evaluate occupation of key strategic squares (corners and important diagonals).
   *
   * @param {Object} move - The move object
   * @returns {number} The key square control score
   */
  evaluateKeySquareControl(move) {
    const keySquares = [
      [1, 1],
      [1, BOARD_SIZE - 2],
      [BOARD_SIZE - 2, 1],
      [BOARD_SIZE - 2, BOARD_SIZE - 2],
      [2, 2],
      [2, BOARD_SIZE - 3],
      [BOARD_SIZE - 3, 2],
      [BOARD_SIZE - 3, BOARD_SIZE - 3],
    ];

    const { toRow: targetRow, toCol: targetCol } = move;
    for (const [keyRow, keyCol] of keySquares) {
      if (targetRow === keyRow && targetCol === keyCol) {
        return this.weights.keySquareControl;
      }
    }

    return 0;
  },

  /**
   * Evaluate the 'tempo' or initiative gain of a move.
   * Captures and forward advancement contribute to tempo.
   *
   * @param {Object} move - The move object
   * @returns {number} The tempo score
   */
  evaluateTempo(move) {
    let tempoScore = 0;

    // Captures grant massive initiative (tempo)
    if (move.isCapture) {
      tempoScore += this.weights.tempoCaptureBonus;
    }

    // Forward advancement of regular pieces maintains pressure
    if (move.piece.dataset.king !== "true") {
      const advancementMagnitude =
        move.piece.dataset.color === "black"
          ? move.toRow - move.fromRow
          : move.fromRow - move.toRow;

      if (advancementMagnitude > 0) {
        tempoScore += advancementMagnitude * this.weights.tempo;
      }
    }

    return tempoScore;
  },

  /**
   * Evaluate the strategic value of occupying side squares.
   * Side squares are safer as they have fewer attack vectors from opponents.
   *
   * @param {Object} move - The move object
   * @returns {number} The side occupation score
   */
  evaluateSideOccupation(move) {
    let sideScore = 0;
    const { toRow: targetRow, toCol: targetCol } = move;

    // Generate valid dark squares on the board perimeter
    const sideSquares = [];
    const size = BOARD_SIZE || 10;

    for (let c = 0; c < size; c++) {
      if ((0 + c) % 2 !== 0) sideSquares.push([0, c]); // Top edge
      if ((size - 1 + c) % 2 !== 0) sideSquares.push([size - 1, c]); // Bottom edge
    }
    for (let r = 1; r < size - 1; r++) {
      if ((r + 0) % 2 !== 0) sideSquares.push([r, 0]); // Left edge
      if ((r + (size - 1)) % 2 !== 0) sideSquares.push([r, size - 1]); // Right edge
    }

    const isLandingOnSide = sideSquares.some(
      ([r, c]) => r === targetRow && c === targetCol
    );
    if (isLandingOnSide) {
      sideScore += this.weights.sideOccupation;
    }

    // Bonus for moving towards unoccupied side squares
    const availableSides = sideSquares.filter(
      ([r, c]) => !this.getPieceAt(r, c)
    );

    if (availableSides.length > 0 && !isLandingOnSide) {
      let minDistanceToSide = Infinity;
      for (const [sideRow, sideCol] of availableSides) {
        const manhattanDist =
          Math.abs(targetRow - sideRow) + Math.abs(targetCol - sideCol);
        if (manhattanDist < minDistanceToSide) {
          minDistanceToSide = manhattanDist;
        }
      }

      // Proximity bonus: higher reward for being closer to a side square
      if (minDistanceToSide <= 2) {
        const proximityWeight = (3 - minDistanceToSide) / 3;
        sideScore += this.weights.sideProximity * proximityWeight;
      }

      // Systemic bonus for the general availability of safe side options
      sideScore += this.weights.sideAvailable / availableSides.length;
    }

    return sideScore;
  },

  // HELPER FUNCTIONS - Missing implementations

  /**
   * Helper: Check if a piece at (row, col) is under capture threat.
   *
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {boolean} True if the piece is threatened
   */
  isPieceUnderThreat(row, col) {
    const piece = this.getPieceAt(row, col);
    return piece ? this.willBeUnderThreat(row, col, piece) : false;
  },

  /**
   * Calculate the number of legal non-capture moves available to a king from a position.
   *
   * @param {number} row - King row
   * @param {number} col - King column
   * @returns {number} The number of available moves
   */
  countKingMoves(row, col) {
    let moveCount = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of directions) {
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const nextRow = row + deltaRow * dist;
        const nextCol = col + deltaCol * dist;
        if (
          nextRow < 0 ||
          nextRow >= BOARD_SIZE ||
          nextCol < 0 ||
          nextCol >= BOARD_SIZE
        )
          break;

        if (this.getPieceAt(nextRow, nextCol)) break; // Blocked
        moveCount++;
      }
    }
    return moveCount;
  },

  /**
   * Count how many immediate capture threats an opponent has from a specific position.
   *
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {number} The count of potential opponent captures
   */
  countOpponentThreatsFromPosition(row, col) {
    let threatsCount = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of directions) {
      const landingRow = row + deltaRow * 2;
      const landingCol = col + deltaCol * 2;

      if (
        landingRow >= 0 &&
        landingRow < BOARD_SIZE &&
        landingCol >= 0 &&
        landingCol < BOARD_SIZE
      ) {
        const targetRow = row + deltaRow;
        const targetCol = col + deltaCol;
        const middlePiece = this.getPieceAt(targetRow, targetCol);
        const landingPiece = this.getPieceAt(landingRow, landingCol);

        // Treat 'red' as the opponent for threat evaluation
        if (
          middlePiece &&
          middlePiece.dataset.color === "red" &&
          !landingPiece
        ) {
          threatsCount++;
        }
      }
    }
    return threatsCount;
  },

  /**
   * Calculate potential opponent capture opportunities after our move.
   * Redirects to the enhanced `calculateOpponentCaptureOpportunities`.
   *
   * @param {Object} move - The move object
   * @returns {number} The count of opponent captures
   */
  countOpponentThreatsAfterMove(move) {
    return this.calculateOpponentCaptureOpportunities(move);
  },

  /**
   * Enhanced attack mode evaluation system.
   * Aggregates sacrificial analysis, exchange value, and tactical pressure.
   *
   * @param {Object} move - The move object
   * @returns {number} The total attack mode score
   */
  evaluateAttackMode(move) {
    let totalAttackScore = 0;

    // 1. Evaluate if this is a sacrificial attack and check its profitability
    const sacrificeResult = this.evaluateSacrificalAttack(move);
    totalAttackScore += sacrificeResult.score;

    // 2. Evaluate piece exchange value (trading pieces)
    totalAttackScore += this.evaluateExchange(move);

    // 3. Evaluate prevention of opponent capture chains
    totalAttackScore += this.evaluateOpponentCaptureChainPrevention(move);

    // 4. Evaluate creation of tactical pressure on the opponent
    totalAttackScore += this.evaluateTacticalPressure(move);

    return totalAttackScore;
  },

  /**
   * Evaluate sacrificial attacks where we intentionally lose a piece for gain.
   * Follows strict rules to ensure sacrifices translate to a net material or strategic win.
   *
   * @param {Object} move - The move object
   * @returns {Object} An object containing the score and sacrifice metadata
   */
  evaluateSacrificalAttack(move) {
    const analysis = {
      score: 0,
      isSacrifice: false,
      reasoning: "",
    };

    if (!move.isCapture) return analysis;

    // Determine if the destination square is under immediate threat after landing
    const isLosingPiece = this.willBeUnderThreat(
      move.toRow,
      move.toCol,
      move.piece
    );

    if (isLosingPiece) {
      analysis.isSacrifice = true;

      const captureGainCount = this.getTotalCaptureCount(move);
      const pieceValueLoss = move.piece.dataset.king === "true" ? 3 : 1;
      const followUpGainCount = this.calculateSacrificeFollowUp(move);

      // Profitability: we must gain more pieces than we lose
      const netMaterialGain =
        captureGainCount + followUpGainCount - pieceValueLoss;

      if (netMaterialGain > 0) {
        // Profitable sacrifice: Reward the gain
        analysis.score = netMaterialGain * 200;
        analysis.reasoning = `Profitable sacrifice: Gain ${
          captureGainCount + followUpGainCount
        }, Lose ${pieceValueLoss}`;
      } else if (netMaterialGain === 0) {
        // Equal exchange: Only reward if there's a strong positional justification
        const positionalValue = this.evaluatePositionalBenefitOfSacrifice(move);
        if (positionalValue > 100) {
          analysis.score = positionalValue * 0.5;
          analysis.reasoning = `Neutral exchange justified by positional benefit`;
        } else {
          analysis.score = -1000;
          analysis.reasoning = `Neutral exchange rejected (insufficient positional gain)`;
        }
      } else {
        // Unprofitable sacrifice: Apply heavy penalty
        analysis.score = -2000;
        analysis.reasoning = `Bad sacrifice blocked: Lose ${pieceValueLoss}, Gain ${
          captureGainCount + followUpGainCount
        }`;
      }
    }

    return analysis;
  },

  /**
   * Calculate potential follow-up capture opportunities after a sacrifice.
   *
   * @param {Object} move - The move object
   * @returns {number} The count of potential follow-up captures
   */
  calculateSacrificeFollowUp(move) {
    let followUpCount = 0;

    // Simulate the board state after the complete attack sequence
    const simulatedBoard = this.simulateCompleteAttack(move);

    // Scan the board for new capture opportunities for other friendly pieces
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);

        // Count opportunities for pieces that are NOT the one we just moved
        if (
          piece &&
          piece.color === "black" &&
          !(row === move.toRow && col === move.toCol)
        ) {
          const opportunities = this.findCaptureOpportunitiesOnBoard(
            simulatedBoard,
            row,
            col,
            piece
          );
          followUpCount += opportunities.length;
        }
      }
    }

    return followUpCount;
  },

  /**
   * Evaluate the strategic and positional benefits of a sacrifice move.
   * Benefits include promotion paths, king activation, and formation damage.
   *
   * @param {Object} move - The move object
   * @returns {number} The positional benefit score
   */
  evaluatePositionalBenefitOfSacrifice(move) {
    let totalBenefitScore = 0;

    // 1. Reward moves that open a concrete path to promotion
    if (this.enablesPromotion(move)) {
      totalBenefitScore += 150;
    }

    // 2. Reward moves that improve the mobility or positioning of our kings
    totalBenefitScore += this.calculateKingActivationBenefit(move);

    // 3. Reward moves that break or weaken the opponent's defensive formation
    totalBenefitScore += this.calculateOpponentFormationDamage(move);

    return totalBenefitScore;
  },

  /**
   * Evaluate a piece exchange (trading pieces).
   *
   * @param {Object} move - The move object
   * @returns {number} The net exchange score
   */
  evaluateExchange(move) {
    if (!move.isCapture) return 0;

    let exchangeScore = 0;
    const capturedValue = this.calculatePieceValue(move);

    // Check if our piece will be recaptured immediately after our turn
    const isRecapturable = this.willBeUnderThreat(
      move.toRow,
      move.toCol,
      move.piece
    );

    if (isRecapturable) {
      const ourValue = move.piece.dataset.king === "true" ? 300 : 100;
      const netValue = capturedValue - ourValue;

      if (netValue > 0) {
        exchangeScore += netValue; // Profitable trade
      } else if (netValue < 0) {
        exchangeScore += netValue * 2; // Penalize bad trades heavily
      }
    } else {
      // Free capture (net gain)
      exchangeScore += capturedValue;
    }

    return exchangeScore;
  },

  /**
   * Evaluate and penalize moves that enable opponent multi-capture chains.
   * Also rewards neutralizing existing opponent threats.
   *
   * @param {Object} move - The move object
   * @returns {number} The prevention score
   */
  evaluateOpponentCaptureChainPrevention(move) {
    let preventionScore = 0;

    // Detect the longest capture chain enabled for the opponent after this move
    const maxOpponentChainLength =
      this.calculateOpponentCaptureChainAfterMove(move);

    if (maxOpponentChainLength > 1) {
      // Severe penalty for allowing multi-captures (chain length 2+)
      preventionScore -= maxOpponentChainLength * 400;
    } else if (maxOpponentChainLength === 1) {
      // Moderate penalty for allowing even a single capture
      preventionScore -= 150;
    }

    // Reward moves that neutralize existing threats against us
    const neutralizedThreatsCount = this.calculateThreatsNeutralized(move);
    if (neutralizedThreatsCount > 0) {
      preventionScore += neutralizedThreatsCount * 120;
    }

    return preventionScore;
  },

  /**
   * Calculate the maximum capture chain length available to the opponent after our move.
   *
   * @param {Object} move - The move object
   * @returns {number} The maximum opponent chain length
   */
  calculateOpponentCaptureChainAfterMove(move) {
    const simulatedBoard = this.simulateMove(move);
    let globalMaxChainLength = 0;

    // Evaluate capture sequences for every opponent piece on the simulated board
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const pieceAtPos = this.getPieceAtOnBoard(simulatedBoard, row, col);

        // Opponent is 'red'
        if (pieceAtPos && pieceAtPos.color === "red") {
          const pieceMaxChain = this.calculateMaxCaptureChain(
            simulatedBoard,
            row,
            col,
            pieceAtPos,
            []
          );
          globalMaxChainLength = Math.max(globalMaxChainLength, pieceMaxChain);
        }
      }
    }

    return globalMaxChainLength;
  },

  /**
   * Recursively calculate the maximum possible capture chain length from a position.
   * Strictly enforces the "no 180-degree backtracking" rule.
   *
   * @param {Array} board - 10x10 board array
   * @param {number} rowIdx - Starting row
   * @param {number} colIdx - Starting column
   * @param {Object} pieceObj - The piece performing captures
   * @param {Array} capturedKeysList - List of "row,col" keys already captured in this chain
   * @param {Array} prevDirection - The [dR, dC] used to reach current square
   * @returns {number} Maximum chain length
   */
  calculateMaxCaptureChain(
    board,
    rowIdx,
    colIdx,
    pieceObj,
    capturedKeysList,
    prevDirection = null
  ) {
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    let maxChainLength = 0;
    const isKingPiece = pieceObj.king === true;
    const opponentColorVal = pieceObj.color === "red" ? "black" : "red";

    for (const [deltaRow, deltaCol] of tacticalDirections) {
      // RULE: No 180-degree backtracking in a single sequence
      if (
        prevDirection &&
        deltaRow === -prevDirection[0] &&
        deltaCol === -prevDirection[1]
      )
        continue;

      if (isKingPiece) {
        // Flying King logic: scan diagonal for victims
        for (let distIdx = 1; distIdx < BOARD_SIZE; distIdx++) {
          const targetRowIdx = rowIdx + deltaRow * distIdx;
          const targetColIdx = colIdx + deltaCol * distIdx;

          if (
            targetRowIdx < 0 ||
            targetRowIdx >= BOARD_SIZE ||
            targetColIdx < 0 ||
            targetColIdx >= BOARD_SIZE
          )
            break;

          const potentialVictim = this.getPieceAtOnBoard(
            board,
            targetRowIdx,
            targetColIdx
          );
          if (potentialVictim) {
            if (potentialVictim.color === opponentColorVal) {
              const victimKeyStr = `${targetRowIdx},${targetColIdx}`;
              if (!capturedKeysList.includes(victimKeyStr)) {
                // Found a victim. Check landing squares after it.
                for (
                  let landDistanceStep = 1;
                  landDistanceStep < BOARD_SIZE;
                  landDistanceStep++
                ) {
                  const landingRowIdx =
                    targetRowIdx + deltaRow * landDistanceStep;
                  const landingColIdx =
                    targetColIdx + deltaCol * landDistanceStep;

                  if (
                    landingRowIdx < 0 ||
                    landingRowIdx >= BOARD_SIZE ||
                    landingColIdx < 0 ||
                    landingColIdx >= BOARD_SIZE
                  )
                    break;
                  if (
                    this.getPieceAtOnBoard(board, landingRowIdx, landingColIdx)
                  )
                    break; // Blocked

                  // Recursively check from this landing spot, passing current direction
                  const chainVal =
                    1 +
                    this.calculateMaxCaptureChain(
                      board,
                      landingRowIdx,
                      landingColIdx,
                      pieceObj,
                      [...capturedKeysList, victimKeyStr],
                      [deltaRow, deltaCol]
                    );
                  maxChainLength = Math.max(maxChainLength, chainVal);
                }
              }
            }
            break; // Stop looking in this direction after hitting any piece
          }
        }
      } else {
        // Regular piece jump logic
        const targetRowIdx = rowIdx + deltaRow;
        const targetColIdx = colIdx + deltaCol;
        const landingRowIdx = rowIdx + deltaRow * 2;
        const landingColIdx = colIdx + deltaCol * 2;

        const isLandingInBounds =
          landingRowIdx >= 0 &&
          landingRowIdx < BOARD_SIZE &&
          landingColIdx >= 0 &&
          landingColIdx < BOARD_SIZE;

        if (isLandingInBounds) {
          const potentialVictim = this.getPieceAtOnBoard(
            board,
            targetRowIdx,
            targetColIdx
          );
          const landingSpotPiece = this.getPieceAtOnBoard(
            board,
            landingRowIdx,
            landingColIdx
          );
          const victimKeyStr = `${targetRowIdx},${targetColIdx}`;

          const isVictimOpponent =
            potentialVictim && potentialVictim.color === opponentColorVal;
          const isVictimNotAlreadyCaptured =
            !capturedKeysList.includes(victimKeyStr);
          const isLandingUnoccupied = !landingSpotPiece;

          if (
            isVictimOpponent &&
            isVictimNotAlreadyCaptured &&
            isLandingUnoccupied
          ) {
            const chainVal =
              1 +
              this.calculateMaxCaptureChain(
                board,
                landingRowIdx,
                landingColIdx,
                pieceObj,
                [...capturedKeysList, victimKeyStr],
                [deltaRow, deltaCol]
              );
            maxChainLength = Math.max(maxChainLength, chainVal);
          }
        }
      }
    }

    return maxChainLength;
  },

  /**
   * Evaluate the creation of tactical pressure on the opponent.
   * Pressure is defined by created threats, maintaining initiative, and activity gain.
   *
   * @param {Object} move - The move object
   * @returns {number} The tactical pressure score
   */
  evaluateTacticalPressure(move) {
    let pressureScore = 0;

    // 1. Reward creating new immediate capture threats
    const newThreatsCount = this.countThreatsCreatedByMove(move);
    pressureScore += newThreatsCount * 75;

    // 2. Reward maintaining the 'initiative' (e.g., performing a capture)
    if (move.isCapture) {
      pressureScore += 50;
    }

    // 3. Reward general improvement in piece activity and positioning
    const activityImprovementScore = this.calculateActivityGain(move);
    pressureScore += activityImprovementScore;

    return pressureScore;
  },

  /**
   * Calculate all actual opponent capture opportunities available after our move.
   *
   * @param {Object} move - The move object
   * @returns {number} The total count of opponent capture opportunities
   */
  calculateOpponentCaptureOpportunities(move) {
    const simulatedBoard = this.simulateMove(move);
    let totalOpponentThreatCount = 0;

    // Count every possible capture an opponent could make next turn
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const pieceAtPos = this.getPieceAtOnBoard(simulatedBoard, row, col);

        if (pieceAtPos && pieceAtPos.color === "red") {
          const captureOptions = this.findCaptureOpportunitiesOnBoard(
            simulatedBoard,
            row,
            col,
            pieceAtPos
          );
          totalOpponentThreatCount += captureOptions.length;
        }
      }
    }

    return totalOpponentThreatCount;
  },

  /**
   * Evaluate the current game phase (opening vs endgame) and adjust heuristics.
   * Endgame is defined by fewer pieces, opening by many pieces.
   *
   * @param {Object} move - The move object
   * @returns {number} The game phase adjustment score
   */
  evaluateGamePhase(move) {
    let phaseBonus = 0;
    let totalPiecesOnBoard = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.getPieceAt(r, c)) totalPiecesOnBoard++;
      }
    }

    if (totalPiecesOnBoard <= 16) {
      // Endgame: Prioritize king activity and piece advancement
      if (move.piece.dataset.king === "true") {
        phaseBonus += this.weights.endgameKingBonus;
      }
    } else if (totalPiecesOnBoard >= 32) {
      // Opening: Prioritize development and center control
      phaseBonus +=
        this.evaluateCenterControl(move) *
        this.weights.openingCenterBonusFactor;
    }

    return phaseBonus;
  },

  /**
   * Evaluate the threats posed by the opponent after this move.
   * Incorporates enhanced tactical analysis and attack mode evaluation.
   *
   * @param {Object} move - The move object
   * @returns {number} The opponent threat score
   */
  evaluateOpponentThreats(move) {
    let combinedThreatScore = 0;

    // 1. Calculate the direct material threat from opponent captures
    const opponentCaptureCount = this.countOpponentThreatsAfterMove(move);
    combinedThreatScore -=
      opponentCaptureCount * this.weights.opponentThreatPenalty;

    // 2. Evaluate the safety of the piece after the move
    combinedThreatScore += this.evaluateMoveSafety(move);

    // 3. Add the attack mode score (sacrifices, exchanges, etc.)
    combinedThreatScore += this.evaluateAttackMode(move);

    return combinedThreatScore;
  },

  // NEW: Helper functions for enhanced attack mode

  // Simulate complete attack including sacrifice and recapture
  /**
   * Simulate a complete tactical sequence including a sacrifice and the expected recapture.
   *
   * @param {Object} move - The initial move object
   * @returns {Array} The simulated board state after the sequence
   */
  simulateCompleteAttack(move) {
    const simulatedBoard = this.simulateMove(move);

    // If our piece is inevitably captured after the move, simulate that capture
    if (this.willBeUnderThreat(move.toRow, move.toCol, move.piece)) {
      const primaryAttacker = this.findMostLikelyAttacker(
        simulatedBoard,
        move.toRow,
        move.toCol
      );

      if (primaryAttacker) {
        // Execute the single-step jump on the simulated board
        simulatedBoard[primaryAttacker.row][primaryAttacker.col] = null;
        simulatedBoard[move.toRow][move.toCol] = null;
      }
    }

    return simulatedBoard;
  },

  // Find piece most likely to recapture
  /**
   * Identify the opponent piece most likely to perform a recapture at a given target.
   *
   * @param {Array} board - The board array
   * @param {number} targetRow - The target row to recapture
   * @param {number} targetCol - The target column to recapture
   * @returns {Object|null} The attacker info {row, col, piece} or null
   */
  findMostLikelyAttacker(board, targetRow, targetCol) {
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of directions) {
      // Check if there is an empty landing square behind our target
      const landingRow = targetRow + deltaRow;
      const landingCol = targetCol + deltaCol;

      if (
        landingRow >= 0 &&
        landingRow < BOARD_SIZE &&
        landingCol >= 0 &&
        landingCol < BOARD_SIZE
      ) {
        const landingSquarePiece = this.getPieceAtOnBoard(
          board,
          landingRow,
          landingCol
        );

        if (!landingSquarePiece) {
          // Scan in the opposite direction for potential attackers (jumpers)
          for (let dist = 1; dist < BOARD_SIZE; dist++) {
            const attackerRow = targetRow - deltaRow * dist;
            const attackerCol = targetCol - deltaCol * dist;

            if (
              attackerRow < 0 ||
              attackerRow >= BOARD_SIZE ||
              attackerCol < 0 ||
              attackerCol >= BOARD_SIZE
            )
              break;

            const potentialAttacker = this.getPieceAtOnBoard(
              board,
              attackerRow,
              attackerCol
            );

            if (potentialAttacker) {
              // Opponent is 'red'
              if (potentialAttacker.color === "red") {
                const canReach = potentialAttacker.king === true || dist === 1;
                if (canReach) {
                  return {
                    row: attackerRow,
                    col: attackerCol,
                    piece: potentialAttacker,
                  };
                }
              }
              break; // Path blocked by another piece
            }
          }
        }
      }
    }

    return null;
  },

  // Get piece at position on a board array
  /**
   * Helper: Get a piece at a specific position on a board array.
   *
   * @param {Array} board - The board array
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {Object|null} The piece object or null
   */
  getPieceAtOnBoard(board, row, col) {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
      return null;
    return board[row][col];
  },

  // Find capture opportunities on a board
  findCaptureOpportunitiesOnBoard(board, row, col, piece) {
    const captures = [];
    const opponentColor = piece.color === "red" ? "black" : "red";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    const isKing = piece.king === true;

    for (const [dRow, dCol] of directions) {
      if (isKing) {
        // Flying King capture logic
        for (let dist = 1; dist < BOARD_SIZE; dist++) {
          const targetRow = row + dRow * dist;
          const targetCol = col + dCol * dist;

          if (
            targetRow < 0 ||
            targetRow >= BOARD_SIZE ||
            targetCol < 0 ||
            targetCol >= BOARD_SIZE
          )
            break;

          const targetPiece = this.getPieceAtOnBoard(
            board,
            targetRow,
            targetCol
          );
          if (targetPiece) {
            if (targetPiece.color === opponentColor) {
              // Potential capture - check if square behind is empty
              const landingRow = targetRow + dRow;
              const landingCol = targetCol + dCol;

              if (
                landingRow >= 0 &&
                landingRow < BOARD_SIZE &&
                landingCol >= 0 &&
                landingCol < BOARD_SIZE
              ) {
                const landingPiece = this.getPieceAtOnBoard(
                  board,
                  landingRow,
                  landingCol
                );
                if (!landingPiece) {
                  // King can land on ANY square behind the captured piece
                  for (let landDist = 1; landDist < BOARD_SIZE; landDist++) {
                    const finalRow = targetRow + dRow * landDist;
                    const finalCol = targetCol + dCol * landDist;

                    if (
                      finalRow < 0 ||
                      finalRow >= BOARD_SIZE ||
                      finalCol < 0 ||
                      finalCol >= BOARD_SIZE
                    )
                      break;
                    if (this.getPieceAtOnBoard(board, finalRow, finalCol))
                      break;

                    captures.push({
                      fromRow: row,
                      fromCol: col,
                      toRow: finalRow,
                      toCol: finalCol,
                      capturedRow: targetRow,
                      capturedCol: targetCol,
                    });
                  }
                }
              }
            }
            break; // Blocked by any piece after interaction
          }
        }
      } else {
        // Regular piece capture logic
        const targetRowIdx = row + deltaRow;
        const targetColIdx = col + deltaCol;
        const landingRowIdx = row + deltaRow * 2;
        const landingColIdx = col + deltaCol * 2;

        if (
          landingRowIdx >= 0 &&
          landingRowIdx < BOARD_SIZE &&
          landingColIdx >= 0 &&
          landingColIdx < BOARD_SIZE
        ) {
          const targetPieceObj = this.getPieceAtOnBoard(
            board,
            targetRowIdx,
            targetColIdx
          );
          const landingPieceObj = this.getPieceAtOnBoard(
            board,
            landingRowIdx,
            landingColIdx
          );

          if (
            targetPieceObj &&
            targetPieceObj.color === opponentColor &&
            !landingPieceObj
          ) {
            captures.push({
              fromRow: row,
              fromCol: col,
              toRow: landingRowIdx,
              toCol: landingColIdx,
              capturedRow: targetRowIdx,
              capturedCol: targetColIdx,
            });
          }
        }
      }
    }

    return captures;
  },

  // Copy board for simulation
  /**
   * Helper: Deep copy a board array for simulation.
   *
   * @param {Array} board - The board array to copy
   * @returns {Array} The deep copy of the board
   */
  copyBoard(board) {
    return board.map((row) =>
      row ? row.map((cell) => (cell ? { ...cell } : null)) : null
    );
  },

  // Calculate piece value for exchanges
  /**
   * Calculate the total material value of pieces captured in a move.
   * Kings are worth 300, regular pieces 100.
   *
   * @param {Object} move - The move object
   * @returns {number} The total captured material value
   */
  calculatePieceValue(move) {
    let capturedMaterialSum = 0;

    if (move.capturedPieces && move.capturedPieces.length > 0) {
      // Handle multi-capture sequences
      for (const capturedCoordsKey of move.capturedPieces) {
        const [targetRowIdx, targetColIdx] = capturedCoordsKey
          .split(",")
          .map(Number);
        const pieceAtPos = this.getPieceAt(targetRowIdx, targetColIdx);

        if (pieceAtPos) {
          capturedMaterialSum += pieceAtPos.dataset.king === "true" ? 300 : 100;
        }
      }
    } else {
      // Handle a single capture move (calculated as a 2nd order jump)
      const rowDistance = Math.abs(move.toRow - move.fromRow);
      const colDistance = Math.abs(move.toCol - move.fromCol);

      if (rowDistance === 2 && colDistance === 2) {
        const midRowIdx = (move.fromRow + move.toRow) / 2;
        const midColIdx = (move.fromCol + move.toCol) / 2;
        const pieceInMiddle = this.getPieceAt(midRowIdx, midColIdx);

        if (pieceInMiddle) {
          capturedMaterialSum +=
            pieceInMiddle.dataset.king === "true" ? 300 : 100;
        }
      }
    }

    return capturedMaterialSum;
  },

  // Check if move enables promotion
  /**
   * Check if a move enables a path for friendly pieces to achieve promotion.
   *
   * @param {Object} move - The move object
   * @returns {boolean} True if a promotion path is cleared
   */
  enablesPromotion(move) {
    const simulatedBoard = this.simulateMove(move);

    // Scan for friendly black pieces (which move towards BOARD_SIZE-1)
    for (let c = 0; col < BOARD_SIZE; c++) {
      for (let r = BOARD_SIZE - 2; r >= 0; r--) {
        const pieceAtPos = this.getPieceAtOnBoard(simulatedBoard, r, c);

        if (pieceAtPos && pieceAtPos.color === "black" && !pieceAtPos.king) {
          // Verify if the vertical path to the promotion line is clear of obstacles
          let isPromotionPathClear = true;
          for (let rowIdx = r + 1; rowIdx < BOARD_SIZE; rowIdx++) {
            if (this.getPieceAtOnBoard(simulatedBoard, rowIdx, c)) {
              isPromotionPathClear = false;
              break;
            }
          }
          if (isPromotionPathClear) return true;
        }
      }
    }

    return false;
  },

  // Calculate king activation benefit
  /**
   * Calculate the mobility benefit for friendly kings after a move.
   *
   * @param {Object} move - The move object
   * @returns {number} The total activation benefit score
   */
  calculateKingActivationBenefit(move) {
    let activationBenefit = 0;
    const simulatedBoard = this.simulateMove(move);

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const pieceAtPos = this.getPieceAtOnBoard(simulatedBoard, r, c);

        if (pieceAtPos && pieceAtPos.color === "black" && pieceAtPos.king) {
          const kingMobilityPoints = this.calculateKingMobilityOnBoard(
            simulatedBoard,
            r,
            c
          );
          activationBenefit += kingMobilityPoints * 5;
        }
      }
    }

    return activationBenefit;
  },

  // Calculate king mobility on a specific board
  /**
   * Calculate legal non-capture mobility for a king on a specific board layout.
   *
   * @param {Array} board - The board array
   * @param {number} row - King row
   * @param {number} col - King column
   * @returns {number} The count of available squares
   */
  calculateKingMobilityOnBoard(board, row, col) {
    let mobilityCount = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of directions) {
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const targetRow = row + deltaRow * dist;
        const targetCol = col + deltaCol * dist;

        if (
          targetRow < 0 ||
          targetRow >= BOARD_SIZE ||
          targetCol < 0 ||
          targetCol >= BOARD_SIZE
        )
          break;

        if (this.getPieceAtOnBoard(board, targetRow, targetCol)) break;
        mobilityCount++;
      }
    }

    return mobilityCount;
  },

  // Calculate damage to opponent formation
  /**
   * Evaluate the degree of disruption caused to the opponent's formation.
   * Rewards moves that isolate opponent pieces.
   *
   * @param {Object} move - The move object
   * @returns {number} The formation damage score
   */
  calculateOpponentFormationDamage(move) {
    let formationDamageScore = 0;
    if (!move.isCapture) return 0;

    const simulatedBoard = this.simulateMove(move);

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const pieceAtPos = this.getPieceAtOnBoard(simulatedBoard, r, c);

        if (pieceAtPos && pieceAtPos.color === "red") {
          // Identify if the capture resulted in an isolated opponent piece
          const neighborCount = this.countNeighborsOnBoard(
            simulatedBoard,
            r,
            c,
            "red"
          );
          if (neighborCount === 0) {
            formationDamageScore += 30;
          }
        }
      }
    }

    return formationDamageScore;
  },

  /**
   * Count how many friendly neighbors a piece has at a specific position.
   *
   * @param {Array} board - The board array
   * @param {number} row - Piece row
   * @param {number} col - Piece column
   * @param {string} color - The color to match
   * @returns {number} The count of neighbors
   */
  countNeighborsOnBoard(board, row, col, color) {
    let neighborCount = 0;
    const neighborOffsets = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (const [deltaRow, deltaCol] of neighborOffsets) {
      const checkRowIdx = row + deltaRow;
      const checkColIdx = col + deltaCol;
      const pieceAtPos = this.getPieceAtOnBoard(
        board,
        checkRowIdx,
        checkColIdx
      );
      if (pieceAtPos && pieceAtPos.color === color) {
        neighborCount++;
      }
    }

    return neighborCount;
  },

  /**
   * Calculate how many opponent capture threats are neutralized by performing this move.
   *
   * @param {Object} move - The move object
   * @returns {number} The number of neutralized threats
   */
  calculateThreatsNeutralized(move) {
    // Determine the baseline threat count before any move is made
    const threatsBeforeMove = this.calculateOpponentCaptureOpportunities({
      fromRow: 0,
      fromCol: 0,
      toRow: 0,
      toCol: 0,
    });

    // Determine the threat count after the simulated move
    const threatsAfterMove = this.calculateOpponentCaptureOpportunities(move);

    return Math.max(0, threatsBeforeMove - threatsAfterMove);
  },

  /**
   * Count how many new immediate capture threats are created by this move.
   *
   * @param {Object} move - The move object
   * @returns {number} The number of new threats created
   */
  countThreatsCreatedByMove(move) {
    const simulatedBoard = this.simulateMove(move);
    let createdThreatCount = 0;
    const { toRow: targetRow, toCol: targetCol } = move;

    // Scan for new capture opportunities originating from the destination
    const jumpDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of jumpDirections) {
      const landingRowIdx = targetRow + deltaRow * 2;
      const landingColIdx = targetCol + deltaCol * 2;

      if (
        landingRowIdx >= 0 &&
        landingRowIdx < BOARD_SIZE &&
        landingColIdx >= 0 &&
        landingColIdx < BOARD_SIZE
      ) {
        const victimRowIdx = targetRow + deltaRow;
        const victimColIdx = targetCol + deltaCol;
        const victimPiece = this.getPieceAtOnBoard(
          simulatedBoard,
          victimRowIdx,
          victimColIdx
        );
        const landingCell = this.getPieceAtOnBoard(
          simulatedBoard,
          landingRowIdx,
          landingColIdx
        );

        // Check if we can capture an opponent (red) piece
        if (victimPiece && victimPiece.color === "red" && !landingCell) {
          createdThreatCount++;
        }
      }
    }

    return createdThreatCount;
  },

  /**
   * Evaluate the gain in activity and positional pressure from a move.
   * Centralizes pieces and advances them forward.
   *
   * @param {Object} move - The move object
   * @returns {number} The activity gain score
   */
  calculateActivityGain(move) {
    let activityGainedScore = 0;
    const boardCenterIdx = (BOARD_SIZE - 1) / 2;

    // Reward moves that bring pieces closer to the geometric center
    const newDistToCenter =
      Math.abs(move.toRow - boardCenterIdx) +
      Math.abs(move.toCol - boardCenterIdx);
    const oldDistToCenter =
      Math.abs(move.fromRow - boardCenterIdx) +
      Math.abs(move.fromCol - boardCenterIdx);

    if (newDistToCenter < oldDistToCenter) {
      activityGainedScore += (oldDistToCenter - newDistToCenter) * 10;
    }

    // Reward the forward advancement of regular pawns
    const isPawn = move.piece.dataset.king !== "true";
    if (isPawn && move.toRow > move.fromRow) {
      activityGainedScore += (move.toRow - move.fromRow) * 15;
    }

    return activityGainedScore;
  },

  /**
   * Evaluate the collective mobility of all pieces of a given color.
   *
   * @param {string} pieceColor - The color to evaluate ('black' or 'red')
   * @returns {number} The collective mobility score
   */
  evaluateMobility(pieceColor) {
    let totalMobilityScore = 0;
    const boardDim = BOARD_SIZE || 10;

    for (let r = 0; r < boardDim; r++) {
      for (let c = 0; c < boardDim; c++) {
        const pieceAtPos = this.getPieceAt(r, c);
        if (pieceAtPos && pieceAtPos.dataset.color === pieceColor) {
          const availablePieceMoves = this.getPieceMoves(r, c, pieceAtPos);
          totalMobilityScore +=
            availablePieceMoves.length * this.weights.mobility;
        }
      }
    }
    return totalMobilityScore;
  },

  /**
   * Generate a string-based hash representing the current or simulated board position.
   *
   * @param {Array|null} boardArrayState - Optional board array for hashing
   * @returns {string} The computed position hash
   */
  getPositionHash(boardArrayState) {
    let boardHashString = "";
    const boardDim = BOARD_SIZE || 10;

    if (boardArrayState) {
      // Hash from a simulated board array
      for (let r = 0; r < boardDim; r++) {
        for (let c = 0; c < boardDim; c++) {
          const pieceObj = boardArrayState[r][c];
          if (!pieceObj) {
            boardHashString += "0";
          } else {
            const colorCode = pieceObj.color === "black" ? "B" : "R";
            const rankCode = pieceObj.king ? "K" : "P";
            boardHashString += colorCode + rankCode;
          }
        }
      }
    } else {
      // Hash from the live DOM board
      for (let r = 0; r < boardDim; r++) {
        for (let c = 0; c < boardDim; c++) {
          const domPiece = this.getPieceAt(r, c);
          if (domPiece) {
            const colorCode = domPiece.dataset.color[0].toUpperCase();
            const rankCode = domPiece.dataset.king === "true" ? "K" : "P";
            boardHashString += colorCode + rankCode;
          } else {
            boardHashString += "0";
          }
        }
      }
    }
    return boardHashString;
  },

  /**
   * Determine a shorthand string type for a move (e.g., 'CK' for Capture King).
   *
   * @param {Object} move - The move object
   * @returns {string} The move type shorthand
   */
  getMoveType(move) {
    let moveTypeCode = "";

    // Accommodate both standard move objects and raw prediction objects
    const isKingPiece = move.piece
      ? move.piece.dataset.king === "true"
      : !!move.isKing;
    const pieceColorVal = move.piece ? move.piece.dataset.color : move.color;

    if (move.isCapture) moveTypeCode += "C";
    if (isKingPiece) moveTypeCode += "K";

    // Check for a promotion move (landing on the opponent's back rank)
    if (move.toRow === BOARD_SIZE - 1 && pieceColorVal === "black") {
      moveTypeCode += "P";
    }

    const rowDistanceTraveled = Math.abs(move.toRow - move.fromRow);
    if (rowDistanceTraveled === 1) {
      moveTypeCode += "S"; // Simple move
    } else if (rowDistanceTraveled >= 2 && !move.isCapture) {
      moveTypeCode += "L"; // Long/Flying king move
    }

    return moveTypeCode || "N";
  },

  /**
   * Generate an enhanced move type string that includes positional and situational context.
   * Useful for pattern-based memory and trajectory tracking.
   *
   * @param {Object} move - The move object
   * @returns {string} The contextual move type string
   */
  getMoveTypeWithContext(move) {
    const baseTypeCode = this.getMoveType(move);
    const currentGameContextStr = this.getCurrentGameContext();

    // Determine the spatial context of the destination
    const isDestAtEdge = move.toRow <= 1 || move.toRow >= BOARD_SIZE - 2;
    const isDestInCenter =
      move.toRow >= 3 &&
      move.toRow <= BOARD_SIZE - 4 &&
      move.toCol >= 3 &&
      move.toCol <= BOARD_SIZE - 4;

    const spatialContextTag = isDestInCenter
      ? "_center"
      : isDestAtEdge
      ? "_edge"
      : "_mid";

    return `${currentGameContextStr}_${baseTypeCode}${spatialContextTag}`;
  },

  /**
   * Create a clean, serializable snapshot of a move for persistence and transmission.
   * Ensures all required properties (color, king status, etc.) are present and standardized.
   *
   * @param {Object} move - The source move object
   * @returns {Object|null} The standardized move snapshot
   */
  buildMoveSnapshot(move) {
    if (!move) return null;

    const pieceDatasetAttr =
      move.piece && move.piece.dataset ? move.piece.dataset : null;
    const resolvedPieceColor =
      (pieceDatasetAttr && pieceDatasetAttr.color) ||
      move.pieceColor ||
      move.color ||
      "black";

    const isKingFlag =
      pieceDatasetAttr && pieceDatasetAttr.king !== undefined
        ? pieceDatasetAttr.king === "true" || pieceDatasetAttr.king === true
        : move.pieceKing !== undefined
        ? !!move.pieceKing
        : !!move.king;

    const standardizedSnapshot = {
      fromRow: move.fromRow,
      fromCol: move.fromCol,
      toRow: move.toRow,
      toCol: move.toCol,
      isCapture: !!move.isCapture,
      isMultiCapture: !!move.isMultiCapture,
      capturedPieces: Array.isArray(move.capturedPieces)
        ? [...move.capturedPieces]
        : [],
      capturedRow: move.capturedRow !== undefined ? move.capturedRow : null,
      capturedCol: move.capturedCol !== undefined ? move.capturedCol : null,
      capturedKingsCount: move.capturedKingsCount || 0,
      piece: {
        dataset: {
          color: resolvedPieceColor.toString(),
          king: isKingFlag ? "true" : "false",
        },
      },
      pieceColor: resolvedPieceColor.toString(),
      pieceKing: isKingFlag,
    };

    // Backfill capturedPieces array if single captured coords are present
    if (
      standardizedSnapshot.capturedPieces.length === 0 &&
      standardizedSnapshot.capturedRow !== null &&
      standardizedSnapshot.capturedCol !== null
    ) {
      standardizedSnapshot.capturedPieces = [
        `${standardizedSnapshot.capturedRow},${standardizedSnapshot.capturedCol}`,
      ];
    }

    return standardizedSnapshot;
  },

  /**
   * Log the evaluation details for a specific move into the game trajectory.
   *
   * @param {Object} move - The move object
   * @param {number} heuristicScore - The raw heuristic score calculated for this move
   */
  storeMoveEvaluation(move, heuristicScore) {
    const moveSnapshotData = this.buildMoveSnapshot(move);
    if (!moveSnapshotData) return;

    const currentBoardHashStr = this.getPositionHash();

    this.memory.lastGameMoves.push({
      move: moveSnapshotData,
      evaluation: Number.isFinite(heuristicScore) ? heuristicScore : 0,
      position: currentBoardHashStr,
      boardHash: currentBoardHashStr,
    });
  },

  /**
   * Update global memory statistics for move attempts.
   *
   * @param {Object} move - The move object
   */
  recordMoveAttempt(move) {
    this.memory.totalMoves++;
    if (move.isCapture) {
      this.memory.captureAttempts++;
    }
  },

  /**
   * Dynamically adapt evaluation weights based on the current game state, phase, and opponent style.
   * This is called before every AI move to ensure the strategy is relevant to the board context.
   */
  adaptWeights() {
    // Reset weights to base profile before applying adaptations
    this.weights = { ...this.baseWeights };

    // --- State Analysis ---
    let totalPieceCount = 0;
    let blackPieceCount = 0;
    let redPieceCount = 0;
    let blackKingCount = 0;
    let redKingCount = 0;
    let emptyBackRankCount = 0;
    let blackExposedCount = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const pieceAtPos = this.getPieceAt(r, c);

        if (pieceAtPos) {
          totalPieceCount++;
          if (pieceAtPos.dataset.color === "black") {
            blackPieceCount++;
            if (pieceAtPos.dataset.king === "true") blackKingCount++;
            if (this.isExposedPiece(r, c, pieceAtPos)) blackExposedCount++;
          } else {
            redPieceCount++;
            if (pieceAtPos.dataset.king === "true") redKingCount++;
          }
        } else {
          // Identify gaps in the back defensive rank
          if (r <= 1 && (r + c) % 2 === 1) emptyBackRankCount++;
        }
      }
    }

    const currentMaterialAdvantage = blackPieceCount - redPieceCount;
    const currentPhaseTag = this.determineGamePhase(
      totalPieceCount,
      blackPieceCount,
      redPieceCount
    );

    // --- OPPONENT STYLE ADAPTATION ---
    if (this.memory.opponentType === "aggressive") {
      this.weights.backRankDefense *= 1.5;
      this.weights.cohesion *= 1.3;
      this.weights.safety *= 1.2;
    } else if (this.memory.opponentType === "turtle") {
      this.weights.advancement *= 1.4;
      this.weights.center *= 1.3;
      this.weights.threatCreation *= 1.2;
    } else if (this.memory.opponentType === "greedy") {
      this.weights.sacrificeThreshold *= 0.8; // Bait them
      this.weights.trapCreationBonus =
        (this.weights.trapCreationBonus || 0) + 500;
    }

    // --- STRATEGIC ADAPTATIONS BY PHASE ---
    const isLateGame = totalPieceCount <= 10;
    const isEndgame = totalPieceCount <= 16;

    // Dynamic material scaling: pieces become more valuable as they are lost
    // (12 pieces per side initially, 24 total)
    const scarcityMultiplier = Math.max(
      1.0,
      (24 / Math.max(1, totalPieceCount)) ** 1.5
    );
    this.weights.material *= scarcityMultiplier;
    this.weights.king *= scarcityMultiplier * 1.2;

    if (isLateGame) {
      // LATE GAME STRATEGY (10 or fewer pieces total): Absolute precision
      this.weights.safety *= 4.0;
      this.weights.selfDanger *= 10.0; // Extreme risk aversion - losing a piece is fatal
      this.weights.king *= 2.5;
      this.weights.mobility *= 1.8;
      this.weights.advancement *= 2.0;
      this.weights.sacrificeThreshold = 100000000; // Zero tolerance
      this.weights.cohesion *= 3.0;
      this.weights.support *= 3.0;
    } else if (isEndgame) {
      // ENDGAME STRATEGY (11-16 pieces total): King dominance and safety
      this.weights.safety *= 2.5;
      this.weights.selfDanger *= 4.0;
      this.weights.king *= 2.0;
      this.weights.mobility *= 1.5;
      this.weights.advancement *= 1.6;
      this.weights.sacrificeThreshold *= 3.0;
      this.weights.cohesion *= 2.0;
      this.weights.support *= 2.0;
    } else {
      // MID/OPENING STRATEGY
      if (totalPieceCount <= 32) {
        // Midgame
        this.weights.safety *= 1.8;
        this.weights.selfDanger *= 2.0;
        this.weights.cohesion *= 1.5;
        this.weights.support *= 1.7;
        this.weights.defensiveValue *= 1.8;
      } else {
        // Opening
        if (this.weights.advancement > 0) {
          this.weights.advancement *= 1.1;
        }
        this.weights.position *= 1.2;
        this.weights.center *= 1.1;
      }
    }

    // --- MATERIAL RELATIVE ADJUSTMENTS ---
    if (currentMaterialAdvantage > 1) {
      // AI is AHEAD: Protect the lead
      this.weights.safety *= 3.0;
      this.weights.cohesion *= 2.5;
      this.weights.selfDanger *= 5.0;
    } else if (currentMaterialAdvantage < -1) {
      // AI is BEHIND: Material is priceless
      this.weights.material *= 8.0;
      this.weights.safety *= 6.0;
      this.weights.selfDanger = 1000000;
      this.weights.advancement = -200000; // Massive retraction
    }

    // --- EMERGENCY STATE ADJUSTMENTS ---
    if (blackExposedCount > 2) {
      this.weights.support *= 3.0; // Desperately seek support for isolated pieces
      this.weights.cohesion *= 2.0;
      this.weights.isolationPenalty *= 3.0;
    }

    // --- ABSOLUTE DEFENSE OVERRIDE (User Request: <= 8 black pieces) ---
    if (blackPieceCount <= 8) {
      if (currentPhase !== "endgame") {
          currentPhase = "endgame";
          console.log("⚠️ ENDGAME DETECTED (<=8 pieces): Switching to Absolute Defense Mode");
      }
      // Apply maximum defensive overrides
      this.weights.kingEndangerPenalty = 9000000;
      this.weights.sacrificeThreshold = 20000000;
      this.weights.isolationPenalty = 150000;
      this.weights.formationIntegrity = 100000; 
      this.weights.avoidCapture = 10000;
      this.weights.selfDanger = 10000000; 
    } else {
        if (currentPhase === "endgame") currentPhase = "opening";
    }
  },

  /**
   * Determine the current game phase based on remaining piece counts.
   *
   * @param {number} totalCount - Total pieces on board
   * @param {number} blackCount - Total black pieces
   * @param {number} redCount - Total red pieces
   * @returns {string} One of 'endgame', 'midgame', or 'opening'
   */
  determineGamePhase(totalCount, blackCount, redCount) {
    if (totalCount <= 10) return "late-endgame";
    if (totalCount <= 16) return "endgame";
    if (totalCount <= 32) return "midgame";
    return "opening";
  },

  /**
   * Check if a piece at a given position is isolated (has no friendly diagonal support).
   *
   * @param {number} r - Row index
   * @param {number} c - Column index
   * @param {Object} piece - The piece object
   * @returns {boolean} True if the piece is exposed (no neighbors)
   */
  isExposedPiece(r, c, piece) {
    const potentialSupportOffsets = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of potentialSupportOffsets) {
      const neighborRow = r + deltaRow;
      const neighborCol = c + deltaCol;

      if (
        neighborRow >= 0 &&
        neighborRow < BOARD_SIZE &&
        neighborCol >= 0 &&
        neighborCol < BOARD_SIZE
      ) {
        const potentialFriendlyPiece = this.getPieceAt(
          neighborRow,
          neighborCol
        );
        if (
          potentialFriendlyPiece &&
          potentialFriendlyPiece.dataset.color === piece.dataset.color
        ) {
          return false; // Found friendly support
        }
      }
    }
    return true; // No support found
  },

  /**
   * Recursive Minimax search with Alpha-Beta pruning for tactical look-ahead.
   *
   * @param {number} currentDepth - Current search depth
   * @param {number} alphaVal - Alpha threshold
   * @param {number} betaVal - Beta threshold
   * @param {boolean} isMaximizing - Whether it's the current player's turn to maximize score
   * @param {string} perspectiveColor - The color from whose perspective we evaluate
   * @returns {number} The evaluation score
   */
  minimax(currentDepth, alphaVal, betaVal, isMaximizing, perspectiveColor) {
    if (currentDepth === 0) {
      return this.evaluatePosition(perspectiveColor);
    }

    const nextPlayerColor = isMaximizing
      ? perspectiveColor
      : perspectiveColor === "black"
      ? "red"
      : "black";
    const legalMovesList = this.getAllMoves(nextPlayerColor);

    if (isMaximizing) {
      let maxEvaluationVal = -Infinity;
      for (const moveObj of legalMovesList) {
        // Recursively evaluate the resulting position
        const resultEval = this.minimax(
          currentDepth - 1,
          alphaVal,
          betaVal,
          false,
          perspectiveColor
        );
        maxEvaluationVal = Math.max(maxEvaluationVal, resultEval);
        alphaVal = Math.max(alphaVal, resultEval);
        if (betaVal <= alphaVal) break; // Beta cut-off
      }
      return maxEvaluationVal;
    } else {
      let minEvaluationVal = Infinity;
      for (const moveObj of legalMovesList) {
        const resultEval = this.minimax(
          currentDepth - 1,
          alphaVal,
          betaVal,
          true,
          perspectiveColor
        );
        minEvaluationVal = Math.min(minEvaluationVal, resultEval);
        betaVal = Math.min(betaVal, resultEval);
        if (betaVal <= alphaVal) break; // Alpha cut-off
      }
      return minEvaluationVal;
    }
  },

  // ==================== MONTE CARLO TREE SEARCH (MCTS) ====================

  // MCTS Node class for tree structure
  /**
   * Factory function to create a new node for the Monte Carlo Tree Search.
   *
   * @param {Object|null} moveObj - The move that led to this node
   * @param {Object|null} parentNode - Reference to the parent node
   * @param {Array|null} boardState - Simulated board state at this node
   * @returns {Object} The initialized MCTS node
   */
  createMCTSNode(moveObj = null, parentNode = null, boardState = null) {
    return {
      move: moveObj,
      parent: parentNode,
      children: [],
      wins: 0,
      visits: 0,
      untriedMoves: null,
      playerWhoMovedToGetHere: null,
      board: boardState,
    };
  },

  // Main MCTS algorithm
  /**
   * Execute the Monte Carlo Tree Search (MCTS) algorithm to find the optimal move.
   * Performs Selection, Expansion, Simulation (Playout), and Backpropagation cycles.
   *
   * @param {Array} rootBoardState - The current board state to start search from
   * @param {string} aiColor - The color of the AI ('black')
   * @returns {Promise<Object>} The selected move object
   */
  async runMCTS(rootBoardState, aiColor) {
    const searchStartTime = Date.now();

    // Initialize root node
    const mctsRootNode = this.createMCTSNode(null, null, rootBoardState);
    mctsRootNode.playerWhoMovedToGetHere =
      aiColor === "black" ? "red" : "black";
    mctsRootNode.untriedMoves = this.getAllMovesForBoard(
      rootBoardState,
      aiColor
    );

    let completedSimulationsCount = 0;
    const searchTimeLimitMs = this.mcts.timeLimit;

    // Computational loop for MCTS cycles
    while (
      completedSimulationsCount < this.mcts.simulationsPerMove &&
      Date.now() - searchStartTime < searchTimeLimitMs
    ) {
      let currentNode = mctsRootNode;
      let simulatedBoard = this.copyBoardState(rootBoardState);
      let activeColor = aiColor;

      // 1. SELECTION: Descend the tree using UCB1 until an expandable or terminal node is reached
      while (
        currentNode.untriedMoves &&
        currentNode.untriedMoves.length === 0 &&
        currentNode.children.length > 0
      ) {
        currentNode = this.selectUCB1(currentNode);
        if (currentNode.move) {
          simulatedBoard = this.applyMoveToBoard(
            simulatedBoard,
            currentNode.move
          );
          activeColor = activeColor === "black" ? "red" : "black";
        }
      }

      // 2. EXPANSION: Create a new child node if move options are available
      if (currentNode.untriedMoves && currentNode.untriedMoves.length > 0) {
        const nextMoveOption = currentNode.untriedMoves.pop();
        simulatedBoard = this.applyMoveToBoard(simulatedBoard, nextMoveOption);
        activeColor = activeColor === "black" ? "red" : "black";

        const newlyExpandedChild = this.createMCTSNode(
          nextMoveOption,
          currentNode,
          simulatedBoard
        );
        newlyExpandedChild.playerWhoMovedToGetHere =
          activeColor === "black" ? "red" : "black";
        newlyExpandedChild.untriedMoves = this.getAllMovesForBoard(
          simulatedBoard,
          activeColor
        );

        currentNode.children.push(newlyExpandedChild);
        currentNode = newlyExpandedChild;
      }

      // 3. SIMULATION (ROLLOUT): Perform a random playout from the new state
      const playoutWinner = this.simulateRandomPlayout(
        simulatedBoard,
        activeColor
      );

      // 4. BACKPROPAGATION: Update statistics up the tree based on the playout result
      let backpropNode = currentNode;
      while (backpropNode !== null) {
        backpropNode.visits++;

        // Reward nodes that lead to an AI win
        if (playoutWinner === aiColor) {
          backpropNode.wins++;
        } else if (playoutWinner === "draw") {
          backpropNode.wins += 0.5;
        }
        backpropNode = backpropNode.parent;
      }

      completedSimulationsCount++;
    }

    const searchDuration = Date.now() - searchStartTime;
    this.mcts.totalSimulations += completedSimulationsCount;

    // Final move selection based on visit count (robustness) or win rate
    return this.selectBestMCTSMove(mctsRootNode);
  },

  // UCB1 selection formula
  /**
   * Upper Confidence Bound applied to Trees (UCB1) formula for node selection.
   * Balances exploitation of high-win-rate nodes with exploration of less-visited ones.
   *
   * @param {Object} parentNode - The node to select a child from
   * @returns {Object} The selected child node
   */
  selectUCB1(parentNode) {
    const explorationConstantK = this.mcts.explorationConstant;
    let highestUCB1Score = -Infinity;
    let selectedChildNode = null;

    for (const childNode of parentNode.children) {
      const exploitationTerm = childNode.wins / childNode.visits;
      const explorationTerm =
        explorationConstantK *
        Math.sqrt(Math.log(parentNode.visits) / childNode.visits);
      const combinedScore = exploitationTerm + explorationTerm;

      if (combinedScore > highestUCB1Score) {
        highestUCB1Score = combinedScore;
        selectedChildNode = childNode;
      }
    }

    return selectedChildNode;
  },

  // Select best move after MCTS completes
  /**
   * Select the best move from the root children after MCTS simulations conclude.
   * Generally prefers the 'most robust' move (one with highest visit count).
   *
   * @param {Object} rootNode - The root node of the MCTS tree
   * @returns {Object} The selected best move
   */
  selectBestMCTSMove(rootNode) {
    let maxVisitsCount = -1;
    let optimalMoveObj = null;

    for (const childNode of rootNode.children) {
      // Robust child selection (most visits)
      if (childNode.visits > maxVisitsCount) {
        maxVisitsCount = childNode.visits;
        optimalMoveObj = childNode.move;
      }
    }

    return optimalMoveObj;
  },

  // Simulate a random playout from current position
  /**
   * Perform a random playout (simulation) from a given board state to a terminal node or max depth.
   *
   * @param {Array} boardState - The initial board state for the simulation
   * @param {string} startPlayerColor - The color of the player whose turn it is
   * @returns {string} The result of the simulation ('black', 'red', or 'draw')
   */
  simulateRandomPlayout(boardState, startPlayerColor) {
    let currentSimBoard = this.copyBoardState(boardState);
    let currentSimColor = startPlayerColor;
    let simulationDepth = 0;
    const maxSimulationDepthLimit = this.mcts.maxDepth;

    while (simulationDepth < maxSimulationDepthLimit) {
      const legalMovesInSim = this.getAllMovesForBoard(
        currentSimBoard,
        currentSimColor
      );

      if (legalMovesInSim.length === 0) {
        // Terminal state reached: Current player has no moves and loses
        return currentSimColor === "black" ? "red" : "black";
      }

      // Check for predefined game end conditions (e.g., win/loss patterns)
      const simulationGameStateTag = this.checkGameEndOnBoard(currentSimBoard);
      if (simulationGameStateTag !== "ongoing") {
        return simulationGameStateTag;
      }

      // Select a move randomly, with a heuristic bias towards captures
      const selectedSimMove = this.selectSimulationMove(legalMovesInSim);
      currentSimBoard = this.applyMoveToBoard(currentSimBoard, selectedSimMove);

      // Symmetrically swap the active simulation player
      currentSimColor = currentSimColor === "black" ? "red" : "black";
      simulationDepth++;
    }

    // Reach depth limit: evaluate the final state using heuristics
    return this.evaluateEndPosition(currentSimBoard);
  },

  // Select move during simulation (can add heuristics)
  /**
   * Select a move from a list of legal moves during simulation.
   * Implements a slight bias (70%) towards capture moves to simulate tactical awareness.
   *
   * @param {Array} legalMovesList - Array of available move objects
   * @returns {Object} The chosen move object
   */
  selectSimulationMove(legalMovesList) {
    const availableCaptureMoves = legalMovesList.filter((m) => m.isCapture);

    // Prioritize captures to enhance the quality of simulation results
    if (availableCaptureMoves.length > 0 && Math.random() < 0.7) {
      const randomIndex = Math.floor(
        Math.random() * availableCaptureMoves.length
      );
      return availableCaptureMoves[randomIndex];
    }

    // Fallback to purely random selection
    const randomIndex = Math.floor(Math.random() * legalMovesList.length);
    return legalMovesList[randomIndex];
  },

  // Get all possible moves for a given board state
  /**
   * Generate all legal moves for a given color on a specific board state.
   * Respects mandatory capture rules and forced multi-capture sequences.
   *
   * @param {Array} boardArr - The board array
   * @param {string} playerColorVal - The color to move
   * @returns {Array} List of legal move objects
   */
  getAllMovesForBoard(boardArr, playerColorVal) {
    const collectiveMovesList = [];

    // Handle forced multi-capture persistence from global state
    if (
      typeof mustContinueCapture !== "undefined" &&
      mustContinueCapture &&
      forcedCapturePiece
    ) {
      const pieceParentCell = forcedCapturePiece.parentElement;
      if (pieceParentCell) {
        const rowIdx = parseInt(pieceParentCell.dataset.row);
        const colIdx = parseInt(pieceParentCell.dataset.col);
        const targetPieceObj = boardArr[rowIdx][colIdx];

        if (targetPieceObj && targetPieceObj.color === playerColorVal) {
          return this.getMovesForPieceOnBoard(
            boardArr,
            rowIdx,
            colIdx,
            targetPieceObj
          );
        }
      }
    }

    // Iterate through the board to find all pieces belonging to the active player
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const activePiece = boardArr[r][c];
        if (activePiece && activePiece.color === playerColorVal) {
          const individualPieceMoves = this.getMovesForPieceOnBoard(
            boardArr,
            r,
            c,
            activePiece
          );
          collectiveMovesList.push(...individualPieceMoves);
        }
      }
    }

    // Enforce mandatory max capture rules (International Draughts style)
    const filteredCaptureMoves = collectiveMovesList.filter((m) => m.isCapture);

    if (filteredCaptureMoves.length > 0) {
      let absoluteMaxCaptureCount = 0;

      const captureOptionsWithDepth = filteredCaptureMoves.map((moveObj) => {
        const projectedPotential = this.calculateVirtualCapturePotential(
          boardArr,
          moveObj
        );
        if (projectedPotential > absoluteMaxCaptureCount) {
          absoluteMaxCaptureCount = projectedPotential;
        }
        return { move: moveObj, chainLength: projectedPotential };
      });

      // Filter to return ONLY moves that achieve the maximum possible capture length
      return captureOptionsWithDepth
        .filter((option) => option.chainLength === absoluteMaxCaptureCount)
        .map((option) => option.move);
    }

    return collectiveMovesList;
  },
  /**
   * Recursively calculate the maximum potential capture chain length for a move on a virtual board.
   *
   * @param {Array} boardArr - The current board state array
   * @param {Object} moveObj - The initial capture move to evaluate
   * @returns {number} The maximum number of captures achievable in this sequence
   */
  calculateVirtualCapturePotential(boardArr, moveObj) {
    if (!moveObj.isCapture) return 0;

    // Apply the initial step to a simulated board
    const boardAfterStep = this.applyMoveToBoard(boardArr, moveObj);
    let maximumAchievableChain = 0;

    // Identify any available jump-captures from the new position
    const pieceAtDest = boardAfterStep[moveObj.toRow][moveObj.toCol];
    if (pieceAtDest) {
      const subsequentMoveOptions = this.getMovesForPieceOnBoard(
        boardAfterStep,
        moveObj.toRow,
        moveObj.toCol,
        pieceAtDest
      );
      const subsequentCaptures = subsequentMoveOptions.filter(
        (m) => m.isCapture
      );

      if (subsequentCaptures.length > 0) {
        for (const nextCaptureMove of subsequentCaptures) {
          const currentChainLength = this.calculateVirtualCapturePotential(
            boardAfterStep,
            nextCaptureMove
          );
          if (currentChainLength > maximumAchievableChain) {
            maximumAchievableChain = currentChainLength;
          }
        }
      }
    }

    return 1 + maximumAchievableChain;
  },

  /**
   * Calculate all available moves (jumps and steps) for a piece on a virtual board state.
   *
   * @param {Array} boardArr - The board array state
   * @param {number} r - Piece row
   * @param {number} c - Piece column
   * @param {Object} pieceObj - The piece data object
   * @returns {Array} List of move objects
   */
  getMovesForPieceOnBoard(boardArr, r, c, pieceObj) {
    const validMovesList = [];
    const isKingPiece = pieceObj.king;
    const pieceColorVal = pieceObj.color;

    // Standard directions for captures (all pieces) and moves (Kings)
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    // Determine movement directions for regular pieces
    let passiveDirections;
    if (isKingPiece) {
      passiveDirections = tacticalDirections;
    } else if (pieceColorVal === "red") {
      passiveDirections = [
        [-1, -1],
        [-1, 1],
      ]; // Red moves "up"
    } else {
      passiveDirections = [
        [1, -1],
        [1, 1],
      ]; // Black moves "down"
    }

    // 1. GENERATE CAPTURE MOVES (PRIORITY)
    if (isKingPiece) {
      // Long-range "Flying King" capture logic
      for (const [deltaRow, deltaCol] of tacticalDirections) {
        let hasEncounteredEnemy = false;
        let victimRowIdx = -1;
        let victimColIdx = -1;

        for (let dist = 1; dist < BOARD_SIZE; dist++) {
          const targetRowIdx = r + deltaRow * dist;
          const targetColIdx = c + deltaCol * dist;

          if (
            targetRowIdx < 0 ||
            targetRowIdx >= BOARD_SIZE ||
            targetColIdx < 0 ||
            targetColIdx >= BOARD_SIZE
          )
            break;

          const cellPiece = boardArr[targetRowIdx][targetColIdx];

          if (!hasEncounteredEnemy) {
            if (cellPiece) {
              if (cellPiece.color === pieceColorVal) break; // Path blocked by friendly piece
              hasEncounteredEnemy = true;
              victimRowIdx = targetRowIdx;
              victimColIdx = targetColIdx;
            }
          } else {
            if (cellPiece) break; // Cannot jump over two pieces

            // Found a valid landing square behind the victim
            validMovesList.push({
              fromRow: r,
              fromCol: c,
              toRow: targetRowIdx,
              toCol: targetColIdx,
              isCapture: true,
              capturedRow: victimRowIdx,
              capturedCol: victimColIdx,
              king: isKingPiece,
              color: pieceColorVal,
            });
          }
        }
      }
    } else {
      // Regular Pawn capture logic
      for (const [deltaRow, deltaCol] of tacticalDirections) {
        const victimRowIdx = r + deltaRow;
        const victimColIdx = c + deltaCol;
        const landingRowIdx = r + deltaRow * 2;
        const landingColIdx = c + deltaCol * 2;

        if (
          landingRowIdx >= 0 &&
          landingRowIdx < BOARD_SIZE &&
          landingColIdx >= 0 &&
          landingColIdx < BOARD_SIZE
        ) {
          const victimPiece = boardArr[victimRowIdx][victimColIdx];
          const landingCell = boardArr[landingRowIdx][landingColIdx];

          if (
            victimPiece &&
            victimPiece.color !== pieceColorVal &&
            !landingCell
          ) {
            validMovesList.push({
              fromRow: r,
              fromCol: c,
              toRow: landingRowIdx,
              toCol: landingColIdx,
              isCapture: true,
              capturedRow: victimRowIdx,
              capturedCol: victimColIdx,
              king: isKingPiece,
              color: pieceColorVal,
            });
          }
        }
      }
    }

    // 2. GENERATE NON-CAPTURE (PASSIVE) MOVES
    if (isKingPiece) {
      // Long-range flying movement
      for (const [deltaRow, deltaCol] of passiveDirections) {
        for (let dist = 1; dist < BOARD_SIZE; dist++) {
          const targetRowIdx = r + deltaRow * dist;
          const targetColIdx = c + deltaCol * dist;

          if (
            targetRowIdx < 0 ||
            targetRowIdx >= BOARD_SIZE ||
            targetColIdx < 0 ||
            targetColIdx >= BOARD_SIZE
          )
            break;

          if (boardArr[targetRowIdx][targetColIdx]) break; // Path blocked

          validMovesList.push({
            fromRow: r,
            fromCol: c,
            toRow: targetRowIdx,
            toCol: targetColIdx,
            isCapture: false,
            king: isKingPiece,
            color: pieceColorVal,
          });
        }
      }
    } else {
      // Regular Pawn stepping
      for (const [deltaRow, deltaCol] of passiveDirections) {
        const targetRowIdx = r + deltaRow;
        const targetColIdx = c + deltaCol;

        if (
          targetRowIdx >= 0 &&
          targetRowIdx < BOARD_SIZE &&
          targetColIdx >= 0 &&
          targetColIdx < BOARD_SIZE &&
          !boardArr[targetRowIdx][targetColIdx]
        ) {
          validMovesList.push({
            fromRow: r,
            fromCol: c,
            toRow: targetRowIdx,
            toCol: targetColIdx,
            isCapture: false,
            king: isKingPiece,
            color: pieceColorVal,
          });
        }
      }
    }

    return validMovesList;
  },

  /**
   * Apply a move to a board array state and return a new updated board state.
   * Handles piece displacement, capture removal, and King promotion.
   *
   * @param {Array} boardArr - The current board array
   * @param {Object} moveObj - The move to apply
   * @returns {Array} The new board state array
   */
  applyMoveToBoard(boardArr, moveObj) {
    const updatedBoard = this.copyBoardState(boardArr);

    // Relocate the moving piece
    const movingPieceData = updatedBoard[moveObj.fromRow][moveObj.fromCol];
    updatedBoard[moveObj.toRow][moveObj.toCol] = movingPieceData;
    updatedBoard[moveObj.fromRow][moveObj.fromCol] = null;

    // Remove captured pieces from the board
    if (moveObj.isCapture) {
      if (moveObj.capturedPieces && Array.isArray(moveObj.capturedPieces)) {
        for (const coordKey of moveObj.capturedPieces) {
          const [victimRow, victimCol] = coordKey.split(",").map(Number);
          updatedBoard[victimRow][victimCol] = null;
        }
      } else if (
        moveObj.capturedRow !== undefined &&
        moveObj.capturedCol !== undefined
      ) {
        updatedBoard[moveObj.capturedRow][moveObj.capturedCol] = null;
      }
    }

    // Handle potential King promotion
    if (movingPieceData) {
      const isBlackPromoting =
        moveObj.toRow === BOARD_SIZE - 1 && movingPieceData.color === "black";
      const isRedPromoting =
        moveObj.toRow === 0 && movingPieceData.color === "red";

      if ((isBlackPromoting || isRedPromoting) && !movingPieceData.king) {
        movingPieceData.king = true;
      }
    }

    return updatedBoard;
  },

  /**
   * Create a deep copy of a board state array.
   *
   * @param {Array} sourceBoard - The board to clone
   * @returns {Array} The cloned board array
   */
  copyBoardState(sourceBoard) {
    const clonedBoardArr = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      clonedBoardArr[r] = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (sourceBoard[r][c]) {
          clonedBoardArr[r][c] = { ...sourceBoard[r][c] };
        } else {
          clonedBoardArr[r][c] = null;
        }
      }
    }
    return clonedBoardArr;
  },

  /**
   * Scrape the current visual DOM state of the board and convert it into a data array.
   *
   * @returns {Array} 2D array representing the current game board
   */
  getCurrentBoardState() {
    const virtualBoardArr = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      virtualBoardArr[r] = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const domPieceElement = this.getPieceAt(r, c);
        if (domPieceElement) {
          virtualBoardArr[r][c] = {
            color: domPieceElement.dataset.color,
            king: domPieceElement.dataset.king === "true",
          };
        } else {
          virtualBoardArr[r][c] = null;
        }
      }
    }
    return virtualBoardArr;
  },

  /**
   * Determine if a game has reached a terminal state (win/loss/draw) on a specific board.
   *
   * @param {Array} boardArr - The board state to evaluate
   * @returns {string} 'ongoing', 'black', 'red', or 'draw'
   */
  checkGameEndOnBoard(boardArr) {
    let blackRemainingCount = 0;
    let redRemainingCount = 0;
    let blackKingCount = 0;
    let redKingCount = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const pieceObj = boardArr[r][c];
        if (pieceObj) {
          if (pieceObj.color === "black") {
            blackRemainingCount++;
            if (pieceObj.king) blackKingCount++;
          } else {
            redRemainingCount++;
            if (pieceObj.king) redKingCount++;
          }
        }
      }
    }

    if (blackRemainingCount === 0) return "red";
    if (redRemainingCount === 0) return "black";

    // Standard Draw Condition: Final duel of lone Kings
    if (
      blackRemainingCount === 1 &&
      blackKingCount === 1 &&
      redRemainingCount === 1 &&
      redKingCount === 1
    ) {
      return "draw";
    }

    return "ongoing";
  },

  /**
   * Heuristic fallback for evaluating a non-terminal endgame state in simulations.
   * Compares weighted material balance.
   *
   * @param {Array} boardArr - The board to evaluate
   * @returns {string} 'black', 'red', or 'draw'
   */
  evaluateEndPosition(boardArr) {
    let blackEvaluationVal = 0;
    let redEvaluationVal = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const pieceObj = boardArr[r][c];
        if (pieceObj) {
          const pieceVal = pieceObj.king ? 3 : 1;
          if (pieceObj.color === "black") {
            blackEvaluationVal += pieceVal;
          } else {
            redEvaluationVal += pieceVal;
          }
        }
      }
    }

    // Determine winner based on a significant material advantage threshold
    if (blackEvaluationVal > redEvaluationVal * 1.5) return "black";
    if (redEvaluationVal > blackEvaluationVal * 1.5) return "red";
    return "draw";
  },

  // ═══════════════════════════════════════════════════════════════════
  // EARLY EXIT STRATEGY (Fast rejection for obviously bad moves)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Fast-rejection filter for obviously detrimental moves.
   * Prunes moves that lead to immediate suicide or severe structural damage.
   *
   * @param {Object} moveObj - The move to test
   * @param {Array|null} optionalBoardArr - Optional board override
   * @returns {boolean} True if the move is clearly bad and should be ignored
   */
  shouldRejectMove(moveObj, optionalBoardArr = null) {
    const activeBoardArr = optionalBoardArr || this.getCurrentBoardState();

    // Reject moves that land into a direct capture trap (non-trading)
    if (
      !moveObj.isCapture &&
      this.isPieceUnderAttack(
        this.applyMoveToBoard(activeBoardArr, moveObj),
        moveObj.toRow,
        moveObj.toCol,
        "black"
      )
    ) {
      return true;
    }

    // Reject premature back-rank abandonment in early/mid game
    const totalPieceCount = this.countPieces(activeBoardArr);
    if (
      moveObj.fromRow <= 1 &&
      moveObj.toRow > 1 &&
      !moveObj.isCapture &&
      totalPieceCount > 12
    ) {
      return true;
    }

    // Reject moves that isolate pieces or enable large opponent chains
    if (this.wouldIsolatePiece(moveObj) && !moveObj.isCapture) return true;
    if (this.createsOpponentChain(moveObj)) return true;

    return false;
  },

  // Legacy version preserved for compatibility if needed elsewhere
  _shouldRejectMoveOld(move) {
    // LAYER 1: INSTANT REJECTIONS

    // Reject: Moving into direct threat (non-capture)
    if (
      !move.isCapture &&
      this.willBeUnderThreat(move.toRow, move.toCol, move.piece)
    ) {
      return true;
    }

    // Reject: Leaving piece completely isolated
    if (this.wouldIsolatePiece(move) && !move.isCapture) {
      return true;
    }

    // Reject: Abandoning back rank without reason
    if (move.fromRow <= 1 && move.toRow > 3 && !move.isCapture) {
      return true;
    }

    // Reject: Creating capture chain for opponent
    if (this.createsOpponentChain(move)) {
      return true;
    }

    return false;
  },

  // ==================== END MCTS ====================

  /**
   * Main entry point for the AI to find its next best move.
   * Initializes search metadata, adapts weights, and triggers the iterative deepening search.
   * Fallbacks to safe-move evaluation if the search result looks risky.
   *
   * @returns {Promise<Object|null>} The selected move object
   */
  async findBestMove() {
    try {
      this.initZobrist();
      this.transpositionTable.clear();
      this.historyTable = {};
      this.killerMoves = Array(20)
        .fill(null)
        .map(() => []);

      this.nodesCached = 0;
      this.cacheHits = 0;
      this.totalNodes = 0;

      const currentBoardArr = this.getCurrentBoardState();
      this.adaptWeights(); // Update strategic weights based on current state

      const rawLegalMoves = this.getAllMovesForBoard(currentBoardArr, "black");
      if (rawLegalMoves.length === 1) return rawLegalMoves[0];

      // SEARCH PHASE: Iterative Deepening with Alpha-Beta
      let timeLimit = 3500;
      let boardForAnalysis = currentBoardArr;

      // Endgame refinement: Increase search precision when pieces are low
      let piecesLeft = 0;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++)
          if (boardForAnalysis[r][c]) piecesLeft++;
      }

      if (piecesLeft <= 10) timeLimit = 6000;
      else if (piecesLeft <= 16) timeLimit = 4500;

      const bestMoveFromSearch = await this.iterativeDeepeningSearch(
        currentBoardArr,
        "black",
        timeLimit,
        rawLegalMoves
      );

      if (bestMoveFromSearch) {
        // ENHANCED SAFETY VERIFICATION: Check for total material preservation
        const initialMaterial = this.calculateTotalMaterial(
          currentBoardArr,
          "black"
        );
        const projectedBoard = this.applyMoveToBoard(
          currentBoardArr,
          bestMoveFromSearch
        );

        // Use a deeper 1-ply tactical check for the opponent's response
        const opponentColor = "red";
        const opponentResponses = this.getAllMovesForBoard(
          projectedBoard,
          opponentColor
        );

        let fatalContinuationFound = false;
        for (const response of opponentResponses) {
          const finalState = this.applyMoveToBoard(projectedBoard, response);
          const finalMaterial = this.calculateTotalMaterial(
            finalState,
            "black"
          );

          if (finalMaterial < initialMaterial) {
            fatalContinuationFound = true;
            break;
          }
        }

        if (fatalContinuationFound && !bestMoveFromSearch.isCapture) {
          // If search result leads to material loss, manually pick the safest possible position
          let optimalSafeMove = null;
          let maxSafeHeuristicScore = -Infinity;

          for (const moveOption of rawLegalMoves) {
            await new Promise((resolve) => setTimeout(resolve, 0));

            // A move is considered "defensively sound" if it doesn't immediately lead to piece loss
            const pBoard = this.applyMoveToBoard(currentBoardArr, moveOption);
            const oMoves = this.getAllMovesForBoard(pBoard, opponentColor);

            let isSafe = true;
            for (const oMove of oMoves) {
              const fState = this.applyMoveToBoard(pBoard, oMove);
              if (
                this.calculateTotalMaterial(fState, "black") < initialMaterial
              ) {
                isSafe = false;
                break;
              }
            }

            if (isSafe || moveOption.isCapture) {
              const score = this.evaluatePositionEnhanced(pBoard, "black");
              if (score > maxSafeHeuristicScore) {
                maxSafeHeuristicScore = score;
                optimalSafeMove = moveOption;
              }
            }
          }

          if (optimalSafeMove) return optimalSafeMove;
        }

        return bestMoveFromSearch;
      } else {
        // Fallback if search fails
        return rawLegalMoves.length > 0 ? rawLegalMoves[0] : null;
      }
    } catch (searchError) {
      console.error("AI Search Error:", searchError);
      const fallbackBoard = this.getCurrentBoardState();
      const fallbackMoves = this.getAllMovesForBoard(fallbackBoard, "black");
      return fallbackMoves.length > 0 ? fallbackMoves[0] : null;
    }
  },

  /**
   * @param {Array|null} startingMovesList - Optional predefined move list
   * @returns {Promise<Object|null>} The best move found
   */
  async iterativeDeepeningSearch(
    boardState,
    playerColor,
    searchTimeLimit,
    startingMovesList = null
  ) {
    const searchStartTime = Date.now();
    let globalBestMove = null;
    let currentSearchDepth = 1;
    const absoluteMaxDepth = 20;

    let movesToSearch =
      startingMovesList || this.getAllMovesForBoard(boardState, playerColor);
    if (movesToSearch.length === 0) return null;
    if (movesToSearch.length === 1) return movesToSearch[0];

    // Priority move selection (captures take precedence)
    const tacticalCaptures = movesToSearch.filter((m) => m.isCapture);
    const primaryCandidateList =
      tacticalCaptures.length > 0 ? tacticalCaptures : movesToSearch;
    if (primaryCandidateList.length === 1) return primaryCandidateList[0];

    while (
      Date.now() - searchStartTime < searchTimeLimit &&
      currentSearchDepth <= absoluteMaxDepth
    ) {
      this.currentSearchDepth = currentSearchDepth;
      let alphaVal = -1000000;
      let betaVal = 1000000;

      // Move Re-ordering: Best move from previous iteration and captures go first
      primaryCandidateList.sort((moveA, moveB) => {
        if (
          globalBestMove &&
          moveA.fromRow === globalBestMove.fromRow &&
          moveA.toRow === globalBestMove.toRow &&
          moveA.fromCol === globalBestMove.fromCol &&
          moveA.toCol === globalBestMove.toCol
        )
          return -1;

        if (moveB.isCapture && !moveA.isCapture) return 1;
        if (moveA.isCapture && !moveB.isCapture) return -1;
        return 0;
      });

      let iterationBestMove = null;
      let iterationBestScore = -Infinity;

      for (const currentMove of primaryCandidateList) {
        const projectedBoardArr = this.applyMoveToBoard(
          boardState,
          currentMove
        );
        const searchScoreValue = -this.minimax(
          projectedBoardArr,
          currentSearchDepth - 1,
          -betaVal,
          -alphaVal,
          playerColor === "black" ? "red" : "black"
        );

        // Apply heuristic pattern-based learning adjustments
        const patternAdjustBonus = this.evaluateLearnedPatterns(currentMove);
        const adjustedFinalScore = searchScoreValue + patternAdjustBonus;

        if (adjustedFinalScore > iterationBestScore) {
          iterationBestScore = adjustedFinalScore;
          iterationBestMove = currentMove;
        }

        alphaVal = Math.max(alphaVal, adjustedFinalScore);
        if (Date.now() - searchStartTime > searchTimeLimit) break;
      }

      if (Date.now() - searchStartTime <= searchTimeLimit) {
        globalBestMove = iterationBestMove;
        if (globalBestMove) globalBestMove.score = iterationBestScore;
        currentSearchDepth++;
      }
    }

    return globalBestMove;
  },

  /**
   * Recursive Minimax search with Alpha-Beta Pruning, Transposition Table, and Tactical Enhancements.
   * Explores the game tree to determine the optimal score for the current player.
   *
   * @param {Array} boardArr - The board state array
   * @param {number} depthLimit - Remaining levels to search
   * @param {number} alphaVal - The lower bound of the score range
   * @param {number} betaVal - The upper bound of the score range
   * @param {string} activeColor - The color of the player whose turn it is
   * @returns {number} The evaluation score of the position
   */
  minimax(boardArr, depthLimit, alphaVal, betaVal, activeColor) {
    const originalAlphaVal = alphaVal;
    const boardHashKey = this.getZobristHash(boardArr, activeColor);

    this.totalNodes++;

    // 1. TRANSPOSITION TABLE LOOKUP (Optimization)
    if (this.transpositionTable.has(boardHashKey)) {
      const cachedEntry = this.transpositionTable.get(boardHashKey);
      if (cachedEntry.depth >= depthLimit) {
        this.cacheHits++;
        if (cachedEntry.type === 0) return cachedEntry.score; // Exact score found
        if (cachedEntry.type === 1 && cachedEntry.score >= betaVal)
          return betaVal; // Lower bound (Beta)
        if (cachedEntry.type === 2 && cachedEntry.score <= alphaVal)
          return alphaVal; // Upper bound (Alpha)
      }
    }

    // --- NULL MOVE PRUNING ---
    // Heuristic: If we are at significant depth and passing the turn is still safe (score >= beta),
    // we can assume the branch is overwhelmingly strong and avoid searching it further.
    if (depthLimit >= 3 && !this.isInEndgame(boardArr)) {
      const opponentColor = activeColor === "black" ? "red" : "black";
      const nullMoveScore = -this.minimax(
        boardArr,
        depthLimit - 3,
        -betaVal,
        -betaVal + 1,
        opponentColor
      );
      if (nullMoveScore >= betaVal) return betaVal;
    }

    // 2. TERMINAL STATE CHECKS
    const gameStateTag = this.checkGameEndOnBoard(boardArr);
    if (gameStateTag === "black") {
      return activeColor === "black"
        ? 1000000000 + depthLimit
        : -1000000000 - depthLimit;
    }
    if (gameStateTag === "red") {
      return activeColor === "red"
        ? 1000000000 + depthLimit
        : -1000000000 - depthLimit;
    }
    if (gameStateTag === "draw") return 0;

    // 3. BASE CASE: DEPTH REACHED
    if (depthLimit <= 0) {
      return this.quiescenceSearch(boardArr, alphaVal, betaVal, activeColor);
    }

    // 4. GENERATE AND ORCHESTRATE MOVES
    const availableMoves = this.getAllMovesForBoard(boardArr, activeColor);
    if (availableMoves.length === 0) return -1000000000; // No moves = Loss in Draughts

    // Forced capture rule: pieces must jump if possible
    const captureMoves = availableMoves.filter((m) => m.isCapture);
    const candidateMovesList =
      captureMoves.length > 0 ? captureMoves : availableMoves;

    // Move Ordering Strategy: Hash Move -> Captures -> Killer Moves -> History Heuristic
    const ttEntryRef = this.transpositionTable.get(boardHashKey);
    const priorityHashMove = ttEntryRef ? ttEntryRef.bestMove : null;
    const currentKillerMoves = this.killerMoves[depthLimit] || [];

    candidateMovesList.sort((moveA, moveB) => {
      // Priority 1: Best move from the Transposition Table
      if (priorityHashMove) {
        const isAMatch =
          moveA.fromRow === priorityHashMove.fromRow &&
          moveA.toRow === priorityHashMove.toRow &&
          moveA.fromCol === priorityHashMove.fromCol &&
          moveA.toCol === priorityHashMove.toCol;
        const isBMatch =
          moveB.fromRow === priorityHashMove.fromRow &&
          moveB.toRow === priorityHashMove.toRow &&
          moveB.fromCol === priorityHashMove.fromCol &&
          moveB.toCol === priorityHashMove.toCol;
        if (isAMatch) return -1;
        if (isBMatch) return 1;
      }

      // Priority 2: Standard Capture Moves (already filtered if captures exist, but good for sorting within non-captures if mixed)
      if (moveB.isCapture && !moveA.isCapture) return 1;
      if (moveA.isCapture && !moveB.isCapture) return -1;

      // Priority 3: Killer Moves (moves that caused a beta-cutoff in other branches at this depth)
      const isMoveAKiller = currentKillerMoves.some(
        (m) =>
          m.fromRow === moveA.fromRow &&
          m.toRow === moveA.toRow &&
          m.fromCol === moveA.fromCol &&
          m.toCol === moveA.toCol
      );
      const isMoveBKiller = currentKillerMoves.some(
        (m) =>
          m.fromRow === moveB.fromRow &&
          m.toRow === moveB.toRow &&
          m.fromCol === moveB.fromCol &&
          m.toCol === moveB.toCol
      );
      if (isMoveAKiller && !isMoveBKiller) return -1;
      if (isMoveBKiller && !isMoveAKiller) return 1;

      // Priority 4: History Heuristic (moves that were historically good)
      const keyStrA = `${moveA.fromRow},${moveA.fromCol},${moveA.toRow},${moveA.toCol}`;
      const keyStrB = `${moveB.fromRow},${moveB.fromCol},${moveB.toRow},${moveB.toCol}`;
      return (
        (this.historyTable[keyStrB] || 0) - (this.historyTable[keyStrA] || 0)
      );
    });

    let highestBranchScore = -Infinity;
    let optimalBranchMove = null;
    let sequenceIndex = 0;

    for (const moveIter of candidateMovesList) {
      const nextBoardArr = this.applyMoveToBoard(boardArr, moveIter);
      const nextPlayerColor = activeColor === "black" ? "red" : "black";
      let resultingScore;

      // --- LATE MOVE REDUCTION (LMR) ---
      // Search suspected weak moves at shallow depth to save time
      const isStaticMove = !moveIter.isCapture && !moveIter.isPromotion;
      if (sequenceIndex >= 4 && depthLimit >= 3 && isStaticMove) {
        resultingScore = -this.minimax(
          nextBoardArr,
          depthLimit - 2,
          -(alphaVal + 1),
          -alphaVal,
          nextPlayerColor
        );
        if (resultingScore > alphaVal) {
          // Re-search at full depth if the reduced search hints at a good move
          resultingScore = -this.minimax(
            nextBoardArr,
            depthLimit - 1,
            -betaVal,
            -alphaVal,
            nextPlayerColor
          );
        }
      } else {
        resultingScore = -this.minimax(
          nextBoardArr,
          depthLimit - 1,
          -betaVal,
          -alphaVal,
          nextPlayerColor
        );
      }

      sequenceIndex++;
      if (resultingScore > highestBranchScore) {
        highestBranchScore = resultingScore;
        optimalBranchMove = moveIter;
      }

      alphaVal = Math.max(alphaVal, resultingScore);

      // ALPHA-BETA CUTOFF (PRUNING)
      if (alphaVal >= betaVal) {
        if (!moveIter.isCapture) {
          // Record Killer Move and update History table
          const killerStore = this.killerMoves[depthLimit];
          if (
            !killerStore.some(
              (m) =>
                m.fromRow === moveIter.fromRow &&
                m.toRow === moveIter.toRow &&
                m.fromCol === moveIter.fromCol &&
                m.toCol === moveIter.toCol
            )
          ) {
            killerStore.unshift(moveIter);
            if (killerStore.length > 2) killerStore.pop();
          }
          const historyKeyStr = `${moveIter.fromRow},${moveIter.fromCol},${moveIter.toRow},${moveIter.toCol}`;
          this.historyTable[historyKeyStr] =
            (this.historyTable[historyKeyStr] || 0) + depthLimit * depthLimit;
        }
        break;
      }
    }

    // 5. CACHE RESULT IN TRANSPOSITION TABLE
    let cacheNodeType = 0; // EXACT
    if (highestBranchScore <= originalAlphaVal)
      cacheNodeType = 2; // ALPHA (Upper bound)
    else if (highestBranchScore >= betaVal) cacheNodeType = 1; // BETA (Lower bound)

    this.transpositionTable.set(boardHashKey, {
      score: highestBranchScore,
      depth: depthLimit,
      type: cacheNodeType,
      bestMove: optimalBranchMove,
    });

    return highestBranchScore;
  },

  /**
   * Quiescence search to avoid the "horizon effect" by extending the search through tactical exchanges.
   * Only explores capture chains to find a stable "quiet" position for evaluation.
   *
   * @param {Array} boardArr - The board state array
   * @param {number} alphaVal - The lower bound of the score range
   * @param {number} betaVal - The upper bound of the score range
   * @param {string} playerColor - The color of the player to search for
   * @returns {number} The stable evaluation score
   */
  quiescenceSearch(boardArr, alphaVal, betaVal, playerColor) {
    const boardHashKey = this.getZobristHash(boardArr, playerColor);

    // Transposition Table lookup (optional at this level but useful for depth 0 EXACT matches)
    if (this.transpositionTable.has(boardHashKey)) {
      const cachedEntry = this.transpositionTable.get(boardHashKey);
      if (cachedEntry.depth >= 0 && cachedEntry.type === 0)
        return cachedEntry.score;
    }

    // "Stand-pat" score: The evaluation of the current position if no more captures are made
    const evaluationValue = this.evaluatePositionEnhanced(
      boardArr,
      playerColor
    );
    if (evaluationValue >= betaVal) return betaVal;
    if (alphaVal < evaluationValue) alphaVal = evaluationValue;

    // Explore ONLY capture moves to reach tactical stability
    const allMoves = this.getAllMovesForBoard(boardArr, playerColor);
    const tacticalCaptures = allMoves.filter((m) => m.isCapture);

    for (const captureMove of tacticalCaptures) {
      const boardAfterCapture = this.applyMoveToBoard(boardArr, captureMove);
      const resultingScore = -this.quiescenceSearch(
        boardAfterCapture,
        -betaVal,
        -alphaVal,
        playerColor === "black" ? "red" : "black"
      );

      if (resultingScore >= betaVal) return betaVal;
      if (resultingScore > alphaVal) alphaVal = resultingScore;
    }

    return alphaVal;
  },

  /**
   * Enhanced heuristic evaluation of a board position.
   * This is the heart of the AI's strategic judgment, combining material,
   * safety, positional advancement, and defensive formation bonuses.
   *
   * @param {Array} board - 10x10 board array
   * @param {string} color - The color whose position is being evaluated
   * @returns {number} The total heuristic score
   */
  evaluatePositionEnhanced(board, color) {
    let score = 0;

    // Select the best available weights
    const weights =
      this.weights && Object.keys(this.weights).length > 0
        ? this.weights
        : this.baseWeights;

    // --- PHASE 1: MATERIAL & GROUP ANALYSIS ---
    let blackRows = 0,
      blackCount = 0,
      maxBlackRow = 0; // Most advanced black row (Black moves 0 -> 9)
    let redRows = 0,
      redCount = 0,
      minRedRow = BOARD_SIZE - 1; // Most advanced red row (Red moves 9 -> 0)

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (p) {
          if (p.color === "black") {
            blackRows += r;
            blackCount++;
            if (r > maxBlackRow) maxBlackRow = r;
          } else {
            redRows += r;
            redCount++;
            if (r < minRedRow) minRedRow = r;
          }
        }
      }
    }
    const avgBlackRow = blackCount > 0 ? blackRows / blackCount : 0;
    const avgRedRow = redCount > 0 ? redRows / redCount : BOARD_SIZE - 1;

    // Calculate Dispersion (Spread)
    let blackSpread = 0,
      redSpread = 0;
    if (blackCount > 0 || redCount > 0) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const p = board[r][c];
          if (p) {
            if (p.color === "black") blackSpread += Math.abs(r - avgBlackRow);
            else redSpread += Math.abs(r - avgRedRow);
          }
        }
      }
    }
    // Minimal spread penalty - pieces should be able to spread out
    if (color === "black" && blackCount > 0) {
      score -= (blackSpread / blackCount) * (weights.groupSpreadPenalty || 5);
    } else if (redCount > 0) {
      score -= (redSpread / redCount) * (weights.groupSpreadPenalty || 5);
    }

    // Pre-calculate hash once for the whole board
    const nodeHash = this.getPositionHash(board);
    const hasOpeningBook =
      this.memory.openingBook && this.memory.openingBook.has(nodeHash);

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];

        // --- EMPTY SQUARE ANALYSIS ---
        if (!piece) continue;

        // Apply patterns from memory (Opening Book)
        if (hasOpeningBook) {
          score += piece.color === color ? 50 : -50;
        }

        const isCurrentPlayer = piece.color === color;
        const isKing = piece.king;

        // Base Material Value
        let pieceValue = isKing ? weights.king : weights.material;

        // --- SAFETY & TACTICS (ABSOLUTE) ---
        const isUnderAttack = this.isPieceUnderAttack(
          board,
          row,
          col,
          piece.color
        );
        if (isUnderAttack) {
          // ANY threat is treated as material loss - even if protected
          pieceValue -= weights.selfDanger;

          // Kings under long-range threat are extreme priority
          if (isKing) pieceValue -= weights.kingEndangerPenalty;
        }

        // --- KING PROTECTION BONUS ---
        if (isKing && isCurrentPlayer) {
          // Check if king is protected by friendly pieces
          const protectionCount = this.countKingProtectors(
            board,
            row,
            col,
            piece.color
          );
          if (protectionCount > 0) {
            pieceValue += weights.kingProtection * protectionCount;
          }

          // Penalize exposed kings (no protection and can be attacked)
          if (protectionCount === 0 && isUnderAttack) {
            pieceValue -= weights.kingExposurePenalty;
          }
        }

        // --- POSITIONAL BONUSES ---
        if (!isKing) {
          // Encourage advancement toward promotion
          const advanceRow =
            piece.color === "black" ? row : BOARD_SIZE - 1 - row;

          // Reward forward progress
          pieceValue += advanceRow * weights.advancement;

          // PROMOTION RUSH: Black pieces at row 7+ should prioritize promoting
          if (piece.color === "black" && row >= 7 && !isUnderAttack) {
            pieceValue += weights.promotionRush;

            // EXTREME bonus for being at row 8 (One step away)
            if (row === 8) {
              pieceValue += weights.promotionRush * 3.0; // Total 4x promotionRush
            }
          }

          // Bonus for being close to promotion (general case)
          if (piece.color === "black" && row >= BOARD_SIZE - 2) {
            pieceValue += weights.nearPromotion;
          } else if (piece.color === "red" && row <= 1) {
            pieceValue += weights.nearPromotion;
          }

          // Center control (moderate bonus)
          if (row >= 3 && row <= 6 && col >= 3 && col <= 6) {
            pieceValue += weights.center;
          }

          // Edge pieces are slightly safer
          if (col === 0 || col === BOARD_SIZE - 1)
            pieceValue += weights.edgeSafety;

          // --- DYNAMIC BACK RANK DECAY ---
          // "decrease value compare to pieces at the front or on the move"
          if (piece.color === "black" && row <= 1) {
            const frontLineCount = blackCount - evaluateBackRankStrength();
            const decayFactor =
              frontLineCount > 4 ? weights.backRankDecayRate || 0.5 : 1.0;
            pieceValue += weights.backRankDefense * decayFactor;
          }
          if (piece.color === "red" && row >= BOARD_SIZE - 2) {
            pieceValue += weights.backRankDefense; // Red (opponent) back rank stays high
          }

          // --- ATTACK ZONE BONUS (Rows 7/8) ---
          // "the same pieces btween 7/8 opponent position increase value"
          if (piece.color === "black" && (row === 7 || row === 8)) {
            pieceValue += weights.attackZoneBonus || 50000;
          }

          // --- MOBILITY ANALYSIS ---
          // "pieces that are stuck... decrease value"
          const hasMobility = this.checkPieceMobilitySimplified(
            board,
            row,
            col,
            piece
          );
          if (!hasMobility && !isUnderAttack) {
            // Only penalize if not already under attack (to avoid double penalty)
            pieceValue -= weights.stuckPiecePenalty || 30000;
          }

          // --- TEAM ADVANCEMENT (WALL FORMAT) ---
          if (piece.color === "black" && !isKing) {
            // 1. Front-Line Solidarity: Reward being part of the leading group
            const distToFront = maxBlackRow - row;
            if (distToFront <= 1) {
              pieceValue += weights.frontLineSolidarityBonus;
            }

            // 2. Isolation Lockdown: Massive penalty for "going rogue"
            // Find nearest teammate
            let minTeammateDist = 10;
            for (let rMatch = 0; rMatch < BOARD_SIZE; rMatch++) {
              for (let cMatch = 0; cMatch < BOARD_SIZE; cMatch++) {
                if (rMatch === row && cMatch === col) continue;
                const other = board[rMatch][cMatch];
                if (other && other.color === "black") {
                  const d = Math.abs(rMatch - row);
                  if (d < minTeammateDist) minTeammateDist = d;
                }
              }
            }
            if (minTeammateDist > 2) {
              pieceValue -= weights.isolationLockdownPenalty;
            }
          }

          // --- COHESION & DEFENSIVE FORMATION ---
          let neighbors = 0;
          let sideBySideNeighbors = 0;
          const searchDirections = [
            [0, -2],
            [0, 2], // Side-by-side (on same row squares)
            [1, -1],
            [1, 1],
            [-1, -1],
            [-1, 1], // Diagonal
          ];
          for (const [deltaRow, deltaCol] of searchDirections) {
            const neighborRow = row + deltaRow,
              neighborCol = col + deltaCol;
            if (
              neighborRow >= 0 &&
              neighborRow < BOARD_SIZE &&
              neighborCol >= 0 &&
              neighborCol < BOARD_SIZE
            ) {
              const neighbor = board[neighborRow][neighborCol];
              if (neighbor && neighbor.color === piece.color) {
                neighbors++;
                if (deltaRow === 0) sideBySideNeighbors++;
              }
            }
          }
          // Add cohesion and phalanx alignment bonuses
          if (neighbors > 0) {
            pieceValue += neighbors * weights.cohesion;
            pieceValue +=
              (neighbors + sideBySideNeighbors) * weights.phalanxAlignmentBonus;
          }

          // --- GROUP ADVANCEMENT (PHALANX LOGIC) ---
          const distanceToGroup =
            piece.color === "black" ? row - avgBlackRow : avgRedRow - row;

          if (distanceToGroup > 1.0) {
            // Heavily penalize lone pieces ahead of the group
            pieceValue -= weights.lonePiecePenalty * distanceToGroup;
          } else if (distanceToGroup < -1.0) {
            // Reward pieces that are behind - encourages backfilling
            pieceValue += weights.phalanxBonus;
          } else {
            // Piece is aligned with the phalanx
            pieceValue += weights.phalanxBonus;
          }
        } else {
          // King centrality
          if (row >= 3 && row <= 6 && col >= 3 && col <= 6)
            pieceValue += weights.center * 2;
        }

        // --- OFFENSIVE PRESSURE ---
        // Reward moves that create new immediate threats
        const threatsDetected = this.countThreatsEnhanced(
          board,
          row,
          col,
          piece
        );
        if (threatsDetected > 0) {
          pieceValue += threatsDetected * (weights.threatCreation || 2000);
        }

        if (isCurrentPlayer) score += pieceValue;
        else score -= pieceValue;
      }
    }

    return score;
  },

  /**
   * Determine if a piece at a specific location is under immediate capture threat.
   * Accounts for both regular pieces and long-range "Flying King" threats.
   *
   * @param {Array} boardArr - The current board state array
   * @param {number} r - Row index of the piece
   * @param {number} c - Column index of the piece
   * @param {string} pieceColor - Color of the piece being checked
   * @returns {boolean} True if an opponent can capture this piece next turn
   */
  isPieceUnderAttack(boardArr, r, c, pieceColor) {
    const opponentColorVal = pieceColor === "black" ? "red" : "black";
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of tacticalDirections) {
      // For a piece to be captured, an attacker must jump over (r, c) and land on an empty square.
      const landingRowIdx = r + deltaRow;
      const landingColIdx = c + deltaCol;

      // Check if landing square is within bounds and reachable
      const isLandingInBounds =
        landingRowIdx >= 0 &&
        landingRowIdx < BOARD_SIZE &&
        landingColIdx >= 0 &&
        landingColIdx < BOARD_SIZE;

      if (isLandingInBounds && !boardArr[landingRowIdx][landingColIdx]) {
        // Landing square is unoccupied. Now look for an attacker in the opposite direction along the same diagonal.
        for (let searchDist = 1; searchDist < BOARD_SIZE; searchDist++) {
          const checkRowIdx = r - deltaRow * searchDist;
          const checkColIdx = c - deltaCol * searchDist;

          // Stay within board limits
          if (
            checkRowIdx < 0 ||
            checkRowIdx >= BOARD_SIZE ||
            checkColIdx < 0 ||
            checkColIdx >= BOARD_SIZE
          )
            break;

          const potentialAttacker = boardArr[checkRowIdx][checkColIdx];
          if (potentialAttacker) {
            if (potentialAttacker.color === opponentColorVal) {
              // Standard pieces: jump only from distance 1.
              // Flying Kings: can jump from any distance along the diagonal.
              if (potentialAttacker.king || searchDist === 1) {
                return true;
              }
            }
            // Any piece (friend or foe) blocks the diagonal line of attack for a Flying King.
            break;
          }
        }
      }
    }
    return false;
  },

  /**
   * Count how many friendly pieces are providing defensive support to a king.
   * Proximity and diagonal alignment contribute to the king's defensive integrity.
   *
   * @param {Array} boardArr - The current board state array
   * @param {number} kRow - Row index of the king
   * @param {number} kCol - Column index of the king
   * @param {string} kingColorVal - Color of the king
   * @returns {number} The total calculated protection score
   */
  countKingProtectors(boardArr, kRow, kCol, kingColorVal) {
    let totalProtectionPoints = 0;
    const searchDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of searchDirections) {
      // Priority 1: Direct support from immediate neighbors
      const neighborRow = kRow + deltaRow;
      const neighborCol = kCol + deltaCol;

      if (
        neighborRow >= 0 &&
        neighborRow < BOARD_SIZE &&
        neighborCol >= 0 &&
        neighborCol < BOARD_SIZE
      ) {
        const neighborPiece = boardArr[neighborRow][neighborCol];
        if (neighborPiece && neighborPiece.color === kingColorVal) {
          totalProtectionPoints++;
        }
      }

      // Priority 2: Secondary support from pieces further along the diagonal (blocking lines of fire)
      for (let dist = 2; dist <= 3; dist++) {
        const distRow = kRow + deltaRow * dist;
        const distCol = kCol + deltaCol * dist;

        if (
          distRow >= 0 &&
          distRow < BOARD_SIZE &&
          distCol >= 0 &&
          distCol < BOARD_SIZE
        ) {
          const supportPiece = boardArr[distRow][distCol];
          if (supportPiece) {
            if (supportPiece.color === kingColorVal) {
              totalProtectionPoints += 0.5; // Distant pieces provide half the defensive weight
            }
            // Stop checking further in this direction if any piece is encounter (it masks the threat)
            break;
          }
        }
      }
    }

    return Math.floor(totalProtectionPoints);
  },

  /**
   * Evaluates the offensive potential of a piece by counting immediate capture opportunities it creates.
   * Accounts for multi-direction jumping for standard pieces and long-range jumping for kings.
   *
   * @param {Array} boardArr - The current board state array
   * @param {number} r - Row index of the piece
   * @param {number} c - Column index of the piece
   * @param {Object} pieceObj - The piece being evaluated
   * @returns {number} The number of distinct capture threats detected
   */
  countThreatsEnhanced(boardArr, r, c, pieceObj) {
    let totalThreatCount = 0;
    const isKingPiece = pieceObj.king;
    const opponentColorVal = pieceObj.color === "black" ? "red" : "black";
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    if (!isKingPiece) {
      // Standard Piece: Restricted to immediate neighboring jumps
      for (const [deltaRow, deltaCol] of tacticalDirections) {
        const victimRowIdx = r + deltaRow;
        const victimColIdx = c + deltaCol;
        const landingRowIdx = r + deltaRow * 2;
        const landingColIdx = c + deltaCol * 2;

        const isLandingInBounds =
          landingRowIdx >= 0 &&
          landingRowIdx < BOARD_SIZE &&
          landingColIdx >= 0 &&
          landingColIdx < BOARD_SIZE;

        if (isLandingInBounds) {
          const victimPiece = boardArr[victimRowIdx][victimColIdx];
          const isLandingEmpty = !boardArr[landingRowIdx][landingColIdx];

          if (
            victimPiece &&
            victimPiece.color === opponentColorVal &&
            isLandingEmpty
          ) {
            totalThreatCount++;
          }
        }
      }
    } else {
      // Flying King: Can leap over long distances to capture an enemy
      for (const [deltaRow, deltaCol] of tacticalDirections) {
        let enemySpottedOnDiagonal = false;

        for (let searchDist = 1; searchDist < BOARD_SIZE; searchDist++) {
          const checkRowIdx = r + deltaRow * searchDist;
          const checkColIdx = c + deltaCol * searchDist;

          if (
            checkRowIdx < 0 ||
            checkRowIdx >= BOARD_SIZE ||
            checkColIdx < 0 ||
            checkColIdx >= BOARD_SIZE
          )
            break;

          const pieceOnPath = boardArr[checkRowIdx][checkColIdx];

          if (!enemySpottedOnDiagonal) {
            if (pieceOnPath) {
              if (pieceOnPath.color === pieceObj.color) break; // Path is blocked by a friendly piece
              if (pieceOnPath.color === opponentColorVal)
                enemySpottedOnDiagonal = true; // Target identified
            }
          } else {
            // After spotting an enemy, the very next square must be empty to complete the jump
            if (pieceOnPath) break; // Path is blocked immediately after the enemy piece

            // Valid capture landing found
            totalThreatCount++;
            break; // Stop searching this direction once a capture is validated
          }
        }
      }
    }

    return totalThreatCount;
  },

  // Helper: Detect endgame phase
  isInEndgame(board) {
    let pieces = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) if (board[r][c]) pieces++;
    }
    return pieces <= 10; // Synchronized threshold
  },

  /**
   * Helper: Calculate total material value for a player on a board state.
   *
   * @param {Array} boardArr - The board state
   * @param {string} color - Player color
   * @returns {number} Count of pieces (Kings weighted slightly higher for safety checks)
   */
  calculateTotalMaterial(boardArr, color) {
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = boardArr[r][c];
        if (piece && piece.color === color) {
          count += piece.king ? 1.5 : 1;
        }
      }
    }
    return count;
  },

  /**
   * Fast check for piece mobility without generating full move objects.
   *
   * @param {Array} board - Board state
   * @param {number} r - Row
   * @param {number} c - Col
   * @param {Object} piece - Piece object
   * @returns {boolean} True if the piece can make at least one legal move or capture
   */
  checkPieceMobilitySimplified(board, r, c, piece) {
    const directions = piece.king
      ? [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]
      : piece.color === "black"
      ? [
          [1, -1],
          [1, 1],
        ]
      : [
          [-1, -1],
          [-1, 1],
        ];

    // 1. Check for standard moves
    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
        if (!board[nr][nc]) return true; // Can move to empty square
      }
    }

    // 2. Check for captures (all pieces can jump any direction)
    const jumpDirs = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of jumpDirs) {
      const victimR = r + dr;
      const victimC = c + dc;
      const landR = r + dr * 2;
      const landC = c + dc * 2;

      if (
        landR >= 0 &&
        landR < BOARD_SIZE &&
        landC >= 0 &&
        landC < BOARD_SIZE
      ) {
        const victim = board[victimR][victimC];
        if (victim && victim.color !== piece.color && !board[landR][landC])
          return true;
      }
    }

    return false; // No immediate moves found
  },

  // TACTICAL EVALUATION - No randomness, pure calculation
  /**
   * Evaluates the immediate tactical benefits or penalties of a specific move.
   * Focuses on captures, multi-capture potential, and promotion safety.
   *
   * @param {Object} moveObj - The move object to evaluate
   * @returns {number} The calculated tactical score
   */
  evaluateTactical(moveObj) {
    let tacticalEvaluationScore = 0;

    // --- CAPTURE EVALUATION ---
    if (moveObj.isCapture) {
      tacticalEvaluationScore += this.weights.captureBase;

      // Identify total pieces captured (primary and potential chain continuations)
      const currentMoveCaptureCount = this.getTotalCaptureCount(moveObj);

      // MANDATORY MAXIMUM CAPTURE ENFORCEMENT
      const allLegalCaptures = this.getAllMoves("black").filter(
        (m) => m.isCapture
      );
      if (allLegalCaptures.length > 0) {
        const absoluteMaxCapturesValue = Math.max(
          ...allLegalCaptures.map((m) => this.getTotalCaptureCount(m))
        );

        if (currentMoveCaptureCount === absoluteMaxCapturesValue) {
          // Move satisfies the requirement to maximize captures
          tacticalEvaluationScore += 1000;
        } else {
          // Illegal or suboptimal capture sequence
          tacticalEvaluationScore -= 2000;
          return tacticalEvaluationScore;
        }
      }

      // Multi-capture Chain Bonus
      if (moveObj.capturedPieces && moveObj.capturedPieces.length > 1) {
        const chainLengthValue = moveObj.capturedPieces.length;
        tacticalEvaluationScore +=
          (chainLengthValue - 1) * this.weights.multiCaptureBonus;

        // Mastery milestones for long chains
        if (chainLengthValue >= 3) tacticalEvaluationScore += 300;
        if (chainLengthValue >= 4) tacticalEvaluationScore += 500;
      } else if (currentMoveCaptureCount > 1) {
        tacticalEvaluationScore +=
          (currentMoveCaptureCount - 1) * this.weights.multiCaptureBonus;
        if (currentMoveCaptureCount >= 3) tacticalEvaluationScore += 200;
      }

      // Chain potential: rewards moves that setup future tactical opportunities
      tacticalEvaluationScore += this.evaluateMultiCaptureSetup(moveObj);

      // Victim-specific weights (High priority on capturing kings)
      if (moveObj.isKingCapture) {
        tacticalEvaluationScore += this.weights.kingCaptureBonus;
      } else if (moveObj.capturedKingsCount && moveObj.capturedKingsCount > 0) {
        tacticalEvaluationScore +=
          moveObj.capturedKingsCount * this.weights.kingCaptureBonus;
      }

      // Safety Verification: Is the piece landed in a threatened square?
      const isLandingSafe = !this.willBeUnderThreat(
        moveObj.toRow,
        moveObj.toCol,
        moveObj.piece
      );
      if (isLandingSafe) {
        tacticalEvaluationScore += this.weights.safeCaptureBonus;
      } else {
        tacticalEvaluationScore -= 250; // Risky capture
        if (currentMoveCaptureCount > 1) {
          tacticalEvaluationScore += 100; // Multi-captures partially mitigate risk
        }
      }
    }

    // --- PROMOTION POTENTIAL ---
    const isPromotingMove =
      moveObj.toRow === BOARD_SIZE - 1 &&
      moveObj.piece.dataset.color === "black" &&
      moveObj.piece.dataset.king !== "true";

    if (isPromotingMove) {
      tacticalEvaluationScore += this.weights.promotionBonus;

      const isPromotionSafe = !this.willBeUnderThreat(
        moveObj.toRow,
        moveObj.toCol,
        moveObj.piece
      );
      tacticalEvaluationScore += isPromotionSafe ? 200 : -150;
    }

    // --- PROMOTION RUSH (Aggressive advancement for advanced pawns) ---
    const isPassiveAdvance =
      !moveObj.isCapture &&
      moveObj.piece.dataset.color === "black" &&
      moveObj.piece.dataset.king !== "true";

    if (isPassiveAdvance) {
      const startRowIdx = moveObj.fromRow;
      const endRowIdx = moveObj.toRow;

      if (startRowIdx >= 7 && endRowIdx > startRowIdx) {
        tacticalEvaluationScore += this.weights.nearPromotionAdvancement;
        if (startRowIdx === 8) {
          tacticalEvaluationScore += this.weights.promotionRush; // Critical step to 9
        }
      }
    }

    // Secondary tactical checks
    tacticalEvaluationScore += this.evaluateThreatCreation(moveObj);
    tacticalEvaluationScore += this.evaluateDefensiveValue(moveObj);

    return tacticalEvaluationScore;
  },

  // ENHANCED POSITIONAL EVALUATION - Defensive-focused positioning
  /**
   * Evaluates the positional and structural impact of a move.
   * Prioritizes defensive formations, cohesion, and maintaining a solid front.
   *
   * @param {Object} moveObj - The move object to evaluate
   * @returns {number} The calculated positional score
   */
  evaluatePositional(moveObj) {
    let positionalEvaluationScore = 0;

    // TOP PRIORITY: Structural formations (Phalanx, Column, etc.)
    positionalEvaluationScore += this.evaluateDefensiveFormation(moveObj);

    // PRIORITY 2: Spatial Cohesion (keeping pieces within support distance)
    positionalEvaluationScore +=
      this.evaluateCohesion(moveObj) * this.weights.cohesion;

    // PRIORITY 3: Gap Maintenance (limiting opponent breakthrough opportunities)
    positionalEvaluationScore +=
      this.evaluateGapClosure(moveObj) * this.weights.gapClosure;

    // PRIORITY 4: Active Mutual Support (defending and being defended)
    positionalEvaluationScore +=
      this.evaluateSupport(moveObj) * this.weights.support;

    // PRIORITY 5: Geometric Control (centering pieces)
    positionalEvaluationScore +=
      this.evaluateCenterControl(moveObj) * this.weights.center * 0.7;

    // Edge Safety: Pieces on the board boundaries are naturally safer from capture
    if (moveObj.toCol === 0 || moveObj.toCol === BOARD_SIZE - 1) {
      positionalEvaluationScore += this.weights.edgeSafety;
    }

    // Penalize isolated pieces that are disconnected from the formation
    positionalEvaluationScore -=
      this.evaluateIsolation(moveObj) * this.weights.isolationPenalty;

    // Absolute Safety: Does this move land the piece in immediate danger?
    positionalEvaluationScore += this.evaluateSelfDanger(moveObj);

    // Dynamic Reinforcement
    positionalEvaluationScore += this.evaluateGapFilling(moveObj);
    positionalEvaluationScore += this.evaluateFollowLeader(moveObj);
    positionalEvaluationScore += this.evaluateCompactAdvancement(moveObj);
    positionalEvaluationScore += this.evaluateSideOccupation(moveObj);

    return positionalEvaluationScore;
  },

  // STRATEGIC EVALUATION - Long-term planning
  /**
   * Evaluates the long-term strategic value of a move.
   * Focuses on advancement, king activity, and territorial control.
   *
   * @param {Object} moveObj - The move object to evaluate
   * @returns {number} The calculated strategic score
   */
  evaluateStrategic(moveObj) {
    let strategicEvaluationScore = 0;

    // Advancement progress for standard pieces
    if (moveObj.piece.dataset.king !== "true") {
      const rowsAdvancedCount =
        moveObj.piece.dataset.color === "black"
          ? moveObj.toRow
          : BOARD_SIZE - 1 - moveObj.toRow;
      strategicEvaluationScore += rowsAdvancedCount * this.weights.advancement;
    }

    // Dynamic weight for king activity and scope
    if (moveObj.piece.dataset.king === "true") {
      strategicEvaluationScore += this.evaluateKingActivity(moveObj);
    }

    // Territorial and initiative metrics
    strategicEvaluationScore += this.evaluateKeySquareControl(moveObj);
    strategicEvaluationScore += this.evaluateTempo(moveObj);

    return strategicEvaluationScore;
  },

  // LEARNED PATTERNS - Experience-based evaluation
  /**
   * Evaluates a move based on patterns and outcomes learned from past games.
   * Leverages the persistent memory database to favor winning behaviors.
   *
   * @param {Object} moveObj - The move object to evaluate
   * @returns {number} The bonus or penalty derived from experience
   */
  evaluateLearnedPatterns(moveObj) {
    let patternHeuristicScore = 0;

    // 1. Exact Position Recognition
    const boardStateHashVal = this.getPositionHash();
    if (this.memory.positionDatabase.has(boardStateHashVal)) {
      const historicalEntry =
        this.memory.positionDatabase.get(boardStateHashVal);
      patternHeuristicScore += historicalEntry.evaluation || 0;
    }

    // 2. Behavioral Tendencies (Move Categorization)
    const moveStyleTag = this.getMoveType(moveObj);

    // Reward categories associated with previous victories
    if (this.memory.winningMoveTypes.has(moveStyleTag)) {
      patternHeuristicScore +=
        this.memory.winningMoveTypes.get(moveStyleTag) *
        this.weights.learnedWinPattern;
    }

    // Penalize categories associated with previous defeats
    if (this.memory.losingMoveTypes.has(moveStyleTag)) {
      patternHeuristicScore -=
        this.memory.losingMoveTypes.get(moveStyleTag) *
        this.weights.learnedLossPattern;
    }

    return patternHeuristicScore;
  },

  /**
   * Generates all legal moves for a specific player color.
   * Strictly enforces mandatory capture rules and maximum capture sequence requirements.
   *
   * @param {string} activeColor - The color of the player whose moves are being generated
   * @returns {Array} A filtered list of legal move objects
   */
  getAllMoves(activeColor) {
    const passiveMovesList = [];
    const tacticalCapturesList = [];

    // MANDATORY CONTINUATION: If a piece is mid-capture sequence, only it can finish the jump
    if (mustContinueCapture && forcedCapturePiece && activeColor === "black") {
      // Locate the forced piece's position on the DOM (used for frontend-integrated search)
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const pieceAtPos = this.getPieceAt(r, c);
          if (pieceAtPos === forcedCapturePiece) {
            const potentialMoves = this.getPieceMoves(r, c, pieceAtPos);
            const forcedCaptures = potentialMoves.filter((m) => m.isCapture);
            return forcedCaptures;
          }
        }
      }
      return []; // Piece lost or mismatch occurred
    }

    // Standard move generation across the whole board
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const pieceObj = this.getPieceAt(r, c);
        if (!pieceObj || pieceObj.dataset.color !== activeColor) continue;

        const piecePotentialMoves = this.getPieceMoves(r, c, pieceObj);

        for (const moveIter of piecePotentialMoves) {
          if (moveIter.isCapture) {
            tacticalCapturesList.push(moveIter);
          } else {
            passiveMovesList.push(moveIter);
          }
        }
      }
    }

    // MANDATORY CAPTURE: If any jump is possible, only jump sequences that capture the maximum number of pieces are legal
    if (tacticalCapturesList.length > 0) {
      return this.filterForMaximumCaptures(tacticalCapturesList);
    }

    return passiveMovesList;
  },

  /**
   * Filters a list of capture moves to strictly include only those that capture the maximum number of pieces.
   * This ensures compliance with International Draughts "Maximum Capture" rule.
   *
   * @param {Array} captureMovesList - The list of available capture moves
   * @returns {Array} The filtered list of maximal capture moves
   */
  filterForMaximumCaptures(captureMovesList) {
    // Enrich moves with their calculated potential capture count
    const movesWithPotentials = captureMovesList.map((moveObj) => {
      const capturedCountVal = this.getTotalCaptureCount(moveObj);
      return { ...moveObj, totalCaptureCount: capturedCountVal };
    });

    const absoluteMaxCaptureCount = Math.max(
      ...movesWithPotentials.map((m) => m.totalCaptureCount)
    );

    // Retain only moves that match the maximum achievable captures
    const optimizedCaptureOptions = movesWithPotentials.filter(
      (m) => m.totalCaptureCount === absoluteMaxCaptureCount
    );

    return optimizedCaptureOptions;
  },

  /**
   * Calculates the total number of pieces a specific move sequence will capture.
   * For kings, this is usually pre-calculated in the sequence generator.
   *
   * @param {Object} moveObj - The move object to analyze
   * @returns {number} The total count of captured victims
   */
  getTotalCaptureCount(moveObj) {
    if (!moveObj.isCapture) return 0;

    // For king multi-captures, the list of captured coordinates is typically present
    if (moveObj.capturedPieces && moveObj.capturedPieces.length > 0) {
      return moveObj.capturedPieces.length;
    }

    // Fallback to recursive capture potential calculation for standard pieces or basic moves
    return this.calculateCapturePotential(moveObj);
  },

  /**
   * Generates all legal moves for a specific piece at a given board position.
   * Handles long-range king movement and multi-capture sequences.
   *
   * @param {number} rIdx - Row index of the piece
   * @param {number} cIdx - Column index of the piece
   * @param {HTMLElement} pieceEle - The DOM element representing the piece
   * @returns {Array} A list of legal move objects for this piece
   */
  getPieceMoves(rIdx, cIdx, pieceEle) {
    const MOVE_RECURSION_LIMIT = 100; // Guard against potential infinite loops in sequence generation
    const calculatedMovesList = [];
    const isKingPiece = pieceEle.dataset.king === "true";
    const pieceColorVal = pieceEle.dataset.color;
    const opponentColorVal = pieceColorVal === "black" ? "red" : "black";

    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    const passiveDirections = isKingPiece
      ? tacticalDirections
      : pieceColorVal === "black"
      ? [
          [1, -1],
          [1, 1],
        ] // Black pawns advance downward (increasing row)
      : [
          [-1, -1],
          [-1, 1],
        ]; // Red pawns advance upward (decreasing row)

    if (isKingPiece) {
      // --- KING MOVEMENT LOGIC (Flying King) ---
      const sequenceSearchStart = Date.now();
      const kingCaptureSequencesList = this.getKingCaptureSequences(
        rIdx,
        cIdx,
        pieceEle,
        []
      );
      const searchDurationTime = Date.now() - sequenceSearchStart;

      // SAFETY FALLBACK: If deep sequence search is too computationally expensive, use immediate captures only
      if (searchDurationTime > 3000) {
        for (const [deltaRow, deltaCol] of tacticalDirections) {
          for (let distScale = 1; distScale < BOARD_SIZE; distScale++) {
            const enemyRowIdx = rIdx + deltaRow * distScale;
            const enemyColIdx = cIdx + deltaCol * distScale;
            if (
              enemyRowIdx < 0 ||
              enemyRowIdx >= BOARD_SIZE ||
              enemyColIdx < 0 ||
              enemyColIdx >= BOARD_SIZE
            )
              break;

            const enemyPieceCandidate = this.getPieceAt(
              enemyRowIdx,
              enemyColIdx
            );
            if (!enemyPieceCandidate) continue;
            if (enemyPieceCandidate.dataset.color !== opponentColorVal) break;

            // Victim found; identify suitable landing squares behind it
            for (
              let landDist = distScale + 1;
              landDist < BOARD_SIZE;
              landDist++
            ) {
              const landRowIdx = rIdx + deltaRow * landDist;
              const landColIdx = cIdx + deltaCol * landDist;
              if (
                landRowIdx < 0 ||
                landRowIdx >= BOARD_SIZE ||
                landColIdx < 0 ||
                landColIdx >= BOARD_SIZE
              )
                break;

              const landSquarePiece = this.getPieceAt(landRowIdx, landColIdx);
              if (!landSquarePiece) {
                calculatedMovesList.push({
                  fromRow: rIdx,
                  fromCol: cIdx,
                  toRow: landRowIdx,
                  toCol: landColIdx,
                  piece: pieceEle,
                  isCapture: true,
                  capturedPieces: [`${enemyRowIdx},${enemyColIdx}`],
                  isKingCapture: enemyPieceCandidate.dataset.king === "true",
                });
                break; // Take primary landing square
              } else {
                break; // Path blocked
              }
            }
            break;
          }
        }
      } else if (kingCaptureSequencesList.length > 0) {
        // Only return captures if they are available (Mandatory Jump)
        const cappedSequences = kingCaptureSequencesList.slice(
          0,
          MOVE_RECURSION_LIMIT
        );
        calculatedMovesList.push(...cappedSequences);
      } else {
        // No captures available; generate standard long-range non-capture moves
        for (const [deltaRow, deltaCol] of tacticalDirections) {
          for (let distScale = 1; distScale < BOARD_SIZE; distScale++) {
            const targetRowIdx = rIdx + deltaRow * distScale;
            const targetColIdx = cIdx + deltaCol * distScale;

            if (
              targetRowIdx < 0 ||
              targetRowIdx >= BOARD_SIZE ||
              targetColIdx < 0 ||
              targetColIdx >= BOARD_SIZE
            )
              break;

            const obstructingPiece = this.getPieceAt(
              targetRowIdx,
              targetColIdx
            );
            if (!obstructingPiece) {
              calculatedMovesList.push({
                fromRow: rIdx,
                fromCol: cIdx,
                toRow: targetRowIdx,
                toCol: targetColIdx,
                piece: pieceEle,
                isCapture: false,
              });
            } else {
              break; // Blocked by piece
            }
          }
        }
      }
    } else {
      // --- STANDARD PIECE MOVEMENT LOGIC ---
      const pawnCaptureSequencesList = this.getRegularCaptureSequences(
        rIdx,
        cIdx,
        pieceEle,
        []
      );
      if (pawnCaptureSequencesList.length > 0) {
        calculatedMovesList.push(...pawnCaptureSequencesList);
      } else {
        // PASSIVE MOVEMENT (Forward Only)
        for (const [deltaRow, deltaCol] of passiveDirections) {
          const targetRowIdx = rIdx + deltaRow;
          const targetColIdx = cIdx + deltaCol;

          if (
            targetRowIdx >= 0 &&
            targetRowIdx < BOARD_SIZE &&
            targetColIdx >= 0 &&
            targetColIdx < BOARD_SIZE
          ) {
            if (!this.getPieceAt(targetRowIdx, targetColIdx)) {
              calculatedMovesList.push({
                fromRow: rIdx,
                fromCol: cIdx,
                toRow: targetRowIdx,
                toCol: targetColIdx,
                piece: pieceEle,
                isCapture: false,
              });
            }
          }
        }
      }
    }
    return calculatedMovesList;
  },

  getPieceAt(row, col) {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
      return null;
    const square = squares[row * BOARD_SIZE + col];
    return square.querySelector(".black-piece, .red-piece, .king");
  },

  /**
   * Records a move and its associated evaluation score into the temporary game memory.
   * This data is used for end-of-game learning and analysis.
   *
   * @param {Object} moveObj - The move object selected by the AI
   * @param {number} evaluationVal - The heuristic score calculated for this move
   */
  recordLastMove(moveObj, evaluationVal) {
    if (!moveObj) return;

    // Capture the current board state signature
    const positionSignHash = this.getPositionHash();

    const moveHistoryEntry = {
      move: {
        fromRow: moveObj.fromRow,
        fromCol: moveObj.fromCol,
        toRow: moveObj.toRow,
        toCol: moveObj.toCol,
        isCapture: moveObj.isCapture,
        isKing:
          moveObj.piece && moveObj.piece.dataset
            ? moveObj.piece.dataset.king === "true"
            : false,
        color:
          moveObj.piece && moveObj.piece.dataset
            ? moveObj.piece.dataset.color
            : null,
      },
      position: positionSignHash,
      evaluation: evaluationVal || 0,
      timestamp: Date.now(),
    };

    if (!this.memory.lastGameMoves) this.memory.lastGameMoves = [];
    this.memory.lastGameMoves.push(moveHistoryEntry);
  },

  /**
   * Concludes the current game, updates global statistics, and triggers learning processes.
   * Analyzes the result (win, loss, or draw) to adapt weights and patterns in persistent memory.
   *
   * @param {boolean|string} outcomeStatus - 'win', 'loss', 'draw', or boolean for AI win/loss
   */
  recordGame(outcomeStatus) {
    this.memory.games++;
    const baselineExperienceVal = this.memory.experienceLevel;

    const consolidatedGameSummary = {
      gameId: this.memory.games,
      result: outcomeStatus
        ? outcomeStatus === "draw"
          ? "draw"
          : "win"
        : "loss",
      moves: [...this.memory.lastGameMoves],
      gameLength: this.memory.lastGameMoves.length,
      timestamp: Date.now(),
      finalEvaluation: this.evaluatePositionEnhanced(
        this.getCurrentBoardState(),
        "black"
      ),
      strategyUsed: this.getCurrentStrategy(),
      mistakeCount: this.countMistakes(),
    };

    // Maintain recent game history (last 100 encounters)
    this.memory.gameHistory.push(consolidatedGameSummary);
    if (this.memory.gameHistory.length > 100) this.memory.gameHistory.shift();

    // Context-sensitive learning based on outcome
    if (outcomeStatus === "draw") {
      this.memory.draws++;
      this.memory.experienceLevel += 2;
    } else if (outcomeStatus) {
      this.memory.wins++;
      this.learnFromVictory(consolidatedGameSummary);
      this.memory.experienceLevel += 10;
    } else {
      this.memory.losses++;
      this.learnFromDefeat(consolidatedGameSummary);
      this.memory.experienceLevel += 5;
    }

    // Secondary metric updates
    const lastGameMoveCount = consolidatedGameSummary.gameLength;
    this.memory.averageGameLength =
      (this.memory.averageGameLength * (this.memory.games - 1) +
        lastGameMoveCount) /
      this.memory.games;

    // Trigger deep architectural analysis
    this.analyzeGameMoves();
    this.updatePlayerPatterns();
    this.evaluateStrategies();
    this.adjustConfidence(outcomeStatus);
    this.updateContextualLearning(consolidatedGameSummary);

    // Housekeeping: reset temporary memory
    this.memory.lastGameMoves = [];

    // Persistence and UI synchronization
    this.saveMemory();
    this.displayLearningProgress();

    if (typeof updateAIStatsDisplay === "function") {
      updateAIStatsDisplay();
    }
  },

  /**
   * Tracks and averages the AI's computation time for performance monitoring.
   *
   * @param {number} durationMs - Thinking time in milliseconds
   */
  recordThinkingTime(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;

    if (!Array.isArray(this.memory.timeSpentThinking)) {
      this.memory.timeSpentThinking = [];
    }

    this.memory.timeSpentThinking.push(durationMs);
    // Maintain a rolling window of recent thinking times
    if (this.memory.timeSpentThinking.length > 50) {
      this.memory.timeSpentThinking.shift();
    }

    const totalThinkingMs = this.memory.timeSpentThinking.reduce(
      (sum, val) => (Number.isFinite(val) ? sum + val : sum),
      0
    );

    const validSamplesCount = this.memory.timeSpentThinking.filter((val) =>
      Number.isFinite(val)
    ).length;

    this.memory.averageThinkingTime =
      validSamplesCount > 0 ? totalThinkingMs / validSamplesCount : 0;
  },

  /**
   * Processes a winning game to reinforce successful move patterns and strategies.
   * Updates positional database and successful sequence memory.
   *
   * @param {Object} gameSummary - Detailed summary of the completed game
   */
  learnFromVictory(gameSummary) {
    let newlyDiscoveredPositions = 0;

    // Reinforce successful move patterns with enhanced influence analysis
    for (let i = 0; i < gameSummary.moves.length; i++) {
      const moveEntry = gameSummary.moves[i];
      const moveStyleTag = this.getMoveType(moveEntry.move);

      // Scale importance based on game phase and tactical context
      const currentProgressRatio = i / gameSummary.moves.length;
      const moveInfluenceWeight = this.calculateMoveImportance(
        moveEntry,
        currentProgressRatio
      );

      const existingWinWeight =
        this.memory.winningMoveTypes.get(moveStyleTag) || 0;
      this.memory.winningMoveTypes.set(
        moveStyleTag,
        existingWinWeight + moveInfluenceWeight
      );

      // Position-specific learning: store and update historical evaluations
      if (moveEntry.position) {
        const isNewPos = !this.memory.positionDatabase.has(moveEntry.position);
        if (isNewPos) newlyDiscoveredPositions++;

        const positionHistoryData = this.memory.positionDatabase.get(
          moveEntry.position
        ) || {
          wins: 0,
          losses: 0,
          totalGames: 0,
          averageEval: 0,
        };

        positionHistoryData.wins++;
        positionHistoryData.totalGames++;
        positionHistoryData.averageEval =
          (positionHistoryData.averageEval *
            (positionHistoryData.totalGames - 1) +
            moveEntry.evaluation) /
          positionHistoryData.totalGames;

        this.memory.positionDatabase.set(
          moveEntry.position,
          positionHistoryData
        );
      }

      // Sequence learning: store short winning chains (3-move windows)
      if (i < gameSummary.moves.length - 2) {
        const tacticalSequence = [
          moveEntry,
          gameSummary.moves[i + 1],
          gameSummary.moves[i + 2],
        ];
        this.memory.successfulSequences.push(tacticalSequence);
      }
    }

    // Adaptive heuristic weight tuning
    this.adaptWeightsFromSuccess(gameSummary);

    // Update strategic baseline effectiveness
    const activeStrategyName = gameSummary.strategyUsed;
    const currentEffectivenessScore =
      this.memory.strategyEffectiveness.get(activeStrategyName) || 0;
    this.memory.strategyEffectiveness.set(
      activeStrategyName,
      currentEffectivenessScore + 1
    );
  },

  /**
   * Processes a losing game to analyze mistakes and adjust weights to prevent repetition.
   * Tracks persistent patterns of failure in specific positions or tactical contexts.
   *
   * @param {Object} gameSummary - Detailed summary of the completed game
   */
  learnFromDefeat(gameSummary) {
    const currentTimestamp = Date.now();

    // Initialize supplemental failure-tracking structures if absent
    if (!this.memory.losingMovesByPosition)
      this.memory.losingMovesByPosition = new Map();
    if (!this.memory.losingPatternsByContext)
      this.memory.losingPatternsByContext = new Map();
    if (!this.memory.losingMoveTimestamps)
      this.memory.losingMoveTimestamps = new Map();

    // Enhanced mistake analysis across the entire trajectory
    for (let i = 0; i < gameSummary.moves.length; i++) {
      const moveEntry = gameSummary.moves[i];
      const moveStyleTag = this.getMoveType(moveEntry.move);
      const contextualPatternTag = this.getMoveTypeWithContext(
        moveEntry.move,
        moveEntry.position
      );

      // IDENTIFY MISTAKE SEVERITY: More granular categorization based on evaluation drops
      // Severe mistakes (eval < 50): High penalty
      // Moderate mistakes (50-100): Medium penalty
      // Weak moves (100-150): Light penalty
      let mistakePenaltyWeight = 0;
      if (moveEntry.evaluation < 50) mistakePenaltyWeight = 2.0;
      else if (moveEntry.evaluation < 100) mistakePenaltyWeight = 1.0;
      else if (moveEntry.evaluation < 150) mistakePenaltyWeight = 0.5;
      else mistakePenaltyWeight = 0.2; // Minor penalty for even 'good' moves if the game was ultimately lost

      // Track critical mistakes for deep pattern recognition
      if (moveEntry.evaluation < 50) {
        const mistakeMetadata = {
          moveType: moveStyleTag,
          positionHash: moveEntry.position,
          gamePhaseRatio: i / gameSummary.moves.length,
          evaluationScore: moveEntry.evaluation,
          timestamp: currentTimestamp,
        };

        if (!this.memory.mistakePatterns.has(moveStyleTag)) {
          this.memory.mistakePatterns.set(moveStyleTag, []);
        }
        this.memory.mistakePatterns.get(moveStyleTag).push(mistakeMetadata);
      }

      // Opening-phase learning: penalize opening variations that consistently lead to losses
      if (
        i < 8 &&
        moveEntry.position &&
        this.memory.openingBook.has(moveEntry.position)
      ) {
        const currentOpeningScore = this.memory.openingBook.get(
          moveEntry.position
        );
        this.memory.openingBook.set(
          moveEntry.position,
          Math.max(0, currentOpeningScore - 2)
        );
      }

      // GLOBAL PATTERN PENALIZATION
      if (mistakePenaltyWeight > 0) {
        const currentGlobalLosingWeight =
          this.memory.losingMoveTypes.get(moveStyleTag) || 0;
        this.memory.losingMoveTypes.set(
          moveStyleTag,
          currentGlobalLosingWeight + mistakePenaltyWeight
        );

        // Track recency for potential time-decayed learning (future enhancement)
        this.memory.losingMoveTimestamps.set(moveStyleTag, currentTimestamp);

        // POSITION-SPECIFIC PATTERN PENALIZATION
        if (moveEntry.position) {
          const positionalFailureKey = `${moveEntry.position}_${moveStyleTag}`;
          const currentPosLosingWeight =
            this.memory.losingMovesByPosition.get(positionalFailureKey) || 0;
          this.memory.losingMovesByPosition.set(
            positionalFailureKey,
            currentPosLosingWeight + mistakePenaltyWeight
          );
        }

        // CONTEXTUAL PATTERN PENALIZATION (State + Action type)
        const currentContextLosingWeight =
          this.memory.losingPatternsByContext.get(contextualPatternTag) || 0;
        this.memory.losingPatternsByContext.set(
          contextualPatternTag,
          currentContextLosingWeight + mistakePenaltyWeight
        );
      }

      // Update positional database with defeat metrics
      if (moveEntry.position) {
        const posHistoryData = this.memory.positionDatabase.get(
          moveEntry.position
        ) || {
          wins: 0,
          losses: 0,
          totalGames: 0,
          averageEval: 0,
        };
        posHistoryData.losses++;
        posHistoryData.totalGames++;
        posHistoryData.averageEval =
          (posHistoryData.averageEval * (posHistoryData.totalGames - 1) +
            moveEntry.evaluation) /
          posHistoryData.totalGames;

        this.memory.positionDatabase.set(moveEntry.position, posHistoryData);
      }
    }

    // Attempt to automatically adapt heuristic weights based on failure analysis
    this.adaptWeightsFromFailure(gameSummary);

    // Strategy devaluation
    const activeStrategyName = gameSummary.strategyUsed;
    if (this.memory.strategyEffectiveness.has(activeStrategyName)) {
      const currentScore =
        this.memory.strategyEffectiveness.get(activeStrategyName);
      this.memory.strategyEffectiveness.set(
        activeStrategyName,
        Math.max(0, currentScore - 0.5)
      );
    }
  },

  /**
   * Performs a high-level analysis of the game trajectory to extract aggregate metrics.
   * Updates tracking for capture success rates, evaluation accuracy, and archetypal behavior.
   */
  analyzeGameMoves() {
    let successfulCaptureCount = 0;
    let totalCapturesDetected = 0;
    let totalEvaluationAccuracyScore = 0;
    let evaluationSamplesCount = 0;

    for (const moveEntry of this.memory.lastGameMoves) {
      if (moveEntry.move.isCapture) {
        totalCapturesDetected++;
        // Moves evaluated highly that were indeed captures are considered 'successful' tactical insights
        if (moveEntry.evaluation > 400) successfulCaptureCount++;
      }

      // Track evaluation accuracy if outcome data is available (usually filled during post-game review)
      if (moveEntry.actualOutcome !== undefined) {
        const deviationRatio =
          Math.abs(moveEntry.evaluation - moveEntry.actualOutcome) / 1000;
        totalEvaluationAccuracyScore += Math.max(0, 1 - deviationRatio);
        evaluationSamplesCount++;
      }
    }

    // Update capture proficiency statistics
    if (totalCapturesDetected > 0) {
      this.memory.captureSuccess =
        (this.memory.captureSuccess + successfulCaptureCount) / 2;
      this.memory.captureAttempts += totalCapturesDetected;
    }

    // Update heuristic calibration accuracy
    if (evaluationSamplesCount > 0) {
      const gameAccuracyAverage =
        totalEvaluationAccuracyScore / evaluationSamplesCount;
      this.memory.evaluationAccuracy =
        (this.memory.evaluationAccuracy + gameAccuracyAverage) / 2;
    }

    // Trigger secondary analysis workers
    this.analyzeBlunders();

    if (this.memory.lastGameMoves.length > 5) {
      this.reinforceOpening(this.memory.lastGameMoves.slice(0, 10));
    }

    this.analyzeOpponentArchetype();
  },

  /**
   * Categorizes the opponent's playing style based on recent move data.
   * This allows the AI to adapt its strategy (e.g., being more cautious against aggressive players).
   */
  analyzeOpponentArchetype() {
    let totalAggressiveActions = 0;
    let totalDefensiveActions = 0;
    let totalGreedyJumpsDetected = 0;

    // Analyze the last 5 games for trend detection
    const recentHistorySlice = this.memory.gameHistory.slice(-5);

    recentHistorySlice.forEach((gameSummary) => {
      // Analyze human opponent moves (usually odd indices if AI started black/even)
      const opponentMoves = gameSummary.moves.filter((_, idx) => idx % 2 === 1);

      opponentMoves.forEach((moveEntry) => {
        if (moveEntry.move.isCapture) totalGreedyJumpsDetected++;

        const targetRow = moveEntry.move.toRow;

        // Heuristic: Control of rows 3-6 indicates aggression; staying at row 0/1 or 8/9 indicates defense
        if (targetRow >= 3 && targetRow <= 6) {
          totalAggressiveActions++;
        } else if (targetRow <= 1 || targetRow >= BOARD_SIZE - 2) {
          totalDefensiveActions++;
        }
      });
    });

    // Classify based on dominant behavior ratios
    if (totalAggressiveActions > totalDefensiveActions * 2) {
      this.memory.opponentType = "aggressive";
    } else if (totalDefensiveActions > totalAggressiveActions) {
      this.memory.opponentType = "turtle";
    } else if (totalGreedyJumpsDetected > 5) {
      this.memory.opponentType = "greedy";
    } else {
      this.memory.opponentType = "balanced";
    }
  },

  /**
   * Identifies critical blunders where the AI's positional evaluation dropped significantly.
   * These events are recorded for special learning focus.
   */
  analyzeBlunders() {
    if (!this.memory.criticalBlunders) {
      this.memory.criticalBlunders = new Map();
    }

    const relevantMoveChain = this.memory.lastGameMoves;
    for (let i = 1; i < relevantMoveChain.length; i++) {
      const moveBeforeFailure = relevantMoveChain[i - 1];
      const moveAfterReply = relevantMoveChain[i];

      // Detection threshold: an evaluation drop > 200 points after an opponent's reply
      const evaluationDropValue =
        moveBeforeFailure.evaluation - moveAfterReply.evaluation;

      if (evaluationDropValue > 200) {
        const moveStyleTag = this.getMoveType(moveBeforeFailure.move);
        const contextualPatternTag = this.extractMovePattern(
          moveBeforeFailure.move
        );

        // Record the pattern for prioritized learning
        const blunderPatternKey = `${moveStyleTag}_${contextualPatternTag}`;
        const existingBlunderCount =
          this.memory.criticalBlunders.get(blunderPatternKey) || 0;
        this.memory.criticalBlunders.set(
          blunderPatternKey,
          existingBlunderCount + 1
        );

        // Note: Blunder penalties are integrated into learnFromDefeat scoring
      }
    }
  },

  /**
   * Adds successful opening sequences to the opening book for prioritization in future games.
   *
   * @param {Array} openingSequenceList - The first few moves of a winning game
   */
  reinforceOpening(openingSequenceList) {
    const lastGameIndex = this.memory.gameHistory.length - 1;
    const finalOutcome = this.memory.gameHistory[lastGameIndex]?.result;

    if (finalOutcome !== "win") return;

    openingSequenceList.forEach((historyEntry) => {
      const stateHashVal = historyEntry.position; // Use the stored board hash
      if (stateHashVal) {
        const currentPopularityScore =
          this.memory.openingBook.get(stateHashVal) || 0;
        this.memory.openingBook.set(stateHashVal, currentPopularityScore + 1);
      }
    });
  },

  // New enhanced learning methods
  /**
   * Retrieves the current high-level strategy name based on dominant heuristic weights.
   *
   * @returns {string} The name of the active strategic archetype
   */
  getCurrentStrategy() {
    if (this.weights.safety > 150) return "defensive";
    if (this.weights.mobility > 20) return "aggressive";
    if (this.weights.sideOccupation > 200) return "positional";
    if (this.weights.captureBase > 350) return "tactical";
    return "balanced";
  },

  /**
   * Counts how many moves in the last game were identified as mistakes (evaluation < 50).
   *
   * @returns {number} The total count of mistakes
   */
  countMistakes() {
    let mistakeCounter = 0;
    for (const moveEntry of this.memory.lastGameMoves) {
      if (moveEntry.evaluation < 50) mistakeCounter++;
    }
    return mistakeCounter;
  },

  /**
   * Calculates the weighted importance of a specific move for learning purposes.
   * Endgame moves and tactical captures are given higher learning priority.
   *
   * @param {Object} moveEntry - The move record to evaluate
   * @param {number} currentPhaseRatio - The current progress through the game (0.0 to 1.0)
   * @returns {number} The calculated importance multiplier
   */
  calculateMoveImportance(moveEntry, currentPhaseRatio) {
    let cumulativeImportance = 1.0;

    // Critical moves in the endgame (last 30% of the game) are prioritized
    if (currentPhaseRatio > 0.7) cumulativeImportance *= 1.5;

    // Tactical captures provide high learning signals
    if (moveEntry.move.isCapture) cumulativeImportance *= 1.3;

    // Moves that yielded high evaluation scores are considered highly instructive
    if (moveEntry.evaluation > 500) cumulativeImportance *= 1.2;

    return cumulativeImportance;
  },

  /**
   * Incrementally adjusts heuristic weights following a successful game.
   * Reinforces weights associated with high-scoring tactical and positional moves.
   *
   * @param {Object} gameSummary - The record of the winning game
   */
  adaptWeightsFromSuccess(gameSummary) {
    const activeLearningRate = this.memory.learningRate;

    for (const moveEntry of this.memory.lastGameMoves) {
      if (moveEntry.evaluation > 400) {
        // Reinforce capture aggression if captures were part of the winning path
        if (moveEntry.move.isCapture) {
          this.baseWeights.captureBase *= 1 + activeLearningRate * 0.1;
        }

        // Reinforce king activity if kings were utilized effectively
        const isKingMove = moveEntry.move.piece
          ? moveEntry.move.piece.dataset.king === "true"
          : moveEntry.move.isKing;
        if (isKingMove) {
          this.baseWeights.kingActivity *= 1 + activeLearningRate * 0.1;
        }
      }
    }
    this.normalizeWeights();
  },

  /**
   * Adjusts heuristic weights following a defeat to mitigate identified patterns of failure.
   * Increases penalties for risky behaviors and decreases confidence in failed strategies.
   *
   * @param {Object} gameSummary - The record of the losing game
   */
  adaptWeightsFromFailure(gameSummary) {
    const activeLearningRate = this.memory.learningRate;

    for (const moveEntry of this.memory.lastGameMoves) {
      if (moveEntry.evaluation < 100) {
        // Increase safety consciousness if pieces were lost without sufficient compensation
        if (!moveEntry.move.isCapture && this.baseWeights.selfDanger < 600) {
          this.baseWeights.selfDanger *= 1 + activeLearningRate * 0.2;
        }

        // Penalize reckless king deployment
        const isKingMove = moveEntry.move.piece
          ? moveEntry.move.piece.dataset.king === "true"
          : moveEntry.move.isKing;
        if (isKingMove) {
          this.baseWeights.kingEndangerPenalty *= 1 + activeLearningRate * 0.1;
        }
      }
    }
    this.normalizeWeights();
  },

  /**
   * Normalizes weights to prevent runaway inflation values during learning.
   * Ensures strategic weights never exceed logical material boundaries.
   */
  normalizeWeights() {
    const MATERIAL_VALUE = this.baseWeights.material || 1000000;
    const KING_VALUE = this.baseWeights.king || 20000000;

    // Cap aggressive/tactical weights at a fraction of a pawn
    // (A positional bonus shouldn't exceed the value of an actual piece)
    this.baseWeights.captureBase = Math.min(
      this.baseWeights.captureBase,
      MATERIAL_VALUE * 0.5
    );
    this.baseWeights.kingActivity = Math.min(
      this.baseWeights.kingActivity,
      MATERIAL_VALUE * 0.2
    );

    // Cap defensive penalties
    // (Fear of losing a piece shouldn't become infinitely paralyzed)
    this.baseWeights.selfDanger = Math.min(
      this.baseWeights.selfDanger,
      KING_VALUE * 1.5
    );
    this.baseWeights.kingEndangerPenalty = Math.min(
      this.baseWeights.kingEndangerPenalty,
      KING_VALUE * 5
    );
  },

  /**
   * Analyzes the human opponent's recent move history to recognize recurring tactical patterns.
   */
  updatePlayerPatterns() {
    if (this.memory.lastGameMoves.length > 0) {
      const recentTrajectoryWindow = this.memory.lastGameMoves.slice(-10);
      const humanPlayerMoves = recentTrajectoryWindow.filter(
        (_, idx) => idx % 2 === 1
      );

      for (const moveEntry of humanPlayerMoves) {
        const structuralPatternTag = this.extractMovePattern(moveEntry.move);
        const currentPatternFrequency =
          this.memory.playerPatterns.get(structuralPatternTag) || 0;
        this.memory.playerPatterns.set(
          structuralPatternTag,
          currentPatternFrequency + 1
        );
      }
    }
  },

  /**
   * Extracts a complex strategic pattern tag from a move based on its tactical and positional characteristics.
   *
   * @param {Object} moveObj - The move to analyze
   * @returns {string} A pipe-delimited string representing the move's identified patterns
   */
  extractMovePattern(moveObj) {
    let identifiedPatternTags = [];

    // Basic tactical classification
    if (moveObj.isCapture) identifiedPatternTags.push("capture");
    if (moveObj.isMultiCapture) identifiedPatternTags.push("multi_capture");

    const isKingPieceType = moveObj.piece
      ? moveObj.piece.dataset.king === "true"
      : moveObj.isKing;
    const pieceColorTag = moveObj.piece
      ? moveObj.piece.dataset.color
      : moveObj.color;

    if (isKingPieceType) identifiedPatternTags.push("king_activity");

    // Promotion zone activity
    if (moveObj.toRow === 0 || moveObj.toRow === BOARD_SIZE - 1) {
      identifiedPatternTags.push("promotion_zone");
    }

    // BACK RANK OFFENSIVE: Targeting opponent's defensive line
    if (moveObj.toRow <= 1 && pieceColorTag === "red")
      identifiedPatternTags.push("attacking_base");
    if (moveObj.toRow >= BOARD_SIZE - 2 && pieceColorTag === "black")
      identifiedPatternTags.push("attacking_base");

    // CENTER CONTROL INFLUENCE
    const isInsideTightCenter =
      moveObj.toRow >= 3 &&
      moveObj.toRow <= BOARD_SIZE - 4 &&
      moveObj.toCol >= 3 &&
      moveObj.toCol <= BOARD_SIZE - 4;
    if (isInsideTightCenter) identifiedPatternTags.push("center_push");

    // LOCAL DENSITY PATTERN: Evaluates support vs isolation
    const pieceDensityScore = this.calculateLocalDensity(
      moveObj.toRow,
      moveObj.toCol,
      pieceColorTag
    );
    if (pieceDensityScore > 1) identifiedPatternTags.push("supported_advance");
    else if (pieceDensityScore < -1)
      identifiedPatternTags.push("isolated_plunge");

    // BREAKTHROUGH: Captures that disrupt formation sequences
    if (moveObj.isCapture && moveObj.capturedPieces?.length > 1)
      identifiedPatternTags.push("breakthrough");

    return identifiedPatternTags.join("|") || "positional_creep";
  },

  /**
   * Calculates the local piece density around a square.
   * Positive scores indicate strong friendly support; negative scores indicate enemy proximity.
   *
   * @param {number} rIdx - Row index of the target square
   * @param {number} cIdx - Column index of the target square
   * @param {string} PieceColorVal - Color of the piece whose support is being calculated
   * @returns {number} The net local density score
   */
  calculateLocalDensity(rIdx, cIdx, PieceColorVal) {
    let localDensityScore = 0;
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    tacticalDirections.forEach(([deltaRow, deltaCol]) => {
      const checkRow = rIdx + deltaRow;
      const checkCol = cIdx + deltaCol;

      const isInBounds =
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE;
      if (isInBounds) {
        const neighborPiece = this.getPieceAt(checkRow, checkCol);
        if (neighborPiece) {
          if (neighborPiece.dataset.color === PieceColorVal)
            localDensityScore++;
          else localDensityScore--;
        }
      }
    });

    return localDensityScore;
  },

  /**
   * Identifies the single most effective strategy based on historical success rates.
   *
   * @returns {string} The name of the best-performing strategy
   */
  evaluateStrategies() {
    let optimalStrategyName = "balanced";
    let highestEffectivenessScore = 0;

    for (const [strategyName, effectivenessScore] of this.memory
      .strategyEffectiveness) {
      if (effectivenessScore > highestEffectivenessScore) {
        highestEffectivenessScore = effectivenessScore;
        optimalStrategyName = strategyName;
      }
    }

    return optimalStrategyName;
  },

  /**
   * Adjusts the AI's internal confidence and learning rate based on game outcomes.
   * Winning increases confidence (slower learning), losing decreases it (faster adaptation).
   *
   * @param {boolean} hasWon - True if the AI won the last game
   */
  adjustConfidence(hasWon) {
    const confidenceAdjustment = hasWon ? 0.05 : -0.03;
    this.memory.confidenceLevel = Math.max(
      0.1,
      Math.min(0.9, (this.memory.confidenceLevel || 0.5) + confidenceAdjustment)
    );

    // Learning rate is inversely proportional to confidence: high confidence needs less change
    this.memory.learningRate = 0.05 + (1 - this.memory.confidenceLevel) * 0.1;
  },

  /**
   * Records contextual performance data (e.g., how a strategy performs in long games).
   *
   * @param {Object} gameSummary - The record of the completed game
   */
  updateContextualLearning(gameSummary) {
    const contextTypeKey = `${gameSummary.strategyUsed}_${
      gameSummary.gameLength > 50 ? "prolonged" : "rapid"
    }`;

    const contextData = this.memory.contextualLearning.get(contextTypeKey) || {
      count: 0,
      wins: 0,
      avgMistakes: 0,
    };

    contextData.count++;
    contextData.wins += gameSummary.result === "win" ? 1 : 0;
    contextData.avgMistakes =
      (contextData.avgMistakes + (gameSummary.mistakeCount || 0)) / 2;

    this.memory.contextualLearning.set(contextTypeKey, contextData);
  },

  /**
   * Updates the UI or console with insights into the AI's learning progress.
   */
  displayLearningProgress() {
    const optimalStrategy = this.evaluateStrategies();
    // Logic for UI updates can be added here if needed
  },

  memoryLoaded: false, // flag to prevent overwriting valid data with empty init state

  /**
   * Persists the entire AI memory object to browser localStorage.
   * Includes structural safety checks to prevent data loss during race conditions.
   */
  saveMemory() {
    // CRITICAL INTEGRITY CHECK:
    // Prevent overwriting a mature brain with empty initialization defaults during a crash or quick refresh.
    if (!this.memoryLoaded && this.memory.games === 0) {
      console.warn(
        "[EnhancedAI] Aborting save: Memory not loaded and state is empty."
      );
      return;
    }

    const snapshot = {
      games: this.memory.games,
      wins: this.memory.wins,
      losses: this.memory.losses,
      draws: this.memory.draws,
      patterns: Array.from(this.memory.patterns.entries()),
      positionDatabase: Array.from(this.memory.positionDatabase.entries()),
      openingBook: Array.from(this.memory.openingBook.entries()),
      endgameKnowledge: Array.from(this.memory.endgameKnowledge.entries()),
      tacticalPatterns: Array.from(this.memory.tacticalPatterns.entries()),
      winningMoveTypes: Array.from(this.memory.winningMoveTypes.entries()),
      losingMoveTypes: Array.from(this.memory.losingMoveTypes.entries()),
      averageGameLength: this.memory.averageGameLength,
      totalMoves: this.memory.totalMoves,
      captureSuccess: this.memory.captureSuccess,
      captureAttempts: this.memory.captureAttempts,
      kingPromotions: this.memory.kingPromotions,
      difficulty: this.difficulty,
      baseWeights: this.baseWeights,

      // Trajectory and metadata history
      gameHistory: this.memory.gameHistory.slice(-50),
      playerPatterns: Array.from(this.memory.playerPatterns.entries()),
      evaluationAccuracy: this.memory.evaluationAccuracy,
      timeSpentThinking: this.memory.timeSpentThinking.slice(-20),
      averageThinkingTime: this.memory.averageThinkingTime || 0,
      strategyEffectiveness: Array.from(
        this.memory.strategyEffectiveness.entries()
      ),
      adaptiveWeights: Array.from(this.memory.adaptiveWeights.entries()),
      positionOutcomes: Array.from(this.memory.positionOutcomes.entries()),
      mistakePatterns: Array.from(this.memory.mistakePatterns.entries()),
      successfulSequences: this.memory.successfulSequences.slice(-20),
      opponentWeaknesses: Array.from(this.memory.opponentWeaknesses.entries()),
      contextualLearning: Array.from(this.memory.contextualLearning.entries()),
      learningRate: this.memory.learningRate,
      confidenceLevel: this.memory.confidenceLevel,
      experienceLevel: this.memory.experienceLevel,

      // Advanced Failure Analysis data
      losingMovesByPosition: Array.from(
        (this.memory.losingMovesByPosition || new Map()).entries()
      ),
      losingPatternsByContext: Array.from(
        (this.memory.losingPatternsByContext || new Map()).entries()
      ),
      losingMoveTimestamps: Array.from(
        (this.memory.losingMoveTimestamps || new Map()).entries()
      ),
      criticalBlunders: Array.from(
        (this.memory.criticalBlunders || new Map()).entries()
      ),
    };

    localStorage.setItem("enhancedAI_memory", JSON.stringify(snapshot));
  },

  /**
   * Restoration logic for AI memory. Parses serialized data from localStorage
   * and reconstructs Map objects for efficient runtime lookups.
   */
  loadMemory() {
    try {
      const serializedMemory = localStorage.getItem("enhancedAI_memory");
      if (serializedMemory) {
        const data = JSON.parse(serializedMemory);

        // Standard statistics restoration
        this.memory.games = data.games || 0;
        this.memory.wins = data.wins || 0;
        this.memory.losses = data.losses || 0;
        this.memory.draws = data.draws || 0;
        this.memory.averageGameLength = data.averageGameLength || 0;
        this.memory.totalMoves = data.totalMoves || 0;
        this.memory.captureSuccess = data.captureSuccess || 0;
        this.memory.captureAttempts = data.captureAttempts || 0;
        this.memory.kingPromotions = data.kingPromotions || 0;

        if (data.difficulty) this.difficulty = data.difficulty;
        if (data.baseWeights) {
          this.baseWeights = { ...this.baseWeights, ...data.baseWeights };
        }

        // Map reconstruction for pattern and positional databases
        this.memory.patterns = new Map(data.patterns || []);
        this.memory.positionDatabase = new Map(data.positionDatabase || []);
        this.memory.openingBook = new Map(data.openingBook || []);
        this.memory.endgameKnowledge = new Map(data.endgameKnowledge || []);
        this.memory.tacticalPatterns = new Map(data.tacticalPatterns || []);
        this.memory.winningMoveTypes = new Map(data.winningMoveTypes || []);
        this.memory.losingMoveTypes = new Map(data.losingMoveTypes || []);
        this.memory.playerPatterns = new Map(data.playerPatterns || []);
        this.memory.strategyEffectiveness = new Map(
          data.strategyEffectiveness || []
        );
        this.memory.adaptiveWeights = new Map(data.adaptiveWeights || []);
        this.memory.positionOutcomes = new Map(data.positionOutcomes || []);
        this.memory.mistakePatterns = new Map(data.mistakePatterns || []);
        this.memory.opponentWeaknesses = new Map(data.opponentWeaknesses || []);
        this.memory.contextualLearning = new Map(data.contextualLearning || []);

        // Metadata and trajectory restoration
        this.memory.gameHistory = data.gameHistory || [];
        this.memory.evaluationAccuracy = data.evaluationAccuracy || 0;
        this.memory.timeSpentThinking = data.timeSpentThinking || [];
        this.memory.averageThinkingTime = data.averageThinkingTime || 0;
        this.memory.learningRate = data.learningRate || 0.1;
        this.memory.confidenceLevel = data.confidenceLevel || 0.5;
        this.memory.experienceLevel = data.experienceLevel || 0;
        this.memory.successfulSequences = data.successfulSequences || [];

        // Enhanced failure analysis Maps
        this.memory.losingMovesByPosition = new Map(
          data.losingMovesByPosition || []
        );
        this.memory.losingPatternsByContext = new Map(
          data.losingPatternsByContext || []
        );
        this.memory.losingMoveTimestamps = new Map(
          data.losingMoveTimestamps || []
        );
        this.memory.criticalBlunders = new Map(data.criticalBlunders || []);
      }

      // Critical flag to enable future saving operations
      this.memoryLoaded = true;
    } catch (parseError) {
      console.error("[EnhancedAI] Memory restoration failed:", parseError);
    }
  },

  // Enhanced learning methods for move evaluation
  /**
   * Applies accumulated learned bonuses or penalties to a base move evaluation.
   * Accounts for successful patterns, failure avoidance with time-decay, and opponent archetypes.
   *
   * @param {Object} moveObj - The move being evaluated
   * @param {number} baseScoreVal - Initial heuristic score
   * @returns {number} The calculated cumulative learning bonus
   */
  applyLearningBonus(moveObj, baseScoreVal) {
    try {
      let cumulativeBonus = 0;
      const moveStyleTag = this.getMoveType(moveObj);
      const stateSignatureHash = this.getPositionHash();
      const currentTimestampMs = Date.now();
      const contextualPatternTag = this.getMoveTypeWithContext(
        moveObj,
        stateSignatureHash
      );

      // 1. POSITION-SPECIFIC KNOWLEDGE: Opening Book Reinforcement
      if (
        this.memory.openingBook &&
        this.memory.openingBook.has(stateSignatureHash)
      ) {
        cumulativeBonus += 150; // Strong prioritization for moves known to be successful from this state
      }

      // 2. PATTERN RECOGNITION: Reward move types associated with victory
      if (
        this.memory.winningMoveTypes &&
        this.memory.winningMoveTypes.has(moveStyleTag)
      ) {
        const historicalWinWeight =
          this.memory.winningMoveTypes.get(moveStyleTag);
        cumulativeBonus += Math.min(200, historicalWinWeight * 10);
      }

      // 3. FAILURE AVOIDANCE: Penalize move types associated with defeat using time-decay
      if (
        this.memory.losingMoveTypes &&
        this.memory.losingMoveTypes.has(moveStyleTag)
      ) {
        const failureExperienceWeight =
          this.memory.losingMoveTypes.get(moveStyleTag);
        const lastLosingTimestamp =
          this.memory.losingMoveTimestamps?.get(moveStyleTag) ||
          currentTimestampMs;

        // RECENCY DECAY: Losses weight less as they get older (90-day half-life)
        const encounterAgeMs = currentTimestampMs - lastLosingTimestamp;
        const maturityHalfLifeMs = 90 * 24 * 60 * 60 * 1000;
        const decayFactor = Math.pow(0.5, encounterAgeMs / maturityHalfLifeMs);
        const effectiveFailureWeight = failureExperienceWeight * decayFactor;

        // Progressive penalization scale
        const baselinePenalty = Math.min(effectiveFailureWeight, 20) * 15;
        const extendedPenalty = Math.max(
          0,
          Math.min(effectiveFailureWeight - 20, 10) * 3
        );

        cumulativeBonus -= Math.round(baselinePenalty + extendedPenalty);
      }

      // 4. GRANULAR FAILURE TRACKING: Position and Context specifics
      if (this.memory.losingMovesByPosition && stateSignatureHash) {
        const positionalFailureKey = `${stateSignatureHash}_${moveStyleTag}`;
        const specificFailureCount =
          this.memory.losingMovesByPosition.get(positionalFailureKey) || 0;
        if (specificFailureCount > 0) {
          cumulativeBonus -= Math.round(
            Math.min(150, specificFailureCount * 20)
          );
        }
      }

      if (this.memory.losingPatternsByContext && contextualPatternTag) {
        const contextFailureCount =
          this.memory.losingPatternsByContext.get(contextualPatternTag) || 0;
        if (contextFailureCount > 0) {
          cumulativeBonus -= Math.round(
            Math.min(100, contextFailureCount * 12)
          );
        }
      }

      // 5. STRATEGIC ARCHETYPE EXPLOITATION: Adapting to human behavior
      if (
        this.memory.opponentType === "aggressive" &&
        moveStyleTag.includes("center_push")
      ) {
        cumulativeBonus += 50; // Contest the center more aggressively
      } else if (
        this.memory.opponentType === "turtle" &&
        moveStyleTag.includes("attacking_base")
      ) {
        cumulativeBonus += 100; // Increase pressure on defensive setups
      }

      // 6. MATURITY SCALING: Confidence and Experience multipliers
      if ((this.memory.experienceLevel || 0) > 50) {
        cumulativeBonus *= 1 + this.memory.experienceLevel / 1000;
      }

      const activeConfidenceRatio = this.memory.confidenceLevel || 0.5;
      cumulativeBonus *= activeConfidenceRatio;

      return Math.round(cumulativeBonus);
    } catch (criticalError) {
      console.error("[EnhancedAI] applied bonus error:", criticalError);
      return 0;
    }
  },

  /**
   * Identifies the current phase of the game based on remaining piece density.
   *
   * @returns {string} One of: 'opening', 'midgame', 'endgame'
   */
  getCurrentGameContext() {
    const activePieceCount = this.countAllPieces();
    if (activePieceCount > 24) return "opening";
    if (activePieceCount > 12) return "midgame";
    return "endgame";
  },

  /**
   * Utility to count all pieces currently on the board.
   *
   * @returns {number} Global piece count
   */
  countAllPieces() {
    let pieceCounter = 0;
    for (let rIdx = 0; rIdx < BOARD_SIZE; rIdx++) {
      for (let cIdx = 0; cIdx < BOARD_SIZE; cIdx++) {
        if (this.getPieceAt(rIdx, cIdx)) pieceCounter++;
      }
    }
    return pieceCounter;
  },

  /**
   * Evaluates the strategic value of a move by considering king status,
   * capture yields, and positional dominance.
   *
   * @param {Object} moveObj - The move to evaluate
   * @returns {number} Score representing strategic upside
   */
  evaluateStrategicValue(moveObj) {
    try {
      let cumulativeValue = 0;

      // Bonus for preserving or utilizing kings
      const isKingMove = moveObj.piece
        ? moveObj.piece.dataset.king === "true"
        : moveObj.isKing;
      if (isKingMove) cumulativeValue += 10;

      // Yield from capture
      if (moveObj.isCapture) {
        const yieldCount = moveObj.capturedPieces
          ? moveObj.capturedPieces.length
          : 1;
        cumulativeValue += yieldCount * 15;
      }

      // Tactical foresight: evaluate opportunities created by this move
      cumulativeValue += this.evaluateCaptureOpportunities(moveObj);

      // Positional centrality (rewarding moves closer to the 10x10 center)
      const centerPoint = (BOARD_SIZE - 1) / 2;
      const distFromCenter =
        Math.abs(centerPoint - moveObj.toRow) +
        Math.abs(centerPoint - moveObj.toCol);
      cumulativeValue += Math.max(0, BOARD_SIZE - distFromCenter);

      return cumulativeValue;
    } catch (tacticalError) {
      return 0;
    }
  },

  /**
   * Quantifies the risk associated with a move, focusing on piece safety and exposure.
   *
   * @param {Object} moveObj - The move to analyze
   * @returns {number} Risk penalty score
   */
  evaluateRiskLevel(moveObj) {
    try {
      let cumulativeRiskPenalty = 0;

      // Check if the destination square is immediately threatened
      if (this.willBeUnderThreat(moveObj.toRow, moveObj.toCol, moveObj.piece)) {
        cumulativeRiskPenalty += 50;
      }

      // Check if the move weakens the surrounding formation
      const newlyExposedPieceCount = this.countExposedPiecesAfterMove(moveObj);
      cumulativeRiskPenalty += newlyExposedPieceCount * 15;

      // King risk is amplified
      const isKingMove = moveObj.piece
        ? moveObj.piece.dataset.king === "true"
        : moveObj.isKing;
      if (isKingMove) cumulativeRiskPenalty *= 1.5;

      return cumulativeRiskPenalty;
    } catch (riskError) {
      return 0;
    }
  },

  /**
   * Estimates how many friendly pieces become vulnerable after a specific piece vacates its square.
   *
   * @param {Object} moveObj - The move being simulated
   * @returns {number} The count of newly exposed pieces
   */
  countExposedPiecesAfterMove(moveObj) {
    let newlyExposedCounter = 0;
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of tacticalDirections) {
      const neighborRowIdx = moveObj.fromRow + deltaRow;
      const neighborColIdx = moveObj.fromCol + deltaCol;

      const isInBounds =
        neighborRowIdx >= 0 &&
        neighborRowIdx < BOARD_SIZE &&
        neighborColIdx >= 0 &&
        neighborColIdx < BOARD_SIZE;
      if (isInBounds) {
        const neighborPieceEle = this.getPieceAt(
          neighborRowIdx,
          neighborColIdx
        );
        // Only consider AI's own pieces (black)
        if (neighborPieceEle && neighborPieceEle.dataset.color === "black") {
          if (
            this.willBeExposedAfterMove(neighborRowIdx, neighborColIdx, moveObj)
          ) {
            newlyExposedCounter++;
          }
        }
      }
    }

    return newlyExposedCounter;
  },

  /**
   * Helper to determine if a specific piece at (r, c) loses all its support after moveObj is executed.
   *
   * @param {number} rIdx - Row of the piece being checked
   * @param {number} cIdx - Column of the piece being checked
   * @param {Object} moveObj - The move causing the potential exposure
   * @returns {boolean} True if the piece is left without support
   */
  willBeExposedAfterMove(rIdx, cIdx, moveObj) {
    const tacticalPositions = [
      [rIdx - 1, cIdx - 1],
      [rIdx - 1, cIdx + 1],
      [rIdx + 1, cIdx - 1],
      [rIdx + 1, cIdx + 1],
    ];

    let validSupportCount = 0;
    for (const [suppRow, suppCol] of tacticalPositions) {
      const isInBounds =
        suppRow >= 0 &&
        suppRow < BOARD_SIZE &&
        suppCol >= 0 &&
        suppCol < BOARD_SIZE;
      if (isInBounds) {
        // The square we are moving FROM no longer provides support
        if (suppRow === moveObj.fromRow && suppCol === moveObj.fromCol)
          continue;

        const supportingPieceEle = this.getPieceAt(suppRow, suppCol);
        if (
          supportingPieceEle &&
          supportingPieceEle.dataset.color === "black"
        ) {
          validSupportCount++;
        }
      }
    }

    return validSupportCount === 0;
  },

  // Multi-capture sequences for regular pieces
  /**
   * Recursive generator for multi-capture sequences available to regular pieces (pawns).
   * Enforces rules against backtracking and respects board boundaries.
   *
   * @param {number} rIdx - Current row of the jumping piece
   * @param {number} cIdx - Current column of the jumping piece
   * @param {HTMLElement} pieceEle - The DOM element of the piece jumping
   * @param {Array} capturedPiecesList - Tracking list of pieces captured so far in this sequence
   * @param {number} depthLevel - Current recursion depth
   * @param {Array} prevDirection - The [dR, dC] used to reach the current square
   * @returns {Array} List of completed move objects (including chains)
   */
  getRegularCaptureSequences(
    rIdx,
    cIdx,
    pieceEle,
    capturedPiecesList = [],
    depthLevel = 0,
    prevDirection = null
  ) {
    const RECURSION_LIMIT = 6;
    const MAX_CAPTURES_PER_SEQUENCE = 6;
    const availableMovesList = [];

    if (
      depthLevel > RECURSION_LIMIT ||
      capturedPiecesList.length >= MAX_CAPTURES_PER_SEQUENCE
    ) {
      return availableMovesList;
    }

    const currentPieceColor = pieceEle.dataset.color;
    const opponentColorVal = currentPieceColor === "black" ? "red" : "black";
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of tacticalDirections) {
      // RULE: No 180-degree backtracking in a single sequence
      if (
        prevDirection &&
        deltaRow === -prevDirection[0] &&
        deltaCol === -prevDirection[1]
      )
        continue;

      const victimRowIdx = rIdx + deltaRow;
      const victimColIdx = cIdx + deltaCol;
      const landingRowIdx = rIdx + deltaRow * 2;
      const landingColIdx = cIdx + deltaCol * 2;

      const isLandingInBounds =
        landingRowIdx >= 0 &&
        landingRowIdx < BOARD_SIZE &&
        landingColIdx >= 0 &&
        landingColIdx < BOARD_SIZE;

      if (isLandingInBounds) {
        const potentialVictim = this.getPieceAt(victimRowIdx, victimColIdx);
        const landingSquarePiece = this.getPieceAt(
          landingRowIdx,
          landingColIdx
        );
        const victimPositionKey = `${victimRowIdx},${victimColIdx}`;

        const isVictimOpponent =
          potentialVictim && potentialVictim.dataset.color === opponentColorVal;
        const isVictimNotAlreadyCaptured =
          !capturedPiecesList.includes(victimPositionKey);
        const isLandingUnoccupied = !landingSquarePiece;

        if (
          isVictimOpponent &&
          isVictimNotAlreadyCaptured &&
          isLandingUnoccupied
        ) {
          const updatedCapturedList = [
            ...capturedPiecesList,
            victimPositionKey,
          ];
          const primaryCaptureMove = {
            fromRow: rIdx,
            fromCol: cIdx,
            toRow: landingRowIdx,
            toCol: landingColIdx,
            piece: pieceEle,
            isCapture: true,
            capturedRow: victimRowIdx,
            capturedCol: victimColIdx,
            capturedPieces: updatedCapturedList,
          };

          // Recursively explore continuation opportunities
          const chainContinuations = this.getRegularCaptureSequences(
            landingRowIdx,
            landingColIdx,
            pieceEle,
            updatedCapturedList,
            depthLevel + 1,
            [deltaRow, deltaCol]
          );

          if (chainContinuations.length > 0) {
            availableMovesList.push(primaryCaptureMove);
            availableMovesList.push(...chainContinuations);
          } else {
            availableMovesList.push(primaryCaptureMove);
          }
        }
      }
    }

    return availableMovesList;
  },

  // Advanced king capture sequences - allows multiple captures in one turn
  /**
   * Advanced recursive generator for "Flying King" capture sequences.
   * Accounts for long-range jumps, non-backtracking rules, and execution timeouts.
   *
   * @param {number} rIdx - Current row of the jumping king
   * @param {number} cIdx - Current column of the jumping king
   * @param {HTMLElement} pieceEle - The DOM element of the king
   * @param {Array} capturedPiecesList - List of victim position keys already claimed
   * @param {number} depthLevel - Current recursion depth
   * @param {number} sharedStartTimeMs - Timestamp to track across recursive calls
   * @param {Array} prevDirection - The [dR, dC] used to reach current square
   * @returns {Array} List of complex king move objects
   */
  getKingCaptureSequences(
    rIdx,
    cIdx,
    pieceEle,
    capturedPiecesList = [],
    depthLevel = 0,
    sharedStartTimeMs = null,
    prevDirection = null
  ) {
    const RECURSION_LIMIT = 6;
    const MAX_CAPTURES_PER_SEQUENCE = 10;
    const EXECUTION_TIMEOUT_MS = 200;
    const globalStartTime = sharedStartTimeMs || Date.now();
    const complexMovesList = [];

    // Safety and optimization checks
    if (
      depthLevel > RECURSION_LIMIT ||
      capturedPiecesList.length >= MAX_CAPTURES_PER_SEQUENCE
    )
      return complexMovesList;
    if (Date.now() - globalStartTime > EXECUTION_TIMEOUT_MS)
      return complexMovesList;

    const pieceColorVal = pieceEle.dataset.color;
    const opponentColorVal = pieceColorVal === "black" ? "red" : "black";
    const tacticalDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [deltaRow, deltaCol] of tacticalDirections) {
      // RULE: No 180-degree backtracking in a single sequence
      if (
        prevDirection &&
        deltaRow === -prevDirection[0] &&
        deltaCol === -prevDirection[1]
      )
        continue;

      if (Date.now() - globalStartTime > EXECUTION_TIMEOUT_MS) break;

      // Flying King Search: Traverse the diagonal to find a victim
      for (let searchDist = 1; searchDist < BOARD_SIZE; searchDist++) {
        const checkRowIdx = rIdx + deltaRow * searchDist;
        const checkColIdx = cIdx + deltaCol * searchDist;

        if (
          checkRowIdx < 0 ||
          checkRowIdx >= BOARD_SIZE ||
          checkColIdx < 0 ||
          checkColIdx >= BOARD_SIZE
        )
          break;

        const pieceOnPath = this.getPieceAt(checkRowIdx, checkColIdx);

        if (pieceOnPath) {
          // Blocked by friendly piece
          if (pieceOnPath.dataset.color === pieceColorVal) break;

          // Target spotted: Opponent piece
          if (pieceOnPath.dataset.color === opponentColorVal) {
            const victimKey = `${checkRowIdx},${checkColIdx}`;

            // Rule check: piece cannot be jumped twice in one turn
            if (capturedPiecesList.includes(victimKey)) break;

            // Target identified at [checkRowIdx, checkColIdx]. Search for landing squares AFTER it.
            for (
              let landDist = searchDist + 1;
              landDist < BOARD_SIZE;
              landDist++
            ) {
              const landRowIdx = rIdx + deltaRow * landDist;
              const landColIdx = cIdx + deltaCol * landDist;

              if (
                landRowIdx < 0 ||
                landRowIdx >= BOARD_SIZE ||
                landColIdx < 0 ||
                landColIdx >= BOARD_SIZE
              )
                break;

              const landingPiece = this.getPieceAt(landRowIdx, landColIdx);
              // Landing square must be empty (ignoring self if we're technically multi-jumping)
              if (landingPiece && landingPiece !== pieceEle) break;

              // Valid capture maneuver identified
              const updatedCapturedList = [...capturedPiecesList, victimKey];
              const capturedKingsList = updatedCapturedList.filter((key) => {
                const [r, c] = key.split(",").map(Number);
                const p = this.getPieceAt(r, c);
                return p && p.dataset.king === "true";
              });

              const baseCaptureMove = {
                fromRow: rIdx,
                fromCol: cIdx,
                toRow: landRowIdx,
                toCol: landColIdx,
                piece: pieceEle,
                isCapture: true,
                capturedPieces: updatedCapturedList,
                isMultiCapture: updatedCapturedList.length > 1,
                capturedKingsCount: capturedKingsList.length,
              };

              // Explore subsequent capture opportunities from this landing spot
              const recursiveContinuations = this.getKingCaptureSequences(
                landRowIdx,
                landColIdx,
                pieceEle,
                updatedCapturedList,
                depthLevel + 1,
                globalStartTime,
                [deltaRow, deltaCol]
              );

              if (recursiveContinuations.length > 0) {
                // FLATTENING: Map recursive chains to the original jumping position
                recursiveContinuations.forEach((sequentialMove) => {
                  complexMovesList.push({
                    ...baseCaptureMove,
                    toRow: sequentialMove.toRow,
                    toCol: sequentialMove.toCol,
                    capturedPieces: sequentialMove.capturedPieces,
                    capturedKingsCount: sequentialMove.capturedKingsCount,
                    isMultiCapture: true,
                  });
                });
                // Also report the intermediate step
                complexMovesList.push(baseCaptureMove);
              } else {
                complexMovesList.push(baseCaptureMove);
              }
            }
            // Cannot jump over two pieces or piece after victim must be reached manually
            break;
          }
        }
      }
    }

    return complexMovesList;
  },
};

// Game initialization
function initGame() {
  // Hide the title and show the message area prominently
  const titleEl = document.getElementById("main-title");
  if (titleEl) titleEl.style.display = "none";

  const msgContainer = document.querySelector(".message-area-container");
  if (msgContainer) msgContainer.style.display = "flex";

  board.innerHTML = "";
  squares.length = 0;
  selectedPiece = null;
  currentPlayer = "red";
  mustContinueCapture = false;
  forcedCapturePiece = null;
  gameOver = false;
  enhancedAI.lastMoveFromRow = null;
  enhancedAI.lastMoveFromCol = null;

  // loadPanelStats(); // REMOVED: Caused stale stats on new game board (refresh bug)

  // Initialize game tracking for API
  gameId = generateGameId();
  gameStartTime = Date.now();
  gameTrajectory = [];
  gameResultSent = false; // Reset flag for new game

  createBoard();
  placePieces();
  updateTurnIndicator();
  updateScoreDisplay(); // Use updateScoreDisplay instead of updateScores
  updateMoveCount();
  enhancedAI.loadMemory();
  enhancedAI.weights = { ...enhancedAI.baseWeights }; // Initialize weights

  let label = "Grandmaster Level";
  if (typeof TFJS_CONFIG !== "undefined" && TFJS_CONFIG.enabled) {
    const v = window.checkersTfAi?.modelVersion;
    label = v ? `Global AI (${v})` : "Global Neural Net";
  } else if (TFJS_CONFIG.loadError) {
    label = "Local AI (Offline)";
    console.log("AI Load Error:", TFJS_CONFIG.loadError);
  } else if (API_CONFIG.enabled) {
    label = "Neural Network AI";
  }
  updateAIStatus(label);

  // Auto-resume learning when game starts (if API is enabled)
  if (API_CONFIG.enabled) {
    resumeLearning();
  }

  // Show welcome message
  showMessage("Game Started!", "info");
  setTimeout(() => showMessage(""), 3000);

  // Initialize defense monitoring
  defensiveMetrics = {
    snapshots: [],
    stats: {
      avgFormationScore: 0,
      avgSafetyScore: 0,
      avgDefensiveHealth: 0,
      lowestPoint: 100,
      lowestMoveNumber: 0,
      threatPeaks: [],
      successfulDefenses: 0,
      improvementRate: 0,
    },
    decisions: [],
    alerts: [],
  };
  updateAIStatsDisplay();

  defensiveState = {
    currentHealth: 100,
    threatLevel: "low",
    formationIntegrity: 100,
    piecesSafe: true,
    healthTrend: "stable",
    lastCheckMove: 0,
    nextCheckMove: 5,
    needsAttention: false,
    suggestedAction: null,
    dangerousSquares: [],
    peakHealth: 100,
    minHealth: 100,
    averageHealth: 100,
  };

  cachedFormationState = null;

  console.log("✓ Defense monitoring initialized");
}

// Generate unique game ID
function generateGameId() {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Get current board state as 2D array
function getBoardStateArray() {
  const boardState = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    boardState[row] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = getPieceAt(row, col);
      if (piece) {
        boardState[row][col] = {
          color: piece.dataset.color,
          king: piece.dataset.king === "true",
        };
      } else {
        boardState[row][col] = null;
      }
    }
  }
  return boardState;
}

// Format move for API
function formatMoveForAPI(move) {
  return `${move.fromRow},${move.fromCol}->${move.toRow},${move.toCol}`;
}

// Parse move from API format
function parseMoveFromAPI(moveStr) {
  const parts = moveStr.split("->");
  const fromParts = parts[0].split(",");
  const toParts = parts[1].split(",");

  return {
    fromRow: parseInt(fromParts[0]),
    fromCol: parseInt(fromParts[1]),
    toRow: parseInt(toParts[0]),
    toCol: parseInt(toParts[1]),
  };
}

// Get legal moves in API format
function getLegalMovesForAPI(color) {
  const allMoves = enhancedAI.getAllMoves(color);
  return allMoves.map((move) => formatMoveForAPI(move));
}

// Call API to get AI move
async function getAIMoveFromAPI() {
  try {
    // Skip API call if services are offline
    if (!API_CONFIG.enabled || servicesOffline) {
      return null;
    }

    const boardState = getBoardStateArray();
    const legalMoves = getLegalMovesForAPI("black");

    if (legalMoves.length === 0) {
      return null;
    }

    const resp = await apiFetch(`/api/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        board_state: boardState,
        legal_moves: legalMoves,
        player: "ai",
        move_number: moveCount,
      }),
    }).catch(() => null);

    if (!resp || !resp.ok) {
      return null;
    }

    const data = await resp.json();
    const parsedMove = parseMoveFromAPI(data.ai_move);

    // Find the complete move object with piece info
    const allMoves = enhancedAI.getAllMoves("black");
    const matchingMove = allMoves.find(
      (m) =>
        m.fromRow === parsedMove.fromRow &&
        m.fromCol === parsedMove.fromCol &&
        m.toRow === parsedMove.toRow &&
        m.toCol === parsedMove.toCol
    );

    if (matchingMove) {
      return matchingMove;
    }

    return null;
  } catch (error) {
    // Fail silently - will use local AI
    return null;
  }
}

// TF.js AI move selector (global AI for static hosting)
async function getAIMoveFromTFJS() {
  try {
    if (!TFJS_CONFIG.enabled || !TFJS_CONFIG.modelReady) return null;
    const boardState = getBoardStateArray();
    const legalMoves = getLegalMovesForAPI("black");
    if (legalMoves.length === 0) return null;

    const moveStr = await window.checkersTfAi.selectMove({
      boardState,
      legalMoves,
    });
    if (!moveStr) return null;

    const parsedMove = parseMoveFromAPI(moveStr);
    const allMoves = enhancedAI.getAllMoves("black");
    const matchingMove = allMoves.find(
      (m) =>
        m.fromRow === parsedMove.fromRow &&
        m.fromCol === parsedMove.fromCol &&
        m.toRow === parsedMove.toRow &&
        m.toCol === parsedMove.toCol
    );
    return matchingMove || null;
  } catch {
    return null;
  }
}

// Send game result to API for learning
async function sendGameResultToAPI(winner) {
  if (!API_CONFIG.enabled) return;

  // Check sessionStorage for already sent games (persists across page refreshes)
  const sentGames = JSON.parse(sessionStorage.getItem("sentGameIds") || "[]");
  if (sentGames.includes(gameId)) {
    return;
  }

  // Prevent duplicate submissions within same page session
  if (gameResultSent) {
    return;
  }

  if (!gameId || !gameStartTime || gameTrajectory.length === 0) {
    return;
  }

  // ENHANCEMENT: Game quality filtering
  const gameQuality = assessGameQuality(winner, moveCount, duration);
  if (!gameQuality.shouldSubmit) {
    // Low quality game - skip submission
    return;
  }

  try {
    const duration = (Date.now() - gameStartTime) / 1000;

    const resp = await apiFetch(`/api/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        winner: winner === "black" ? "ai" : winner === "red" ? "human" : "draw",
        trajectory: gameTrajectory,
        duration_seconds: duration,
        total_moves: moveCount,
        // New: Include quality metrics
        quality_score: gameQuality.score,
        has_captures: gameQuality.hasCaptures,
        game_phase: gameQuality.gamePhase,
      }),
    }).catch(() => null);

    if (resp && resp.ok) {
      gameResultSent = true;
      sentGames.push(gameId);
      sessionStorage.setItem("sentGameIds", JSON.stringify(sentGames));
    } else {
      console.warn(
        "⚠️ AI result submission failed:",
        resp ? resp.status : "No response"
      );
    }
  } catch (error) {
    console.error("❌ AI result submission error:", error);
  }
}

// Global AI (Supabase) submission for daily training
async function sendGameResultToGlobalAI(winner) {
  const submitUrl = getInjectedSubmitGameUrl();
  if (!submitUrl) return;

  // Reuse same de-dupe logic as API submission
  const sentGames = JSON.parse(
    sessionStorage.getItem("sentGlobalGameIds") || "[]"
  );
  if (sentGames.includes(gameId)) return;
  if (!gameId || !gameStartTime || gameTrajectory.length === 0) return;

  // ENHANCEMENT: Game quality filtering for global AI
  const duration = (Date.now() - gameStartTime) / 1000;
  const gameQuality = assessGameQuality(winner, moveCount, duration);
  if (!gameQuality.shouldSubmit) {
    return; // Skip low quality games
  }

  try {
    const payload = {
      game_id: gameId,
      winner: winner, // "black" | "red" | "draw"
      trajectory: gameTrajectory,
      duration_seconds: duration,
      total_moves: moveCount,
      client_hint: navigator?.userAgent || "unknown",
      // New: Quality metrics
      quality_score: gameQuality.score,
      has_captures: gameQuality.hasCaptures,
      game_phase: gameQuality.gamePhase,
    };

    const resp = await fetch(submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (resp && resp.ok) {
      sentGames.push(gameId);
      sessionStorage.setItem("sentGlobalGameIds", JSON.stringify(sentGames));
    }
  } catch {
    // ignore
  }
}

// Resume learning worker
async function resumeLearning() {
  if (!API_CONFIG.enabled) return;

  try {
    await apiFetch(`/api/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
  } catch (error) {}
}

// ENHANCEMENT: Assess game quality for training data filtering
function assessGameQuality(winner, totalMoves, durationSeconds) {
  let score = 1.0;
  let shouldSubmit = true;

  const isAIWin = winner === "black";
  const isHumanWin = winner === "red";
  const isDraw = winner === "draw";

  // Filter 1: Minimum move threshold based on actual gameplay patterns
  // Real games are always 50+ moves, so anything less is abnormal
  if (totalMoves < 30) {
    // Very abnormal - likely disconnect, bug, or testing
    shouldSubmit = false;
    score *= 0.2;
  } else if (totalMoves < 50) {
    // Shorter than normal - scrutinize more carefully
    const avgTimePerMove = durationSeconds / Math.max(1, totalMoves);

    if (avgTimePerMove < 0.5) {
      // Too fast = spam/auto-play
      shouldSubmit = false;
      score *= 0.3;
    } else {
      // Could be a legitimate quick tactical win/loss
      // Reduce score but allow it
      score *= 0.8;
    }
  } else if (totalMoves >= 50 && totalMoves < 70) {
    // Normal game length range - full quality
    score *= 1.0;
  } else if (totalMoves >= 70 && totalMoves <= 150) {
    // Longer strategic games - slightly higher value
    score *= 1.1;
  }

  // Filter 2: Maximum move count (avoid infinite draws/stalemates)
  if (totalMoves > 250) {
    shouldSubmit = false;
    score *= 0.4;
  }

  // Filter 3: Time-based quality (avoid instant moves/spam)
  const avgTimePerMove = durationSeconds / Math.max(1, totalMoves);
  if (avgTimePerMove < 0.3) {
    // Extremely fast - likely spam or auto-play
    score *= 0.5;
  } else if (avgTimePerMove > 1.5 && avgTimePerMove < 20) {
    // Good thinking time
    score *= 1.2;
  }

  // Count captures in trajectory
  let captureCount = 0;
  let tacticalMoves = 0;
  for (const entry of gameTrajectory) {
    if (entry.is_capture) captureCount++;
    if (entry.is_tactical) tacticalMoves++;
  }

  const hasCaptures = captureCount > 0;

  // Bonus for games with tactical play
  if (tacticalMoves > totalMoves * 0.2) {
    score *= 1.15; // Tactical games are valuable
  }

  // Determine game phase
  let gamePhase = "opening";
  if (totalMoves > 60 && totalMoves < 100) gamePhase = "midgame";
  else if (totalMoves >= 100) gamePhase = "endgame";

  // ENHANCED: AI losses are MORE valuable than wins for learning
  // Losses teach what not to do, wins reinforce what works
  if (isHumanWin) {
    score *= 1.2; // AI losses get 20% priority boost
  } else if (isAIWin) {
    score *= 1.05; // AI wins get small boost (still valuable)
  }

  if (isDraw && totalMoves > 80) {
    score *= 1.1; // Long draws show strategic depth
  }

  return {
    shouldSubmit: shouldSubmit && score > 0.5,
    score: Math.min(2.5, score), // Increased cap to 2.5x for high-priority losses
    hasCaptures,
    gamePhase,
    captureCount,
    tacticalMoves,
    avgTimePerMove,
  };
}

// Track trajectory for learning
function addToTrajectory(beforeState, move, afterState, playerColor) {
  if (!API_CONFIG.enabled) return;
  if (!beforeState || !afterState) return;

  // Calculate heuristic evaluation for distillation (teacher signal)
  // Enhanced normalization with running statistics
  let hScore = 0;
  if (
    typeof enhancedAI !== "undefined" &&
    enhancedAI.evaluatePositionEnhanced
  ) {
    const rawScore = enhancedAI.evaluatePositionEnhanced(afterState, "black");
    // Improved normalization: tanh with dynamic scaling
    hScore = Math.tanh(rawScore / 2000000); // Scale 2.0M to ~0.76
  }

  // Calculate move quality metrics for priority sampling
  const moveQuality = calculateMoveQuality(move, beforeState, afterState);

  gameTrajectory.push({
    board_state: beforeState,
    action: {
      from: [move.fromRow, move.fromCol],
      to: [move.toRow, move.toCol],
    },
    next_state: afterState,
    player: playerColor || "unknown",
    reward: 0,
    heuristic_score: hScore,
    heuristic_move: {
      from: [move.fromRow, move.fromCol],
      to: [move.toRow, move.toCol],
    },
    // New: Quality metrics for priority replay
    priority: moveQuality.priority,
    is_capture: move.isCapture || false,
    is_tactical: moveQuality.isTactical,
  });
}

// Calculate move quality for priority sampling in replay buffer
function calculateMoveQuality(move, beforeState, afterState) {
  let priority = 1.0;
  let isTactical = false;

  // Higher priority for captures (especially multi-captures)
  if (move.isCapture) {
    priority += 0.5;
    isTactical = true;

    if (move.capturedPieces && move.capturedPieces.length > 1) {
      // Multi-capture gets even higher priority
      priority += 0.3 * move.capturedPieces.length;
    }
  }

  // Higher priority for king promotions
  if (move.isPromotion) {
    priority += 0.4;
    isTactical = true;
  }

  // Higher priority for endgame positions (fewer pieces = more critical)
  const totalPieces = countTotalPieces(afterState);
  if (totalPieces <= 6) {
    priority += 0.3;
  }

  return {
    priority: Math.min(3.0, priority), // Cap at 3x priority
    isTactical,
  };
}

// Count total pieces on board
function countTotalPieces(boardState) {
  let count = 0;
  for (let row of boardState) {
    for (let cell of row) {
      if (cell && cell.color) count++;
    }
  }
  return count;
}

// Board creation
function createBoard() {
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const square = document.createElement("div");
    square.classList.add("square");
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    square.dataset.row = row;
    square.dataset.col = col;

    if ((row + col) % 2 === 0) {
      square.classList.add("red");
    } else {
      square.classList.add("black");
      square.addEventListener("click", () => onSquareClick(row, col));
    }
    board.appendChild(square);
    squares.push(square);
  }
}

// Piece placement
function placePieces() {
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    if ((row + col) % 2 !== 0) {
      if (row < 4) {
        createPiece("black", row, col);
      } else if (row > BOARD_SIZE - 5) {
        createPiece("red", row, col);
      }
    }
  }
}

function addPieceClickListener(piece) {
  if (piece.dataset.hasClickListener === "true") return;
  piece.addEventListener("click", (e) => {
    e.stopPropagation();
    const currentRow = parseInt(piece.dataset.row);
    const currentCol = parseInt(piece.dataset.col);
    onPieceClick(currentRow, currentCol, piece);
  });
  piece.dataset.hasClickListener = "true";
}

function createPiece(color, row, col) {
  const piece = document.createElement("div");
  piece.classList.add(color === "red" ? "red-piece" : "black-piece");
  piece.dataset.color = color;
  piece.dataset.king = "false";
  piece.dataset.row = row;
  piece.dataset.col = col;

  // Attach click handler via helper to ensure promoted kings remain clickable
  addPieceClickListener(piece);
  squares[row * BOARD_SIZE + col].appendChild(piece);
}

// Event handlers
function onPieceClick(row, col, piece) {
  if (gameOver || aiThinking) return;

  if (piece.dataset.color !== currentPlayer) {
    return;
  }

  // Multi-capture lock: Check by position, not by DOM reference
  if (mustContinueCapture && forcedCapturePiece) {
    const forcedRow = parseInt(forcedCapturePiece.dataset.row);
    const forcedCol = parseInt(forcedCapturePiece.dataset.col);
    if (row !== forcedRow || col !== forcedCol) {
      showMessage("finish the capture sequence!", "warning");
      return;
    }
  }

  // Optimization: Check for mandatory captures
  const mandatoryMoves = findMandatoryCaptures(currentPlayer);
  if (mandatoryMoves.length > 0) {
    const canMoveThisPiece = mandatoryMoves.some(
      (m) => m.fromRow === row && m.fromCol === col
    );
    if (!canMoveThisPiece) {
      const sourcePiece = mandatoryMoves[0];
      showMessage(
        `capture required! check piece at [${sourcePiece.fromRow},${sourcePiece.fromCol}]`,
        "warning"
      );
      // Optional: Highlight the piece that MUST move
      const mustMoveSquare =
        squares[sourcePiece.fromRow * BOARD_SIZE + sourcePiece.fromCol];
      mustMoveSquare.classList.add("suggested-move");
      setTimeout(() => mustMoveSquare.classList.remove("suggested-move"), 2000);
      return;
    }
  }

  if (selectedPiece) {
    selectedPiece.classList.remove("selected");
    clearHighlights();
  }

  selectedPiece = piece;
  selectedPieceRow = row;
  selectedPieceCol = col;
  piece.classList.add("selected");
  highlightValidMoves(row, col, piece);
}

function onSquareClick(row, col) {
  if (gameOver || aiThinking) return;

  // Fallback: If we clicked a square containing our piece, treat it as a piece click
  // This solves issues where the piece click listener might be blocked or missing
  const pieceInSquare = getPieceAt(row, col);
  if (pieceInSquare && pieceInSquare.dataset.color === currentPlayer) {
    onPieceClick(row, col, pieceInSquare);
    return;
  }

  if (!selectedPiece) return;

  const validMoves = getValidMoves(
    selectedPieceRow,
    selectedPieceCol,
    selectedPiece
  );
  const targetMove = validMoves.find(
    (move) => move.toRow === row && move.toCol === col
  );

  if (targetMove) {
    movePiece(targetMove);
  } else {
    // If clicking on an invalid square, deselect the piece
    if (selectedPiece) {
      selectedPiece.classList.remove("selected");
      selectedPiece = null;
      clearHighlights();
    }
  }
}

// Game logic
function movePiece(move) {
  const { fromRow, fromCol, toRow, toCol, piece, isCapture } = move;
  const movingColor = piece?.dataset?.color || null;
  const shouldTrackTrajectory = API_CONFIG.enabled;
  const beforeState = shouldTrackTrajectory ? getBoardStateArray() : null;
  let trajectoryRecorded = false;
  const recordTrajectoryIfNeeded = () => {
    if (trajectoryRecorded || !shouldTrackTrajectory || !beforeState) return;
    const afterState = getBoardStateArray();
    addToTrajectory(beforeState, move, afterState, movingColor);
    trajectoryRecorded = true;
  };

  // Move the piece in the DOM
  const fromSquare = squares[fromRow * BOARD_SIZE + fromCol];
  const toSquare = squares[toRow * BOARD_SIZE + toCol];
  toSquare.appendChild(piece);
  fromSquare.innerHTML = "";

  // Update piece's internal position for future clicks
  piece.dataset.row = toRow;
  piece.dataset.col = toCol;

  // Track jump direction if it's a capture to prevent backtracking
  if (isCapture) {
    lastJumpDirection = [
      Math.sign(toRow - fromRow),
      Math.sign(toCol - fromCol),
    ];
  }

  // Handle captures
  if (isCapture) {
    if (move.capturedPieces) {
      // King multi-capture or regular multi-capture chain
      for (const capturedKey of move.capturedPieces) {
        const [capturedRow, capturedCol] = capturedKey.split(",").map(Number);
        const capturedSquare = squares[capturedRow * BOARD_SIZE + capturedCol];
        const capturedPiece = capturedSquare.querySelector(
          ".red-piece, .black-piece, .king"
        );
        if (capturedPiece) {
          capturedSquare.innerHTML = "";
          updateScores(capturedPiece.dataset.color);
        }
      }
    } else if (
      move.capturedRow !== undefined &&
      move.capturedCol !== undefined
    ) {
      // Explicit capture location from Enhanced AI (supports Flying Kings)
      const capturedSquare =
        squares[move.capturedRow * BOARD_SIZE + move.capturedCol];
      const capturedPiece = capturedSquare.querySelector(
        ".red-piece, .black-piece, .king"
      );
      if (capturedPiece) {
        capturedSquare.innerHTML = "";
        updateScores(capturedPiece.dataset.color);
      }
    } else {
      // Legacy distance-based capture (fallback)
      const rowDiff = Math.abs(toRow - fromRow);
      const colDiff = Math.abs(toCol - fromCol);
      if (rowDiff === 2 && colDiff === 2) {
        const capturedRow = (fromRow + toRow) / 2;
        const capturedCol = (fromCol + toCol) / 2;
        const capturedSquare = squares[capturedRow * BOARD_SIZE + capturedCol];
        const capturedPiece = capturedSquare.querySelector(
          ".red-piece, .black-piece, .king"
        );
        if (capturedPiece) {
          capturedSquare.innerHTML = "";
          updateScores(capturedPiece.dataset.color);
        }
      }
    }
  }

  // Cleanup after move
  piece.classList.remove("selected");
  selectedPiece = null;
  clearHighlights();
  moveCount++;
  updateMoveCount();
  updateAIStatsDisplay();

  // Track move for AI learning
  const moveEvaluation = enhancedAI.evaluatePosition(piece.dataset.color);
  enhancedAI.storeMoveEvaluation(move, moveEvaluation);

  // Promotion logic ONLY for regular pieces (not kings)
  // Must check if it's NOT a king BEFORE checking promotion row
  const isKing = piece.dataset.king === "true";

  if (!isKing) {
    // Check if regular piece landed on promotion row
    const reachedPromotionRow =
      (toRow === BOARD_SIZE - 1 && piece.dataset.color === "black") ||
      (toRow === 0 && piece.dataset.color === "red");

    if (reachedPromotionRow) {
      // PRIORITY FIX: Check if there are more captures available before promoting
      // If piece can still capture, it must continue capturing before promotion
      if (isCapture) {
        const alreadyCaptured = move.capturedPieces || [];
        const furtherCaptures = findPossibleCaptures(
          toRow,
          toCol,
          piece,
          alreadyCaptured,
          lastJumpDirection
        );
        if (furtherCaptures.length > 0) {
          // Must continue capturing - delay promotion
          mustContinueCapture = true;
          forcedCapturePiece = piece;
          selectedPiece = piece;
          selectedPieceRow = toRow;
          selectedPieceCol = toCol;
          piece.classList.add("selected");
          highlightValidMoves(toRow, toCol);
          recordTrajectoryIfNeeded();

          // Continuous monitoring
          performPeriodicDefenseEvaluation(moveCount);
          return; // Don't promote yet - continue capturing
        }
      }

      // No more regular captures available - PROMOTE TO KING
      piece.dataset.king = "true";
      piece.classList.add("king");
      // Defensive: ensure a promoted piece has the click handler
      addPieceClickListener(piece);

      // IMPORTANT: Promotion immediately ends the turn
      // Even if the newly-promoted king has capture opportunities, it must wait for the next turn
      // This follows standard checkers rules
      mustContinueCapture = false;
      forcedCapturePiece = null;
      recordTrajectoryIfNeeded();
      endTurn();
      setTimeout(() => checkForWin(), 0);
      return;
    }
  }

  // Check for multi-capture continuation
  if (isCapture) {
    // Always check for continuation captures, even for kings
    // This ensures all mandatory captures are completed
    const alreadyCaptured = move.capturedPieces || [];
    const furtherCaptures = findPossibleCaptures(
      toRow,
      toCol,
      piece,
      alreadyCaptured,
      lastJumpDirection
    );
    if (furtherCaptures.length > 0) {
      mustContinueCapture = true;
      forcedCapturePiece = piece;

      // Re-select the piece to show next captures
      selectedPiece = piece;
      selectedPieceRow = toRow;
      selectedPieceCol = toCol;
      piece.classList.add("selected");
      highlightValidMoves(toRow, toCol);
      recordTrajectoryIfNeeded();

      // Continuous monitoring
      performPeriodicDefenseEvaluation(moveCount);
      return; // Don't end the turn - continue capture sequence
    }
  }

  recordTrajectoryIfNeeded();
  mustContinueCapture = false;
  forcedCapturePiece = null;
  lastJumpDirection = null; // Reset jump direction at end of turn

  // Continuous monitoring for regular turns
  performPeriodicDefenseEvaluation(moveCount);

  endTurn();
  // Ensure win check happens after all DOM updates are complete
  setTimeout(() => checkForWin(), 0);
}

// ═══════════════════════════════════════════════════════════════════
// PERIODIC DEFENSE EVALUATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function performPeriodicDefenseEvaluation(moveNumber) {
  // Perform defense evaluation
  const snapshot = {
    moveNumber: moveNumber,
    timestamp: Date.now(),
    pieceCount: document.querySelectorAll(".black-piece").length,
    kingCount: document.querySelectorAll(".black-piece[data-king='true']")
      .length,
    formationScore: Math.min(100, Math.max(0, 100 - countDefensiveGaps() * 5)),
    gapCount: countDefensiveGaps(),
    isolatedPieces: countIsolatedPieces(),
    threatenedPieces: countThreatenedPieces(),
    threatCount: countTotalThreats(),
    safetyScore: calculateSafetyScore(),
    backRankStrength: evaluateBackRankStrength(),
  };
  snapshot.defensiveHealth =
    snapshot.formationScore * 0.3 +
    Math.max(0, 100 - snapshot.threatCount * 10) * 0.35 +
    (snapshot.pieceCount / 12) * 100 * 0.2 +
    Math.min(100, (snapshot.backRankStrength / 10) * 100) * 0.15;
  if (defensiveMetrics.snapshots.length > 0) {
    const prev =
      defensiveMetrics.snapshots[defensiveMetrics.snapshots.length - 1];
    const delta = snapshot.defensiveHealth - prev.defensiveHealth;
    snapshot.trend =
      delta > 5 ? "improving" : delta < -5 ? "declining" : "stable";
  } else {
    snapshot.trend = "stable";
  }
  if (snapshot.defensiveHealth >= 80) snapshot.riskLevel = "low";
  else if (snapshot.defensiveHealth >= 60) snapshot.riskLevel = "medium";
  else if (snapshot.defensiveHealth >= 40) snapshot.riskLevel = "high";
  else snapshot.riskLevel = "critical";
  defensiveMetrics.snapshots.push(snapshot);
  defensiveState.currentHealth = snapshot.defensiveHealth;
  defensiveState.threatLevel = snapshot.riskLevel;
  defensiveState.healthTrend = snapshot.trend;
  defensiveState.peakHealth = Math.max(
    defensiveState.peakHealth,
    snapshot.defensiveHealth
  );
  defensiveState.minHealth = Math.min(
    defensiveState.minHealth,
    snapshot.defensiveHealth
  );

  // Update AI stats display
  updateAIStatsDisplay();
}

/**
 * Count gaps in the defensive formation.
 * A gap is an empty square surrounded by at least two friendly pieces.
 *
 * @returns {number} The count of gaps
 */
function countDefensiveGaps() {
  let gapCounter = 0;
  for (let rIdx = 0; rIdx < BOARD_SIZE; rIdx++) {
    for (let cIdx = 0; cIdx < BOARD_SIZE; cIdx++) {
      const pieceEle = getPieceAt(rIdx, cIdx);
      if (!pieceEle) {
        const neighbors = [
          getPieceAt(rIdx - 1, cIdx - 1),
          getPieceAt(rIdx - 1, cIdx + 1),
          getPieceAt(rIdx + 1, cIdx - 1),
          getPieceAt(rIdx + 1, cIdx + 1),
        ].filter((p) => p && p.dataset.color === "black");

        if (neighbors.length >= 2) gapCounter++;
      }
    }
  }
  return gapCounter;
}

/**
 * Count pieces that have no friendly support.
 *
 * @returns {number} The count of isolated pieces
 */
function countIsolatedPieces() {
  let isolatedCounter = 0;
  document.querySelectorAll(".black-piece").forEach((pieceEle) => {
    const rIdx = parseInt(pieceEle.dataset.row);
    const cIdx = parseInt(pieceEle.dataset.col);
    const supportCount = [
      getPieceAt(rIdx - 1, cIdx - 1),
      getPieceAt(rIdx - 1, cIdx + 1),
      getPieceAt(rIdx + 1, cIdx - 1),
      getPieceAt(rIdx + 1, cIdx + 1),
    ].filter((p) => p && p.dataset.color === "black").length;

    if (supportCount === 0) isolatedCounter++;
  });
  return isolatedCounter;
}

/**
 * Count pieces currently under direct attack by the opponent.
 *
 * @returns {number} The count of threatened pieces
 */
function countThreatenedPieces() {
  let threatenedCounter = 0;
  const activeBoardState = getBoardStateArray();

  document.querySelectorAll(".black-piece").forEach((pieceEle) => {
    const rIdx = parseInt(pieceEle.dataset.row);
    const cIdx = parseInt(pieceEle.dataset.col);

    // Use the robust enhancedAI logic for threat detection
    if (enhancedAI.isPieceUnderAttack(activeBoardState, rIdx, cIdx, "black")) {
      threatenedCounter++;
    }
  });
  return threatenedCounter;
}

/**
 * Calculate the total number of distinct threats across all friendly pieces.
 *
 * @returns {number} Total threat count (capped at 20)
 */
function countTotalThreats() {
  let totalThreatAccumulator = 0;
  const activeBoardState = getBoardStateArray();

  document.querySelectorAll(".black-piece").forEach((pieceEle) => {
    const rIdx = parseInt(pieceEle.dataset.row);
    const cIdx = parseInt(pieceEle.dataset.col);
    const pieceDataObj = {
      color: "black",
      king: pieceEle.dataset.king === "true",
    };

    const threatsAtPos = enhancedAI.countThreatsEnhanced(
      activeBoardState,
      rIdx,
      cIdx,
      pieceDataObj
    );
    totalThreatAccumulator += threatsAtPos;
  });
  return Math.min(totalThreatAccumulator, 20);
}

/**
 * Calculate a percentage score representing overall piece safety.
 *
 * @returns {number} Safety score from 0-100
 */
function calculateSafetyScore() {
  const threatenedCount = countThreatenedPieces();
  const totalPiecesCount = document.querySelectorAll(".black-piece").length;
  return totalPiecesCount === 0
    ? 0
    : ((totalPiecesCount - threatenedCount) / totalPiecesCount) * 100;
}

/**
 * Evaluate the defensive strength of the back rank (home row).
 *
 * @returns {number} The count of pieces on the back rows
 */
function evaluateBackRankStrength() {
  let backRankCounter = 0;
  for (let cIdx = 0; cIdx < BOARD_SIZE; cIdx++) {
    // Check rows 8 and 9 (Black's starting back rows on 10x10 board)
    for (let rIdx = 8; rIdx < BOARD_SIZE; rIdx++) {
      const pieceEle = getPieceAt(rIdx, cIdx);
      if (pieceEle && pieceEle.dataset.color === "black") backRankCounter++;
    }
  }
  return backRankCounter;
}

function analyzeGameDefense() {
  if (!defensiveMetrics || defensiveMetrics.snapshots.length === 0) return;
  const snaps = defensiveMetrics.snapshots;
  const avgHealth =
    snaps.reduce((a, b) => a + b.defensiveHealth, 0) / snaps.length;
  const minHealth = Math.min(...snaps.map((s) => s.defensiveHealth));
  const maxHealth = Math.max(...snaps.map((s) => s.defensiveHealth));
  console.log(`
╔════════════════════════════════════╗
║  DEFENSIVE PERFORMANCE SUMMARY
╠════════════════════════════════════╣
║ Average Health:    ${avgHealth.toFixed(1)}/100
║ Peak Health:       ${maxHealth.toFixed(0)}/100
║ Lowest Health:     ${minHealth.toFixed(0)}/100
║ Check Intervals:   ${snaps.length}
║ Game Length:       ${moveCount} moves
╚════════════════════════════════════╝
  `);
}

function endTurn() {
  if (gameOver) return;

  currentPlayer = currentPlayer === "red" ? "black" : "red";
  updateTurnIndicator();

  if (checkForWin()) {
    return;
  }

  if (aiEnabled && currentPlayer === "black") {
    makeAIMove();
  } else {
    // Check for mandatory captures for the new player
    const mandatoryMoves = findMandatoryCaptures(currentPlayer);
    if (mandatoryMoves.length > 0) {
      showMessage("capture required!", "warning");
    } else {
      showMessage(""); // Clear message if no capture is required
    }
  }
}

async function makeAIMove() {
  if (gameOver) return;
  aiThinking = true;
  updateAIStatus(
    TFJS_CONFIG.enabled
      ? "AI Thinking..."
      : API_CONFIG.enabled
      ? "AI Thinking..."
      : "Thinking..."
  );

  const moveStartTime = Date.now();
  try {
    // Emergency timeout for entire AI move process
    const EMERGENCY_TIMEOUT = 60000;

    let continueMoves = true;
    while (continueMoves && !gameOver) {
      if (Date.now() - moveStartTime > EMERGENCY_TIMEOUT) {
        console.warn("AI EMERGENCY TIMEOUT - Picking first available move");
        const allMoves = enhancedAI.getAllMovesForBoard(
          enhancedAI.getCurrentBoardState(),
          "black"
        );
        if (allMoves.length > 0) movePiece(allMoves[0]);
        aiThinking = false; // Reset state
        clearHighlights(); // Cleanup
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get the best move - either from API or built-in AI
      let bestMove = null;

      if (TFJS_CONFIG.enabled) {
        bestMove = await getAIMoveFromTFJS();
        if (!bestMove) {
          bestMove = await enhancedAI.findBestMove();
        }
      } else if (API_CONFIG.enabled) {
        // Try to get move from neural network API
        bestMove = await getAIMoveFromAPI();

        // Fallback to built-in AI if API fails
        if (!bestMove) {
          bestMove = await enhancedAI.findBestMove();
        }
      } else {
        // Use built-in AI
        bestMove = await enhancedAI.findBestMove();
      }

      // Fallback for forced capture continuation: if we're in forced capture mode but
      // the AI didn't return a valid forced-capture move, compute moves directly from DOM
      if (
        mustContinueCapture &&
        forcedCapturePiece &&
        currentPlayer === "black" &&
        aiEnabled
      ) {
        try {
          const fr = parseInt(forcedCapturePiece.dataset.row);
          const fc = parseInt(forcedCapturePiece.dataset.col);
          const forcedMoves = findPossibleCaptures(
            fr,
            fc,
            forcedCapturePiece,
            []
          );
          if (
            !bestMove ||
            (forcedMoves.length > 0 &&
              !forcedMoves.some(
                (m) => m.toRow === bestMove.toRow && m.toCol === bestMove.toCol
              ))
          ) {
            if (forcedMoves.length > 0) {
              // Choose move with maximum capture count (conservative)
              let chosen = forcedMoves[0];
              try {
                const scored = forcedMoves.map((m) => ({
                  m,
                  c: enhancedAI.getTotalCaptureCount(m) || 1,
                }));
                scored.sort((a, b) => b.c - a.c);
                chosen = scored[0].m;
              } catch (e) {}
              console.log(
                "makeAIMove: forced-capture fallback selecting:",
                chosen
              );
              bestMove = chosen;
            } else {
              console.log("makeAIMove: forced-capture ed piece at", fr, fc);
            }
          }
        } catch (err) {
          console.log("makeAIMove: forced-capture fallback error", err);
        }
      }

      if (bestMove) {
        console.log(
          "makeAIMove: mustContinueCapture=",
          mustContinueCapture,
          "forcedCapturePiece=",
          forcedCapturePiece
            ? forcedCapturePiece.dataset.row +
                "," +
                forcedCapturePiece.dataset.col
            : null,
          "currentPlayer=",
          currentPlayer,
          "bestMoveCandidate=",
          bestMove
        );
        if (!bestMove.piece) {
          const domPiece = getPieceAt(bestMove.fromRow, bestMove.fromCol);
          if (domPiece) bestMove.piece = domPiece;
          else {
            break;
          }
        }

        // Record move for learning
        enhancedAI.recordLastMove(bestMove, bestMove.score);

        const fromSquare =
          squares[bestMove.fromRow * BOARD_SIZE + bestMove.fromCol];
        const toSquare = squares[bestMove.toRow * BOARD_SIZE + bestMove.toCol];
        fromSquare.style.background = "rgba(0, 255, 255, 0.4)";
        toSquare.style.background = "rgba(0, 255, 255, 0.6)";

        await new Promise((resolve) => setTimeout(resolve, 400));
        movePiece(bestMove);

        enhancedAI.lastMoveFromRow = bestMove.fromRow;
        enhancedAI.lastMoveFromCol = bestMove.fromCol;

        fromSquare.style.background = "";
        toSquare.style.background = "";

        if (
          mustContinueCapture &&
          forcedCapturePiece &&
          currentPlayer === "black" &&
          aiEnabled
        ) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        } else {
          continueMoves = false;
        }
      } else {
        console.log(
          "makeAIMove: no bestMove found; mustContinueCapture=",
          mustContinueCapture,
          "forcedCapturePiece=",
          forcedCapturePiece
            ? forcedCapturePiece.dataset.row +
                "," +
                forcedCapturePiece.dataset.col
            : null
        );
        checkForWin();
        continueMoves = false;
      }
    }
  } catch (err) {
  } finally {
    const thinkingDuration = Date.now() - moveStartTime;
    enhancedAI.recordThinkingTime(thinkingDuration);
    updateAIStatsDisplay();
    aiThinking = false;
    updateAIStatus(
      API_CONFIG.enabled ? "Neural Network AI" : "Grandmaster Level"
    );
  }
}

// Highlighting and valid moves
function highlightValidMoves(row, col, piece) {
  clearHighlights();
  const moves = getValidMoves(row, col, piece);
  moves.forEach((move) => {
    const square = squares[move.toRow * BOARD_SIZE + move.toCol];
    square.classList.add(move.isCapture ? "capture-move" : "valid-move");
  });
}

function clearHighlights() {
  squares.forEach((square) => {
    square.classList.remove("valid-move", "capture-move");
  });
}

function getValidMoves(row, col, piece) {
  const mandatoryMoves = findMandatoryCaptures(currentPlayer);
  if (mandatoryMoves.length > 0) {
    return mandatoryMoves.filter(
      (move) => move.fromRow === row && move.fromCol === col
    );
  }
  return findPossibleMoves(row, col, piece);
}

function findMandatoryCaptures(playerColor) {
  if (mustContinueCapture && forcedCapturePiece) {
    const r = parseInt(forcedCapturePiece.dataset.row);
    const c = parseInt(forcedCapturePiece.dataset.col);
    // Pass lastJumpDirection to enforce no-backtracking
    return findPossibleCaptures(
      r,
      c,
      forcedCapturePiece,
      [],
      lastJumpDirection
    );
  }

  const captureMoves = [];
  // Use faster iteration
  for (let i = 0; i < squares.length; i++) {
    const p = squares[i].querySelector(".red-piece, .black-piece, .king");
    if (p && p.dataset.color === playerColor) {
      const r = Math.floor(i / BOARD_SIZE);
      const c = i % BOARD_SIZE;
      // Normal captures don't have a starting direction restriction
      const pieceCaptures = findPossibleCaptures(r, c, p, [], null);
      if (pieceCaptures.length > 0) {
        captureMoves.push(...pieceCaptures);
      }
    }
  }

  // ENFORCE MAXIMUM CAPTURE FOR HUMANS
  if (captureMoves.length > 0) {
    return enhancedAI.filterForMaximumCaptures(captureMoves);
  }
  return [];
}

// NEW: Filter captures for human players (same logic as AI)
function filterForMaximumCapturesHuman(captureMoves) {
  // Calculate capture count for each move
  const movesWithCounts = captureMoves.map((move) => {
    const captureCount = getTotalCaptureCountHuman(move);
    return {
      ...move,
      totalCaptureCount: captureCount,
    };
  });

  // Find the maximum capture count
  const maxCaptureCount = Math.max(
    ...movesWithCounts.map((m) => m.totalCaptureCount)
  );

  // Filter to only include moves with maximum captures
  const maxCaptureMoves = movesWithCounts.filter(
    (m) => m.totalCaptureCount === maxCaptureCount
  );

  if (maxCaptureCount > 1) {
    showMessage(`You MUST capture ${maxCaptureCount} pieces!`, "warning");
  }

  return maxCaptureMoves;
}

// NEW: Calculate capture count for human player moves
function getTotalCaptureCountHuman(move) {
  if (!move.isCapture) return 0;

  // For king multi-captures
  if (move.capturedPieces && move.capturedPieces.length > 0) {
    return move.capturedPieces.length;
  }

  // For regular pieces, simulate the capture sequence
  return calculateCaptureSequenceLength(move);
}

// NEW: Calculate the total length of a capture sequence for regular pieces
function calculateCaptureSequenceLength(move, lastDirection = null) {
  let totalCaptures = 1; // Start with the immediate capture

  // Track current direction
  const dRow = Math.sign(move.toRow - move.fromRow);
  const dCol = Math.sign(move.toCol - move.fromCol);
  const currentDirection = [dRow, dCol];

  // Simulate this capture and check for continuation
  const simulatedBoard = simulateCapture(move);
  const furtherCaptures = findContinuationCaptures(
    simulatedBoard,
    move.toRow,
    move.toCol,
    move.piece,
    currentDirection // NEW: Pass direction to prevent backtrack
  );

  if (furtherCaptures.length > 0) {
    // Find the longest continuation path
    let maxContinuation = 0;
    for (const nextMove of furtherCaptures) {
      const continuationLength = calculateCaptureSequenceLength(
        nextMove,
        currentDirection
      );
      maxContinuation = Math.max(maxContinuation, continuationLength);
    }
    totalCaptures += maxContinuation;
  }

  return totalCaptures;
}

// NEW: Simulate a capture move on the board
function simulateCapture(move) {
  const board = Array(BOARD_SIZE)
    .fill(null)
    .map(() => Array(BOARD_SIZE).fill(null));

  // Copy current board state
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = getPieceAt(r, c);
      if (piece) {
        board[r][c] = {
          color: piece.dataset.color,
          king: piece.dataset.king === "true",
        };
      }
    }
  }

  // Apply the move
  board[move.toRow][move.toCol] = board[move.fromRow][move.fromCol];
  board[move.fromRow][move.fromCol] = null;

  // Remove captured piece - ensure it's a valid 2-square jump
  const rowDiff = Math.abs(move.toRow - move.fromRow);
  const colDiff = Math.abs(move.toCol - move.fromCol);

  if (rowDiff === 2 && colDiff === 2) {
    const capturedRow = (move.fromRow + move.toRow) / 2;
    const capturedCol = (move.fromCol + move.toCol) / 2;
    board[capturedRow][capturedCol] = null;
  }

  return board;
}

// NEW: Find continuation captures on a simulated board
function findContinuationCaptures(
  board,
  row,
  col,
  piece,
  lastDirection = null
) {
  const captures = [];
  const opponentColor = piece.dataset.color === "red" ? "black" : "red";
  const directions = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (const [dRow, dCol] of directions) {
    // NEW: No backtracking in multi-capture simulation
    if (
      lastDirection &&
      dRow === -lastDirection[0] &&
      dCol === -lastDirection[1]
    ) {
      continue;
    }

    const middleRow = row + dRow;
    const middleCol = col + dCol;
    const jumpRow = row + dRow * 2;
    const jumpCol = col + dCol * 2;

    if (
      jumpRow >= 0 &&
      jumpRow < BOARD_SIZE &&
      jumpCol >= 0 &&
      jumpCol < BOARD_SIZE
    ) {
      const middlePiece = board[middleRow]?.[middleCol];
      const landSquare = board[jumpRow]?.[jumpCol];

      if (middlePiece && middlePiece.color === opponentColor && !landSquare) {
        captures.push({
          fromRow: row,
          fromCol: col,
          toRow: jumpRow,
          toCol: jumpCol,
          piece: piece,
          isCapture: true,
        });
      }
    }
  }

  return captures;
}

function findPossibleCaptures(
  row,
  col,
  piece,
  alreadyCaptured = [],
  lastDir = null
) {
  const moves = [];
  const isKing = piece.dataset.king === "true";

  if (isKing) {
    // King multi-capture logic - pass already captured pieces AND last direction
    return enhancedAI.getKingCaptureSequences(
      row,
      col,
      piece,
      alreadyCaptured,
      0,
      null,
      lastDir
    );
  } else {
    // Regular piece multi-capture chain generation with backtracking prevention
    function buildCaptureChains(r, c, capturedSoFar, prevDir = null) {
      const currentPieceColor = piece.dataset.color;
      const opponentColorVal = currentPieceColor === "red" ? "black" : "red";
      const tacticalDirections = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];
      const availableCapturesList = [];

      for (const [deltaRow, deltaCol] of tacticalDirections) {
        // RULE: No 180-degree backtracking in a single multi-capture chain
        if (prevDir && deltaRow === -prevDir[0] && deltaCol === -prevDir[1])
          continue;

        const victimRowIdx = r + deltaRow;
        const victimColIdx = c + deltaCol;
        const jumpRowIdx = r + deltaRow * 2;
        const jumpColIdx = c + deltaCol * 2;

        const isJumpInBounds =
          jumpRowIdx >= 0 &&
          jumpRowIdx < BOARD_SIZE &&
          jumpColIdx >= 0 &&
          jumpColIdx < BOARD_SIZE;

        if (isJumpInBounds) {
          const victimPieceEle = getPieceAt(victimRowIdx, victimColIdx);
          const landingSquareEle = getPieceAt(jumpRowIdx, jumpColIdx);
          const victimPositionKey = `${victimRowIdx},${victimColIdx}`;
          const isVictimAlreadyClaimed =
            capturedSoFar.includes(victimPositionKey);

          if (
            victimPieceEle &&
            victimPieceEle.dataset.color === opponentColorVal &&
            !landingSquareEle &&
            !isVictimAlreadyClaimed
          ) {
            const updatedCapturedList = [...capturedSoFar, victimPositionKey];
            const primaryCaptureRecord = {
              fromRow: row,
              fromCol: col,
              toRow: jumpRowIdx,
              toCol: jumpColIdx,
              piece: piece,
              isCapture: true,
              capturedRow: victimRowIdx,
              capturedCol: victimColIdx,
              capturedPieces: updatedCapturedList,
              isKingCapture: victimPieceEle.dataset.king === "true",
            };

            // Explore further chain possibilities from landing site
            const sequentialCaptures = buildCaptureChains(
              jumpRowIdx,
              jumpColIdx,
              updatedCapturedList,
              [deltaRow, deltaCol]
            );

            if (sequentialCaptures.length > 0) {
              availableCapturesList.push(primaryCaptureRecord);
              availableCapturesList.push(...sequentialCaptures);
            } else {
              availableCapturesList.push(primaryCaptureRecord);
            }
          }
        }
      }
      return availableCapturesList;
    }

    // Initialize chain building, respecting the incoming lastDir (if any)
    const finalCaptureSequence = buildCaptureChains(
      row,
      col,
      alreadyCaptured,
      lastDir
    );
    moves.push(...finalCaptureSequence);
  }
  return moves;
}

function findPossibleMoves(row, col, piece) {
  const moves = [];
  const isKing = piece.dataset.king === "true";
  const color = piece.dataset.color;
  const directions = isKing
    ? [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]
    : color === "red"
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ];

  if (isKing) {
    for (const [dRow, dCol] of directions) {
      for (let i = 1; i < BOARD_SIZE; i++) {
        const newRow = row + dRow * i;
        const newCol = col + dCol * i;
        if (
          newRow < 0 ||
          newRow >= BOARD_SIZE ||
          newCol < 0 ||
          newCol >= BOARD_SIZE
        )
          break;
        const targetPiece = getPieceAt(newRow, newCol);
        if (targetPiece) break;
        moves.push({
          fromRow: row,
          fromCol: col,
          toRow: newRow,
          toCol: newCol,
          piece: piece,
          isCapture: false,
        });
      }
    }
  } else {
    for (const [dRow, dCol] of directions) {
      const newRow = row + dRow;
      const newCol = col + dCol;
      if (
        newRow >= 0 &&
        newRow < BOARD_SIZE &&
        newCol >= 0 &&
        newCol < BOARD_SIZE
      ) {
        if (!getPieceAt(newRow, newCol)) {
          moves.push({
            fromRow: row,
            fromCol: col,
            toRow: newRow,
            toCol: newCol,
            piece: piece,
            isCapture: false,
          });
        }
      }
    }
  }
  return moves;
}

// Win condition
function checkForWin() {
  const allBlack = document.querySelectorAll(".black-piece");
  const allRed = document.querySelectorAll(".red-piece");

  const blackPieces = allBlack.length;
  const redPieces = allRed.length;

  const blackKings = Array.from(allBlack).filter(
    (p) => p.dataset.king === "true"
  ).length;
  const redKings = Array.from(allRed).filter(
    (p) => p.dataset.king === "true"
  ).length;

  if (redPieces === 0) {
    endGame("Black");
    return true;
  }
  if (blackPieces === 0) {
    endGame("Red");
    return true;
  }

  // Draw condition: 1 King vs 1 King
  if (
    blackPieces === 1 &&
    blackKings === 1 &&
    redPieces === 1 &&
    redKings === 1
  ) {
    endGame("Draw");
    return true;
  }

  // Check if a player has no more moves
  const redMoves =
    findMandatoryCaptures("red").length > 0
      ? findMandatoryCaptures("red")
      : getAllPlayerMoves("red");
  if (redMoves.length === 0) {
    endGame("Black");
    return true;
  }

  const blackMoves =
    findMandatoryCaptures("black").length > 0
      ? findMandatoryCaptures("black")
      : getAllPlayerMoves("black");
  if (blackMoves.length === 0) {
    endGame("Red");
    return true;
  }

  return false;
}

function getAllPlayerMoves(playerColor) {
  const allMoves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = getPieceAt(r, c);
      if (p && p.dataset.color === playerColor) {
        allMoves.push(...findPossibleMoves(r, c, p));
      }
    }
  }
  return allMoves;
}

function endGame(winner) {
  gameOver = true;

  // Determine winner for API
  let apiWinner = "draw";
  if (winner === "Black") {
    apiWinner = "black";
  } else if (winner === "Red") {
    apiWinner = "red";
  }

  // Send result to API for learning
  sendGameResultToAPI(apiWinner);
  // Send result to Global AI collector (Supabase) if configured
  sendGameResultToGlobalAI(apiWinner);

  // Analyze defensive performance
  analyzeGameDefense();

  if (winner === "Draw") {
    showMessage("Game is a Draw! (1 King vs 1 King)", "info");
    enhancedAI.recordGame("draw");
  } else {
    showMessage(`${winner} wins!`, "win");
    setTimeout(() => showMessage(""), 10000); // Display win message for 10 seconds
    if (winner === "Black") {
      enhancedAI.recordGame(true);
    } else {
      enhancedAI.recordGame(false);
    }
  }
  updateAIStatsDisplay();
}

// UI updates
function updateTurnIndicator() {
  const indicator = document.getElementById("turn-indicator");
  indicator.textContent =
    currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1) + "'s Turn";
  indicator.style.color = currentPlayer === "red" ? "#ff6b6b" : "#a9a9a9";
}

function updateScores(capturedColor) {
  if (capturedColor === "red") {
    blackScore++;
    document.getElementById("black-score").textContent = blackScore;
  } else if (capturedColor === "black") {
    redScore++;
    document.getElementById("red-score").textContent = redScore;
  }
  // If capturedColor is undefined or invalid, do nothing (fixes initialization bug)
  savePanelStats(); // Save stats whenever a capture occurs
}

function updateScoreDisplay() {
  // Update the display without changing the actual scores
  document.getElementById("red-score").textContent = redScore;
  document.getElementById("black-score").textContent = blackScore;
}

function updateMoveCount() {
  document.getElementById("move-count").textContent = moveCount;
  savePanelStats(); // Save stats whenever move count changes
}

function updateAIStatus(status) {
  const aiStatus = document.getElementById("ai-status");
  aiStatus.textContent = status;
  if (status.toLowerCase().includes("thinking")) {
    aiStatus.classList.add("thinking");
  } else {
    aiStatus.classList.remove("thinking");
  }
}

// Save panel statistics to localStorage
function savePanelStats() {
  localStorage.setItem(
    "checkers_panelStats",
    JSON.stringify({
      redScore: redScore,
      blackScore: blackScore,
      moveCount: moveCount,
    })
  );
}

// Load panel statistics from localStorage
function loadPanelStats() {
  try {
    const saved = localStorage.getItem("checkers_panelStats");
    if (saved) {
      const stats = JSON.parse(saved);
      redScore = stats.redScore || 0;
      blackScore = stats.blackScore || 0;
      moveCount = stats.moveCount || 0;
    }
  } catch (e) {}
}

function showMessage(msg, type = "") {
  const messageArea = document.getElementById("game-message");
  const msgContainer = document.querySelector(".message-area-container");
  const titleEl = document.getElementById("main-title");

  if (!msg) {
    // No message -> Hide message container, Show Title
    if (msgContainer) msgContainer.style.display = "none";
    if (titleEl) titleEl.style.display = "block";
    if (messageArea) messageArea.textContent = "";
    return;
  }

  // Has message -> Hide Title, Show message container
  if (titleEl) titleEl.style.display = "none";
  if (msgContainer) msgContainer.style.display = "flex";

  if (messageArea) {
    messageArea.textContent = msg;
    messageArea.className = "message-area"; // Reset classes
    if (type) {
      messageArea.classList.add(`${type}-message`);
    }
  }
}

function updateAIStatsDisplay() {
  if (!defensiveMetrics || !defensiveState) return;

  const defenseStatsEl = document.getElementById("defense-stats");
  if (!defenseStatsEl) return;

  // Calculate defensive performance metrics
  const snapshots = defensiveMetrics.snapshots || [];

  let avgHealth = 0;
  let peakHealth = 0;
  let lowestHealth = 100;

  if (snapshots.length > 0) {
    const healthValues = snapshots.map((s) => s.defensiveHealth);
    avgHealth = healthValues.reduce((a, b) => a + b, 0) / healthValues.length;
    peakHealth = Math.max(...healthValues);
    lowestHealth = Math.min(...healthValues);
  }

  const checkIntervals = snapshots.length;
  const gameLengthMoves = moveCount;

  // Determine performance rating
  let performanceRating = "Excellent";
  let ratingEmoji = "🟢";
  if (avgHealth < 60) {
    performanceRating = "Struggling";
    ratingEmoji = "🔴";
  } else if (avgHealth < 75) {
    performanceRating = "Fair";
    ratingEmoji = "🟡";
  } else if (avgHealth < 85) {
    performanceRating = "Good";
    ratingEmoji = "🟢";
  } else {
    performanceRating = "Excellent";
    ratingEmoji = "💚";
  }

  // Format the display box
  const statsBox = `╔══════════════════════╗
   DEFENSE SUMMARY ${ratingEmoji}
╠══════════════════════╣
Avg Health:  ${avgHealth.toFixed(1).padStart(5)}/100
Peak Health: ${peakHealth.toFixed(0).padStart(5)}/100
Low Health:  ${lowestHealth.toFixed(0).padStart(5)}/100
Rating:      ${performanceRating.padEnd(9)}
──────────────────────
Checks:      ${checkIntervals.toString().padStart(5)}
Moves:       ${gameLengthMoves.toString().padStart(5)}
╚══════════════════════╝`;

  defenseStatsEl.textContent = statsBox;
}

// Control functions
async function resetGame() {
  // Auto-start services when new game is clicked
  // This integrates with the auto-launcher for seamless gameplay
  if (SERVICE_CONTROLLER_ENABLED && !servicesStarted && !servicesOffline) {
    // Show that we're attempting to start services
    showMessage("starting backend", "info");

    const started = await startServices();

    if (started) {
      // Services started successfully
      showMessage("Services ready!", "success");
    } else {
      // Services not available - will use local AI
      showMessage("Using local AI", "info");
    }
  } else if (servicesOffline) {
    // Already in offline mode, stay there
    showMessage("Playing with local AI", "info");
  }

  // Try to auto-resume learning if API is available
  if (API_CONFIG.enabled && !servicesOffline) {
    try {
      const resp = await apiFetch(`/api/stats`).catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        if (!data.learning_active && data.learning_iterations === 0) {
          await resumeLearning().catch(() => {
            // Fail silently if resume doesn't work
          });
        }
      }
    } catch (error) {
      // Silent - will use offline mode
    }
  }

  // Only count as a game if there were meaningful moves (at least 4 moves played)
  if (!gameOver && moveCount >= 4) {
    enhancedAI.recordGame(true); // AI wins
  }

  // Reset panel statistics to 0 for new game
  moveCount = 0;
  redScore = 0;
  blackScore = 0;
  savePanelStats(); // Save the reset values

  initGame();
}

// Utility
function getPieceAt(row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
  return squares[row * BOARD_SIZE + col].querySelector(
    ".red-piece, .black-piece, .king"
  );
}

// Initial setup
document.addEventListener("DOMContentLoaded", initGame);

// Catch page abandonment - save memory before page unloads
window.addEventListener("beforeunload", () => {
  // Always save current state before leaving
  enhancedAI.saveMemory();

  // Stop keep-alive when game ends
  stopKeepAlive();

  // Optional: Stop services when page unloads (comment out to keep running)
  // await stopServices();

  // [REMOVED] REMOVED: Don't record abandoned games - this was causing duplicate counts on refresh
  // The game will be counted if it actually finishes via endGame()
});

// Enhanced AI Checkers - Working Implementation

// API Configuration for Neural Network AI
// For deployment, change baseUrl to your Vercel URL:
// baseUrl: "https://YOUR-APP.vercel.app/api"
const API_CONFIG = {
  enabled: true,
  // Use localhost for local development, empty string for Vercel deployment (relative path)
  baseUrl:
    window.location.hostname === "localhost" ||
    window.location.protocol === "file:"
      ? "http://localhost:8000"
      : "",
  timeout: 5000,
};

// Service Controller Configuration
const SERVICE_CONTROLLER_URL = "http://localhost:9000";
let keepAliveInterval = null;
let servicesStarted = false;
let servicesOffline = false; // Track if we're in offline mode
let lastServiceCheckTime = 0;
const SERVICE_CHECK_COOLDOWN = 30000; // Don't check too frequently (30 seconds)

async function startServices() {
  // Start FastAPI server and learning worker via auto-launcher
  try {
    const response = await fetch(`${SERVICE_CONTROLLER_URL}/start`, {
      method: "GET",
      mode: "cors",
      timeout: 4000
    }).catch(e => {
      servicesOffline = true;
      console.log("Auto-launcher not responding - using offline mode");
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
      console.log("Services not responding - using offline mode");
      return false;
    }
  } catch (error) {
    servicesOffline = true;
    console.log("Services unavailable - using offline mode", error.message);
    return false;
  }
}

function startKeepAlive() {
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
        timeout: 2000
      });
      
      if (response && response.ok) {
        const status = await response.json();
        if (!status.both_running) {
          // Services crashed, but don't try to restart - go offline instead
          servicesOffline = true;
          console.log("Services detected offline, switching to offline mode");
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
  // Stop FastAPI server and learning worker
  try {
    const response = await fetch(`${SERVICE_CONTROLLER_URL}/stop`, {
      method: "GET",
      mode: "cors",
      timeout: 5000
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
    return Promise.reject(new Error("API offline - continuing in offline mode"));
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

const PERIODIC_EVAL_INTERVAL = 5;  // Every 5 moves
const HEALTH_WARNING_THRESHOLD = 60;
const HEALTH_CRITICAL_THRESHOLD = 40;

// Enhanced AI system
const enhancedAI = {
  difficulty: 99,
  maxDepth: 10,

  // Base weights that evolve over many games
  baseWeights: {
    // Core values
    material: 1000000, // ABSOLUTE: Pieces are multi-million point assets
    king: 2500000,    // Kings are priceless

    // Strategic weights - ABSOLUTE DEFENSE
    position: 10,
    safety: 1000000,
    mobility: 1,
    center: 5,
    advancement: 5, // Near zero: Only advance in absolute vacuum
    cohesion: 1000,
    selfDanger: 10000000, // TOTAL FORBID: Avoid being captured at all cost (including stalemates)

    // Tactical weights - DEFENSIVE CAPTURES ONLY
    captureBase: 8000,
    multiCaptureBonus: 2000,
    kingCaptureBonus: 10000,
    safeCaptureBonus: 3000,
    promotionBonus: 1000, // Low - promotion is not a priority
    promotionRush: 3000000, 
    nearPromotionAdvancement: 3000, // NEW: Reward forward movement when close
    threatCreation: 50, // Purely reactive defense
    defensiveValue: 2000,
    kingProtection: 10000, 
    kingExposurePenalty: 50000, 
    tacticalThreatBonus: 1,
    kingEndangerPenalty: 1000000, 

    // Attack mode weights - BLOCKED
    sacrificeThreshold: 10000000, // Effectively infinite
    exchangeFavorable: 10,  // Even a "good" trade is avoided
    exchangeUnfavorable: 10000000, 
    chainPreventionMajor: 10000, 
    chainPreventionMinor: 5000, 
    threatNeutralization: 2000, 
    tacticalPressure: 1, 
    activityGain: 1,

    // Positional weights - MAXIMUM DEFENSIVE FOCUS WITH GAP CLOSURE
    gapClosure: 5000, 
    support: 5000, 
    edgeSafety: 2000, 
    isolationPenalty: 50000, 
    cohesionBonus: 1000,
    isolationPenaltyFromCohesion: 1000,
    tightFormationBonus: 5000, 
    gapClosureBonus: 5000, 
    supportBonus: 10000, 
    leavingGapPenalty: 1000000, // ABSOLUTE LOCK
    fragmentationPenalty: 500000,
    defensiveLinePenalty: 200000,
    defensiveHolePenalty: 1000000,
    penetrationRiskPenalty: 50000,
    followLeaderBonus: 700, // Increased from 400 - follow advanced pieces to close gaps
    advancementBonus: 20, // Reduced - very cautious advancement
    fillGapBonus: 900, // Increased from 600 - fill defensive gaps is TOP PRIORITY
    compactFormationBonus: 800, // Increased from 500 - tight formation is critical
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
    formationGap: 10000, 
    backRankLeaving: 1000000, // ABSOLUTE BACK RANK LOCK
    backRankDefense: 100000,
    holeFilling: 50000,
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
      avoidCapture: 5000,       // Must not lose pieces
      kingProtection: 8000,     // Kings are irreplaceable  
      avoidTrap: 6000,          // Don't get trapped
    },
    
    // TIER 2: STRUCTURAL (Formation - 1000-2000)
    // These maintain formation integrity
    structural: {
      gapClosure: 1000,         // Fill gaps
      support: 1500,            // Keep pieces supported
      isolation: 2000,          // Never isolate pieces
      cohesion: 1200,           // Stay grouped
    },
    
    // TIER 3: POSITIONAL (Nice-to-haves - 100-500)
    // These improve position but aren't critical
    positional: {
      backRank: 300,            // Defend back rank
      lineStrength: 200,        // Maintain defensive lines
      sideSquares: 150,         // Prefer edge positions
      advancement: 100,         // Cautious forward movement
    }
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

  evaluatePosition_Legacy(color) {
    let score = 0;
    let materialBalance = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (!piece) continue;

        const isKing = piece.dataset.king === "true";
        const pieceColor = piece.dataset.color;
        let pieceValue = isKing ? this.weights.king : this.weights.material;

        // Positional bonuses
        pieceValue += this.evaluatePosition_single(row, col, piece);

        if (pieceColor === color) {
          score += pieceValue;
          materialBalance++;
        } else {
          score -= pieceValue;
          materialBalance--;
        }
      }
    }

    // Add tactical bonuses
    score += this.evaluateTacticalThreats(color) * 2;
    score += this.evaluateKingSafety(color);
    score += this.evaluateMobility(color);

    return score;
  },

  evaluatePosition_single(row, col, piece) {
    let posScore = 0;
    const isKing = piece.dataset.king === "true";
    const color = piece.dataset.color;

    // Center control
    const centerDistance =
      Math.abs(row - (BOARD_SIZE - 1) / 2) +
      Math.abs(col - (BOARD_SIZE - 1) / 2);
    posScore += (BOARD_SIZE - 1 - centerDistance) * this.weights.center;

    // Edge safety
    if (col === 0 || col === BOARD_SIZE - 1) {
      posScore += this.weights.position;
    }

    // Advancement for regular pieces
    if (!isKing) {
      const advancement = color === "black" ? row : BOARD_SIZE - 1 - row;
      posScore += advancement * this.weights.advancement;
    }

    // King positioning
    if (isKing) {
      posScore += this.weights.position * 2;
    }

    return posScore;
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
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dRow, dCol] of directions) {
      const landingRow = row + dRow;
      const landingCol = col + dCol;

      if (landingRow < 0 || landingRow >= BOARD_SIZE || 
          landingCol < 0 || landingCol >= BOARD_SIZE) {
        continue;
      }

      const landPiece = this.getPieceAt(landingRow, landingCol);
      if (landPiece) continue;

      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const attackRow = row - dRow * dist;
        const attackCol = col - dCol * dist;

        if (attackRow < 0 || attackRow >= BOARD_SIZE || 
            attackCol < 0 || attackCol >= BOARD_SIZE) {
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
      details: []
    };
    
    // Early exit: invalid position
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return threats;
    }
    
    const opponentColor = piece.dataset.color === "red" ? "black" : "red";
    const directions = [[-1,-1], [-1,1], [1,-1], [1,1]];
    
    for (const [dRow, dCol] of directions) {
      // Check if landing square is empty
      const landRow = row + dRow;
      const landCol = col + dCol;
      
      if (landRow < 0 || landRow >= BOARD_SIZE || 
          landCol < 0 || landCol >= BOARD_SIZE) {
        continue;
      }
      
      if (this.getPieceAt(landRow, landCol)) {
        continue;
      }
      
      // Look for attacker pieces along opposite diagonal
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const atkRow = row - dRow * dist;
        const atkCol = col - dCol * dist;
        
        if (atkRow < 0 || atkRow >= BOARD_SIZE || 
            atkCol < 0 || atkCol >= BOARD_SIZE) {
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
              pieceType: isKing ? "king" : "regular"
            });
            
            if (depth > 0) {
              const chainDepth = this.checkContinuationCaptures(
                landRow, landCol,
                opponentColor, depth - 1
              );
              threats.chain = Math.max(threats.chain, chainDepth);
            }
          }
        }
        
        break;
      }
    }
    
    threats.total = threats.immediate + (threats.chain * 0.5);
    return threats;
  },

  // Helper: Check for continuation captures
  checkContinuationCaptures(row, col, opponentColor, depth) {
    if (depth <= 0) return 0;
    
    let maxChain = 0;
    const directions = [[-1,-1], [-1,1], [1,-1], [1,1]];
    
    for (const [dRow, dCol] of directions) {
      const landRow = row + dRow;
      const landCol = col + dCol;
      
      if (landRow < 0 || landRow >= BOARD_SIZE || 
          landCol < 0 || landCol >= BOARD_SIZE) {
        continue;
      }
      
      if (this.getPieceAt(landRow, landCol)) {
        continue;
      }
      
      for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const atkRow = row - dRow * dist;
        const atkCol = col - dCol * dist;
        
        if (atkRow < 0 || atkRow >= BOARD_SIZE || 
            atkCol < 0 || atkCol >= BOARD_SIZE) {
          break;
        }
        
        const attacker = this.getPieceAt(atkRow, atkCol);
        if (!attacker) continue;
        
        if (attacker.dataset.color === opponentColor) {
          const isKing = attacker.dataset.king === "true";
          if (isKing || dist === 1) {
            const chainDepth = 1 + this.checkContinuationCaptures(
              landRow, landCol, opponentColor, depth - 1
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
        safetyScore -= 150;
      } else {
        // For non-captures, heavily penalize moving into danger
        safetyScore -= 500;
      }
    }

    // 2. Check if there are safe alternatives available
    const hasSafeAlternative = this.hasSafeAlternativeMove(move);
    if (!destinationSafe && hasSafeAlternative) {
      // Extra penalty if we have safe options but choosing dangerous one
      safetyScore -= 300;
    }

    // 3. Bonus for maintaining protected positions
    if (destinationSafe && this.hasAdjacentAllies(move.toRow, move.toCol)) {
      safetyScore += 100;
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
      consequenceScore -= 400;

      if (opponentThreats.captureIsUnavoidable) {
        // If we're sacrificing the piece with no gain
        consequenceScore -= 200;
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
    const pieceValue = move.piece.dataset.king === "true" ? 300 : 100;

    // EMERGENCY CHECK: Is this a completely pointless sacrifice?
    if (this.willBeUnderThreat(toRow, toCol, move.piece) && !move.isCapture) {
      antiSacrificeScore -= 10000; // MASSIVE penalty to block this move
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
          const value = piece.dataset.king === "true" ? 3 : 1;
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
          hash += piece.dataset.color[0] + (piece.dataset.king === "true" ? "K" : "P");
        } else {
          hash += ".";
        }
      }
    }
    return hash;
  },

  precomputeFormationState() {
    const currentBoardHash = this.getCurrentBoardHash();
    if (cachedFormationState && cachedFormationState.boardHash === currentBoardHash) {
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
      timestamp: Date.now()
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
    for (const [dRow, dCol] of [[-1,-1], [-1,1], [1,-1], [1,1]]) {
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
    
    for (const [r, c] of [[fromRow-1, fromCol-1], [fromRow-1, fromCol+1], 
                           [fromRow+1, fromCol-1], [fromRow+1, fromCol+1]]) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const support = cached.supportMap.get(`${r},${c}`) || 0;
        if (support === 1) return true;
      }
    }
    return false;
  },

  createsOpponentChain(move) {
    const { toRow, toCol, fromRow, fromCol } = move;
    
    for (const [dRow, dCol] of [[1,-1], [1,1]]) {
      const checkRow = fromRow + dRow;
      const checkCol = fromCol + dCol;
      
      if (checkRow < 0 || checkRow >= BOARD_SIZE) continue;
      if (checkCol < 0 || checkCol >= BOARD_SIZE) continue;
      
      const piece = this.getPieceAt(checkRow, checkCol);
      if (piece && piece.dataset.color === "black") {
        const jumpRow = checkRow + dRow;
        const jumpCol = checkCol + dCol;
        
        if (jumpRow >= 0 && jumpRow < BOARD_SIZE &&
            jumpCol >= 0 && jumpCol < BOARD_SIZE) {
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

  // NEW: Evaluate if this move fills a gap left by an advanced piece
  evaluateGapFilling(move) {
    let fillScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;
    const fromRow = move.fromRow;

    // Moving forward is good
    const isMovingForward = toRow > fromRow;

    if (isMovingForward) {
      // Check if there are friendly pieces ahead of us (we're following them)
      const checkAhead = [
        [1, -1],
        [1, 0],
        [1, 1],
        [2, -1],
        [2, 0],
        [2, 1],
      ];

      let piecesAhead = 0;
      for (const [dRow, dCol] of checkAhead) {
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
            piecesAhead++;
          }
        }
      }

      // If there are pieces ahead, we're filling the gap - GOOD!
      if (piecesAhead > 0) {
        fillScore += this.weights.fillGapBonus;

        // Extra bonus if we're maintaining a tight line
        if (piecesAhead >= 2) {
          fillScore += this.weights.compactFormationBonus;
        }
      }
    }

    return fillScore;
  },

  // NEW: Reward following advanced pieces
  evaluateFollowLeader(move) {
    let followScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;
    const fromRow = move.fromRow;

    // Check if we're moving forward
    if (toRow <= fromRow) return 0; // Not advancing

    // Find the most advanced friendly piece
    let mostAdvancedRow = -1;
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (
          piece &&
          piece.dataset.color === "black" &&
          piece.dataset.king !== "true"
        ) {
          if (row > mostAdvancedRow) {
            mostAdvancedRow = row;
          }
        }
      }
    }

    // If we're moving closer to the most advanced piece's row, reward it
    if (mostAdvancedRow > 0) {
      const currentDistanceToLeader = Math.abs(fromRow - mostAdvancedRow);
      const newDistanceToLeader = Math.abs(toRow - mostAdvancedRow);

      // Reward getting closer to the leader
      if (newDistanceToLeader < currentDistanceToLeader) {
        followScore += this.weights.followLeaderBonus;
      }

      // Extra bonus if we're in the same row or 1 row behind the leader
      if (Math.abs(toRow - mostAdvancedRow) <= 1) {
        followScore += this.weights.advancementBonus;
      }
    }

    return followScore;
  },

  // NEW: Reward keeping formation compact while advancing
  evaluateCompactAdvancement(move) {
    let compactScore = 0;
    const toRow = move.toRow;
    const toCol = move.toCol;

    // Count friendly pieces in the same and adjacent rows
    let piecesInFormation = 0;
    for (let col = 0; col < BOARD_SIZE; col++) {
      // Check same row
      const samePiece = this.getPieceAt(toRow, col);
      if (samePiece && samePiece.dataset.color === "black") {
        piecesInFormation++;
      }

      // Check row behind
      if (toRow - 1 >= 0) {
        const behindPiece = this.getPieceAt(toRow - 1, col);
        if (behindPiece && behindPiece.dataset.color === "black") {
          piecesInFormation++;
        }
      }

      // Check row ahead
      if (toRow + 1 < BOARD_SIZE) {
        const aheadPiece = this.getPieceAt(toRow + 1, col);
        if (aheadPiece && aheadPiece.dataset.color === "black") {
          piecesInFormation++;
        }
      }
    }

    // Reward having many pieces in formation (3-row band)
    if (piecesInFormation >= 6) {
      compactScore += this.weights.compactFormationBonus;
    } else if (piecesInFormation >= 4) {
      compactScore += this.weights.compactFormationBonus * 0.5;
    }

    return compactScore;
  },

  evaluateCenterControl(move) {
    const centerSquares = [
      [4, 4],
      [4, 5],
      [5, 4],
      [5, 5],
    ];
    let centerScore = 0;

    for (const [centerRow, centerCol] of centerSquares) {
      const distance =
        Math.abs(move.toRow - centerRow) + Math.abs(move.toCol - centerCol);
      if (distance === 0) {
        centerScore += this.weights.centerControlDirect;
      } else if (distance === 1) {
        centerScore += this.weights.centerControlNear;
      } else if (distance === 2) {
        centerScore += this.weights.centerControlInfluence;
      }
    }

    return centerScore;
  },

  evaluateKingActivity(move) {
    let activityScore = 0;

    if (move.piece.dataset.king === "true") {
      // Kings should be active and mobile
      const mobility = this.countKingMoves(move.toRow, move.toCol);
      activityScore += mobility * this.weights.kingActivity;

      // Kings should participate in the game
      const opponentThreats = this.countOpponentThreatsFromPosition(
        move.toRow,
        move.toCol
      );
      activityScore += opponentThreats * this.weights.kingThreatBonus;
    }

    return activityScore;
  },

  evaluateKeySquareControl(move) {
    let keySquareScore = 0;

    // Key squares are those that control important diagonals
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

    for (const [keyRow, keyCol] of keySquares) {
      if (move.toRow === keyRow && move.toCol === keyCol) {
        keySquareScore += this.weights.keySquareControl;
      }
    }

    return keySquareScore;
  },

  evaluateTempo(move) {
    let tempoScore = 0;

    // Tempo is about maintaining initiative
    if (move.isCapture) {
      tempoScore += this.weights.tempoCaptureBonus;
    }

    // Moving forward maintains tempo for regular pieces
    if (move.piece.dataset.king !== "true") {
      const advancement =
        move.piece.dataset.color === "black"
          ? move.toRow - move.fromRow
          : move.fromRow - move.toRow;
      if (advancement > 0) {
        tempoScore += advancement * this.weights.tempo;
      }
    }

    return tempoScore;
  },

  evaluateSideOccupation(move) {
    let sideScore = 0;

    // Define side positions (all perimeter squares on dark squares)
    // Side squares are safer because they limit opponent attack angles
    // Dynamically calculate based on current BOARD_SIZE
    const sideSquares = [];
    const size = BOARD_SIZE || 10;

    // Top and Bottom edges
    for (let c = 0; c < size; c++) {
      if ((0 + c) % 2 !== 0) sideSquares.push([0, c]);
      if ((size - 1 + c) % 2 !== 0) sideSquares.push([size - 1, c]);
    }
    // Left and Right edges
    for (let r = 1; r < size - 1; r++) {
      if ((r + 0) % 2 !== 0) sideSquares.push([r, 0]);
      if ((r + (size - 1)) % 2 !== 0) sideSquares.push([r, size - 1]);
    }

    const isSide = sideSquares.some(
      ([r, c]) => r === move.toRow && c === move.toCol
    );

    if (isSide) {
      sideScore += this.weights.sideOccupation;
    }

    // Bonus for moves that get close to available side squares
    const availableSides = sideSquares.filter(([r, c]) => {
      const piece = this.getPieceAt(r, c);
      return !piece; // Side square is empty/available
    });

    if (availableSides.length > 0 && !isSide) {
      // Find the closest available side square
      let minDistance = Infinity;
      for (const [sideRow, sideCol] of availableSides) {
        const distance =
          Math.abs(move.toRow - sideRow) + Math.abs(move.toCol - sideCol);
        minDistance = Math.min(minDistance, distance);
      }

      // Bonus for getting closer to side squares when they're available
      if (minDistance <= 2) {
        const proximityBonus =
          (this.weights.sideProximity * (3 - minDistance)) / 3;
        sideScore += proximityBonus;
      }

      // Extra bonus when side squares are available but not occupied
      if (availableSides.length > 0) {
        sideScore += this.weights.sideAvailable / availableSides.length;
      }
    }

    return sideScore;
  },

  // HELPER FUNCTIONS - Missing implementations

  isPieceUnderThreat(row, col) {
    const piece = this.getPieceAt(row, col);
    if (!piece) return false;
    return this.willBeUnderThreat(row, col, piece);
  },

  countKingMoves(row, col) {
    let moveCount = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      for (let distance = 1; distance < BOARD_SIZE; distance++) {
        const newRow = row + dRow * distance;
        const newCol = col + dCol * distance;
        if (
          newRow < 0 ||
          newRow >= BOARD_SIZE ||
          newCol < 0 ||
          newCol >= BOARD_SIZE
        )
          break;
        if (this.getPieceAt(newRow, newCol)) break;
        moveCount++;
      }
    }
    return moveCount;
  },

  countOpponentThreatsFromPosition(row, col) {
    let threats = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
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

        if (middlePiece && middlePiece.dataset.color === "red" && !landSquare) {
          threats++;
        }
      }
    }
    return threats;
  },

  countOpponentThreatsAfterMove(move) {
    // Enhanced: Calculate actual opponent threats after this move
    return this.calculateOpponentCaptureOpportunities(move);
  },

  // NEW: Enhanced attack mode evaluation system
  evaluateAttackMode(move) {
    let attackScore = 0;

    // 1. SACRIFICIAL ATTACK EVALUATION - CRITICAL SAFETY CHECK
    const sacrificeAnalysis = this.evaluateSacrificalAttack(move);
    attackScore += sacrificeAnalysis.score;

    // ENHANCED LOGGING for sacrifice detection
    if (sacrificeAnalysis.isSacrifice) {
    }

    // 2. EXCHANGE EVALUATION
    const exchangeValue = this.evaluateExchange(move);
    attackScore += exchangeValue;

    // 3. PREVENT OPPONENT CONTINUOUS CAPTURE
    const chainPrevention = this.evaluateOpponentCaptureChainPrevention(move);
    attackScore += chainPrevention;

    // 4. TACTICAL PRESSURE CREATION
    const pressureValue = this.evaluateTacticalPressure(move);
    attackScore += pressureValue;

    if (Math.abs(attackScore) > 50) {
      if (sacrificeAnalysis.isSacrifice) {
      }
    }

    return attackScore;
  },

  // NEW: Evaluate sacrificial attacks (max 1 piece sacrifice for good reason)
  evaluateSacrificalAttack(move) {
    const result = {
      score: 0,
      isSacrifice: false,
      description: "",
    };

    if (!move.isCapture) return result;

    // Simulate the move and check if we lose a piece
    const willBeCaptured = this.willBeUnderThreat(
      move.toRow,
      move.toCol,
      move.piece
    );

    if (willBeCaptured) {
      result.isSacrifice = true;

      // Calculate what we gain vs what we lose
      const captureGain = this.getTotalCaptureCount(move);
      const sacrificeLoss = move.piece.dataset.king === "true" ? 3 : 1; // King worth 3, regular worth 1

      // Calculate follow-up opportunities after sacrifice
      const followUpOpportunities = this.calculateSacrificeFollowUp(move);

      // STRICT RULE: Only allow sacrifices that gain more than they lose
      const netGain = captureGain + followUpOpportunities - sacrificeLoss;

      if (netGain > 0) {
        // Good sacrifice - we gain more than we lose
        result.score = netGain * 200; // Bonus for profitable sacrifice
        result.description = `Profitable sacrifice: Gain ${
          captureGain + followUpOpportunities
        }, Lose ${sacrificeLoss}`;
      } else if (netGain === 0) {
        // Equal exchange - might be acceptable in certain positions
        const positionalBenefit =
          this.evaluatePositionalBenefitOfSacrifice(move);
        if (positionalBenefit > 100) {
          result.score = positionalBenefit * 0.5; // Reduced bonus for positional sacrifice
          result.description = `Equal exchange with positional benefit`;
        } else {
          result.score = -1000; // HEAVY penalty for neutral sacrifice without benefit (increased from -300)
          result.description = `Neutral sacrifice avoided - no strategic benefit`;
        }
      } else {
        // Bad sacrifice - we lose more than we gain
        result.score = -2000; // MASSIVE penalty for bad sacrifice (increased from -800)
        result.description = `BAD SACRIFICE BLOCKED: Lose ${sacrificeLoss}, Gain ${
          captureGain + followUpOpportunities
        }`;
      }
    }

    return result;
  },

  // NEW: Calculate follow-up opportunities after a sacrifice
  calculateSacrificeFollowUp(move) {
    let followUpValue = 0;

    // Simulate the sacrifice move
    const simulatedBoard = this.simulateCompleteAttack(move);

    // Check what capture opportunities this creates for our other pieces
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);
        if (
          piece &&
          piece.color === "black" &&
          !(row === move.toRow && col === move.toCol)
        ) {
          // Not the sacrificed piece

          const captureOpportunities = this.findCaptureOpportunitiesOnBoard(
            simulatedBoard,
            row,
            col,
            piece
          );
          followUpValue += captureOpportunities.length;
        }
      }
    }

    return followUpValue;
  },

  // NEW: Evaluate positional benefits of sacrifice (promotion, king activation, etc.)
  evaluatePositionalBenefitOfSacrifice(move) {
    let benefit = 0;

    // Check if sacrifice opens path to promotion
    if (this.enablesPromotion(move)) {
      benefit += 150; // Promotion path value
    }

    // Check if sacrifice activates our kings
    const kingActivation = this.calculateKingActivationBenefit(move);
    benefit += kingActivation;

    // Check if sacrifice breaks opponent formation
    const formationDamage = this.calculateOpponentFormationDamage(move);
    benefit += formationDamage;

    return benefit;
  },

  // NEW: Evaluate piece exchanges (trading pieces)
  evaluateExchange(move) {
    if (!move.isCapture) return 0;

    let exchangeScore = 0;
    const capturedPieceValue = this.calculatePieceValue(move);

    // Check if our piece will be recaptured
    const willBeRecaptured = this.willBeUnderThreat(
      move.toRow,
      move.toCol,
      move.piece
    );

    if (willBeRecaptured) {
      const ourPieceValue = move.piece.dataset.king === "true" ? 300 : 100;
      const netExchange = capturedPieceValue - ourPieceValue;

      if (netExchange > 0) {
        exchangeScore += netExchange; // Favorable exchange
      } else if (netExchange < 0) {
        exchangeScore += netExchange * 2; // Penalize unfavorable exchanges more
      }
    } else {
      // Free capture - no exchange
      exchangeScore += capturedPieceValue;
    }

    return exchangeScore;
  },

  // NEW: Prevent creating opponent continuous capture opportunities
  evaluateOpponentCaptureChainPrevention(move) {
    let preventionScore = 0;

    // Check if this move creates a capture chain for opponent
    const captureChainLength =
      this.calculateOpponentCaptureChainAfterMove(move);

    if (captureChainLength > 1) {
      // Heavy penalty for enabling opponent multi-captures
      preventionScore -= captureChainLength * 400;
    } else if (captureChainLength === 1) {
      // Moderate penalty for enabling single capture
      preventionScore -= 150;
    }

    // Bonus for moves that break existing opponent threats
    const threatsNeutralized = this.calculateThreatsNeutralized(move);
    if (threatsNeutralized > 0) {
      preventionScore += threatsNeutralized * 120;
    }

    return preventionScore;
  },

  // NEW: Calculate how many pieces opponent can capture in a chain after our move
  calculateOpponentCaptureChainAfterMove(move) {
    // Simulate our move
    const simulatedBoard = this.simulateMove(move);

    let maxChainLength = 0;

    // Check all opponent pieces for capture chains
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);
        if (piece && piece.color === "red") {
          const chainLength = this.calculateMaxCaptureChain(
            simulatedBoard,
            row,
            col,
            piece,
            []
          );
          maxChainLength = Math.max(maxChainLength, chainLength);
        }
      }
    }

    return maxChainLength;
  },

  // NEW: Calculate maximum capture chain length from a position
  calculateMaxCaptureChain(board, row, col, piece, alreadyCaptured) {
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    let maxChain = 0;
    const isKing = piece.king === true;
    const opponentColor = piece.color === "red" ? "black" : "red";

    for (const [dRow, dCol] of directions) {
      if (isKing) {
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
              const captureKey = `${targetRow},${targetCol}`;
              if (!alreadyCaptured.includes(captureKey)) {
                // Potential capture - check landing squares
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
                  if (this.getPieceAtOnBoard(board, finalRow, finalCol)) break;

                  // Simulate this capture
                  const newBoard = this.copyBoard(board);
                  newBoard[finalRow][finalCol] = newBoard[row][col];
                  newBoard[row][col] = null;
                  newBoard[targetRow][targetCol] = null;

                  const continuationChain = this.calculateMaxCaptureChain(
                    newBoard,
                    finalRow,
                    finalCol,
                    piece,
                    [...alreadyCaptured, captureKey]
                  );
                  maxChain = Math.max(maxChain, 1 + continuationChain);
                }
              }
            }
            break; // Blocked
          }
        }
      } else {
        const targetRow = row + dRow;
        const targetCol = col + dCol;
        const jumpRow = row + dRow * 2;
        const jumpCol = col + dCol * 2;

        if (
          jumpRow >= 0 &&
          jumpRow < BOARD_SIZE &&
          jumpCol >= 0 &&
          jumpCol < BOARD_SIZE
        ) {
          const middlePiece = this.getPieceAtOnBoard(
            board,
            targetRow,
            targetCol
          );
          const landSquare = this.getPieceAtOnBoard(board, jumpRow, jumpCol);
          const captureKey = `${targetRow},${targetCol}`;

          if (
            middlePiece &&
            middlePiece.color === opponentColor &&
            !landSquare &&
            !alreadyCaptured.includes(captureKey)
          ) {
            // Simulate this capture
            const newBoard = this.copyBoard(board);
            newBoard[jumpRow][jumpCol] = newBoard[row][col];
            newBoard[row][col] = null;
            newBoard[targetRow][targetCol] = null;

            const continuationChain = this.calculateMaxCaptureChain(
              newBoard,
              jumpRow,
              jumpCol,
              piece,
              [...alreadyCaptured, captureKey]
            );

            maxChain = Math.max(maxChain, 1 + continuationChain);
          }
        }
      }
    }

    return maxChain;
  },

  // NEW: Evaluate tactical pressure creation
  evaluateTacticalPressure(move) {
    let pressureScore = 0;

    // Count threats created by this move
    const threatsCreated = this.countThreatsCreatedByMove(move);
    pressureScore += threatsCreated * 75;

    // Evaluate tempo gain
    if (move.isCapture) {
      pressureScore += 50; // Captures maintain initiative
    }

    // Evaluate piece activity improvement
    const activityGain = this.calculateActivityGain(move);
    pressureScore += activityGain;

    return pressureScore;
  },

  // NEW: Calculate actual opponent capture opportunities after move
  calculateOpponentCaptureOpportunities(move) {
    const simulatedBoard = this.simulateMove(move);
    let totalThreats = 0;

    // Count all opponent capture opportunities
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);
        if (piece && piece.color === "red") {
          const captures = this.findCaptureOpportunitiesOnBoard(
            simulatedBoard,
            row,
            col,
            piece
          );
          totalThreats += captures.length;
        }
      }
    }

    return totalThreats;
  },

  evaluateGamePhase(move) {
    let phaseScore = 0;
    let totalPieces = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.getPieceAt(row, col)) totalPieces++;
      }
    }

    if (totalPieces <= 16) {
      // Endgame: Kings should be active, pieces should advance
      if (move.piece.dataset.king === "true") {
        phaseScore += this.weights.endgameKingBonus;
      }
    } else if (totalPieces >= 32) {
      // Opening: Develop pieces, control center
      phaseScore +=
        this.evaluateCenterControl(move) *
        this.weights.openingCenterBonusFactor;
    }

    return phaseScore;
  },

  evaluateOpponentThreats(move) {
    let threatScore = 0;

    // Use enhanced opponent threat calculation
    const opponentThreats = this.countOpponentThreatsAfterMove(move);
    threatScore -= opponentThreats * this.weights.opponentThreatPenalty;

    // Store the fromRow for evaluation context
    enhancedAI.currentMoveFromRow = move.fromRow;

    // Calculate this specific move's evaluation
    const evaluation = this.evaluateMoveSafety(move);
    // Add enhanced attack mode evaluation
    const attackModeScore = this.evaluateAttackMode(move);
    threatScore += attackModeScore;

    return threatScore;
  },

  // NEW: Helper functions for enhanced attack mode

  // Simulate complete attack including sacrifice and recapture
  simulateCompleteAttack(move) {
    const board = this.simulateMove(move);

    // If piece will be captured, simulate that too
    if (this.willBeUnderThreat(move.toRow, move.toCol, move.piece)) {
      // Find the most likely attacker and simulate recapture
      const attacker = this.findMostLikelyAttacker(
        board,
        move.toRow,
        move.toCol
      );
      if (attacker) {
        board[attacker.row][attacker.col] = null;
        board[move.toRow][move.toCol] = null; // Our piece is captured
      }
    }

    return board;
  },

  // Find piece most likely to recapture
  findMostLikelyAttacker(board, targetRow, targetCol) {
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // For each direction, find if there's a landing square behind the target
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
          // Look for attackers in opposite direction
          for (let dist = 1; dist < BOARD_SIZE; dist++) {
            const attackRow = targetRow - dRow * dist;
            const attackCol = targetCol - dCol * dist;

            if (
              attackRow < 0 ||
              attackRow >= BOARD_SIZE ||
              attackCol < 0 ||
              attackCol >= BOARD_SIZE
            )
              break;

            const attacker = this.getPieceAtOnBoard(
              board,
              attackRow,
              attackCol
            );
            if (attacker) {
              if (attacker.color === "red") {
                const isKing = attacker.king === true;
                if (isKing || dist === 1) {
                  return { row: attackRow, col: attackCol, piece: attacker };
                }
              }
              break; // Blocked
            }
          }
        }
      }
    }

    return null;
  },

  // Get piece at position on a board array
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
        const targetRow = row + dRow;
        const targetCol = col + dCol;
        const landingRow = row + dRow * 2;
        const landingCol = col + dCol * 2;

        if (
          landingRow >= 0 &&
          landingRow < BOARD_SIZE &&
          landingCol >= 0 &&
          landingCol < BOARD_SIZE
        ) {
          const targetPiece = this.getPieceAtOnBoard(
            board,
            targetRow,
            targetCol
          );
          const landingPiece = this.getPieceAtOnBoard(
            board,
            landingRow,
            landingCol
          );

          if (
            targetPiece &&
            targetPiece.color === opponentColor &&
            !landingPiece
          ) {
            captures.push({
              fromRow: row,
              fromCol: col,
              toRow: landingRow,
              toCol: landingCol,
              capturedRow: targetRow,
              capturedCol: targetCol,
            });
          }
        }
      }
    }

    return captures;
  },

  // Copy board for simulation
  copyBoard(board) {
    return board.map((row) => (row ? { ...row } : null));
  },

  // Calculate piece value for exchanges
  calculatePieceValue(move) {
    // Calculate value of pieces we're capturing
    let totalValue = 0;

    if (move.capturedPieces && move.capturedPieces.length > 0) {
      // King multi-capture
      for (const capturedKey of move.capturedPieces) {
        const [capturedRow, capturedCol] = capturedKey.split(",").map(Number);
        const capturedPiece = this.getPieceAt(capturedRow, capturedCol);
        if (capturedPiece) {
          totalValue += capturedPiece.dataset.king === "true" ? 300 : 100;
        }
      }
    } else {
      // Regular capture - ensure it's a valid 2-square jump
      const rowDiff = Math.abs(move.toRow - move.fromRow);
      const colDiff = Math.abs(move.toCol - move.fromCol);

      if (rowDiff === 2 && colDiff === 2) {
        const capturedRow = (move.fromRow + move.toRow) / 2;
        const capturedCol = (move.fromCol + move.toCol) / 2;
        const capturedPiece = this.getPieceAt(capturedRow, capturedCol);
        if (capturedPiece) {
          totalValue += capturedPiece.dataset.king === "true" ? 300 : 100;
        }
      }
    }

    return totalValue;
  },

  // Check if move enables promotion
  enablesPromotion(move) {
    // Check if this move clears a path for promotion
    const simulatedBoard = this.simulateMove(move);

    // Look for our pieces that now have clear promotion paths
    // Look for our pieces that now have clear promotion paths (Black moves towards BOARD_SIZE-1)
    for (let col = 0; col < BOARD_SIZE; col++) {
      for (let row = BOARD_SIZE - 2; row >= 0; row--) {
        // Check from back to front
        const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);
        if (piece && piece.color === "black" && !piece.king) {
          // Check if path to promotion is clear
          let pathClear = true;
          for (let checkRow = row + 1; checkRow < BOARD_SIZE; checkRow++) {
            if (this.getPieceAtOnBoard(simulatedBoard, checkRow, col)) {
              pathClear = false;
              break;
            }
          }
          if (pathClear) return true;
        }
      }
    }

    return false;
  },

  // Calculate king activation benefit
  calculateKingActivationBenefit(move) {
    let benefit = 0;
    const simulatedBoard = this.simulateMove(move);

    // Check if our kings have more mobility after this move
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);
        if (piece && piece.color === "black" && piece.king) {
          const mobility = this.calculateKingMobilityOnBoard(
            simulatedBoard,
            row,
            col
          );
          benefit += mobility * 5; // Small bonus per mobility point
        }
      }
    }

    return benefit;
  },

  // Calculate king mobility on a specific board
  calculateKingMobilityOnBoard(board, row, col) {
    let moves = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      for (let distance = 1; distance < BOARD_SIZE; distance++) {
        const newRow = row + dRow * distance;
        const newCol = col + dCol * distance;
        if (
          newRow < 0 ||
          newRow >= BOARD_SIZE ||
          newCol < 0 ||
          newCol >= BOARD_SIZE
        )
          break;
        if (this.getPieceAtOnBoard(board, newRow, newCol)) break;
        moves++;
      }
    }

    return moves;
  },

  // Calculate damage to opponent formation
  calculateOpponentFormationDamage(move) {
    let damage = 0;

    // Check if captured pieces break opponent formation
    if (move.isCapture) {
      // Calculate how many opponent pieces become isolated after capture
      const simulatedBoard = this.simulateMove(move);

      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const piece = this.getPieceAtOnBoard(simulatedBoard, row, col);
          if (piece && piece.color === "red") {
            // Check if this piece is now isolated
            const neighbors = this.countNeighborsOnBoard(
              simulatedBoard,
              row,
              col,
              "red"
            );
            if (neighbors === 0) {
              damage += 30; // Bonus for isolating opponent piece
            }
          }
        }
      }
    }

    return damage;
  },

  // Count neighbors of same color on board
  countNeighborsOnBoard(board, row, col, color) {
    let neighbors = 0;
    const adjacents = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (const [dRow, dCol] of adjacents) {
      const checkRow = row + dRow;
      const checkCol = col + dCol;
      const piece = this.getPieceAtOnBoard(board, checkRow, checkCol);
      if (piece && piece.color === color) {
        neighbors++;
      }
    }

    return neighbors;
  },

  // Calculate threats neutralized by move
  calculateThreatsNeutralized(move) {
    // Count opponent threats before and after move
    const threatsBefore = this.calculateOpponentCaptureOpportunities({
      fromRow: 0,
      fromCol: 0,
      toRow: 0,
      toCol: 0,
    });
    const threatsAfter = this.calculateOpponentCaptureOpportunities(move);

    return Math.max(0, threatsBefore - threatsAfter);
  },

  // Count threats created by a move
  countThreatsCreatedByMove(move) {
    const simulatedBoard = this.simulateMove(move);
    let threats = 0;

    // Count how many opponent pieces we can now capture
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const jumpRow = move.toRow + dRow * 2;
      const jumpCol = move.toCol + dCol * 2;

      if (
        jumpRow >= 0 &&
        jumpRow < BOARD_SIZE &&
        jumpCol >= 0 &&
        jumpCol < BOARD_SIZE
      ) {
        const middleRow = move.toRow + dRow;
        const middleCol = move.toCol + dCol;
        const middlePiece = this.getPieceAtOnBoard(
          simulatedBoard,
          middleRow,
          middleCol
        );
        const landSquare = this.getPieceAtOnBoard(
          simulatedBoard,
          jumpRow,
          jumpCol
        );

        if (middlePiece && middlePiece.color === "red" && !landSquare) {
          threats++;
        }
      }
    }

    return threats;
  },

  // Calculate activity gain from move
  calculateActivityGain(move) {
    let activityGain = 0;

    // Central positions are more active
    const centerPoint = (BOARD_SIZE - 1) / 2;
    const centerDistance =
      Math.abs(move.toRow - centerPoint) + Math.abs(move.toCol - centerPoint);
    const oldCenterDistance =
      Math.abs(move.fromRow - centerPoint) +
      Math.abs(move.fromCol - centerPoint);

    if (centerDistance < oldCenterDistance) {
      activityGain += (oldCenterDistance - centerDistance) * 10;
    }

    // Forward movement for regular pieces
    if (move.piece.dataset.king !== "true" && move.toRow > move.fromRow) {
      activityGain += (move.toRow - move.fromRow) * 15;
    }

    return activityGain;
  },

  evaluateMobility(color) {
    let mobilityScore = 0;
    const size = BOARD_SIZE || 10;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = this.getPieceAt(row, col);
        if (piece && piece.dataset.color === color) {
          const moves = this.getPieceMoves(row, col, piece);
          mobilityScore += moves.length * this.weights.mobility;
        }
      }
    }
    return mobilityScore;
  },

  getPositionHash(boardState) {
    let hash = "";
    const size = BOARD_SIZE || 10;

    if (boardState) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const p = boardState[r][c];
          if (!p) hash += "0";
          else hash += (p.color === "black" ? "B" : "R") + (p.king ? "K" : "P");
        }
      }
    } else {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const piece = this.getPieceAt(row, col);
          if (piece) {
            hash +=
              piece.dataset.color[0].toUpperCase() +
              (piece.dataset.king === "true" ? "K" : "P");
          } else {
            hash += "0";
          }
        }
      }
    }
    return hash;
  },

  getMoveType(move) {
    let type = "";
    // Handle both live DOM element and stored data object
    const isKing = move.piece ? (move.piece.dataset.king === "true") : move.isKing;
    const color = move.piece ? move.piece.dataset.color : move.color;
    
    if (move.isCapture) type += "C";
    if (isKing) type += "K";
    if (move.toRow === BOARD_SIZE - 1 && color === "black")
      type += "P";

    const distance = Math.abs(move.toRow - move.fromRow);
    if (distance === 1) type += "S";
    else if (distance >= 2) type += "L";

    return type || "N";
  },

  // Enhanced getMoveType for position-aware learning
  getMoveTypeWithContext(move, boardPosition) {
    const baseType = this.getMoveType(move);
    const gameContext = this.getCurrentGameContext();
    
    // Add positional context: edge vs center
    const isEdge = move.toRow <= 1 || move.toRow >= BOARD_SIZE - 2;
    const isCenter = move.toRow >= 3 && move.toRow <= BOARD_SIZE - 4 && 
                     move.toCol >= 3 && move.toCol <= BOARD_SIZE - 4;
    
    const posContext = isCenter ? "_center" : isEdge ? "_edge" : "_mid";
    const fullType = `${gameContext}_${baseType}${posContext}`;
    
    return fullType;
  },

  buildMoveSnapshot(move) {
    if (!move) return null;

    const dataset =
      move.piece && move.piece.dataset ? move.piece.dataset : null;
    const inferredColor =
      (dataset && dataset.color) || move.pieceColor || move.color || null;

    const isKing =
      dataset && dataset.king !== undefined
        ? dataset.king === "true" || dataset.king === true
        : move.pieceKing !== undefined
        ? !!move.pieceKing
        : !!move.king;

    const snapshot = {
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
          color: (inferredColor || "black").toString(),
          king: isKing ? "true" : "false",
        },
      },
      pieceColor: (inferredColor || "black").toString(),
      pieceKing: isKing,
    };

    if (
      snapshot.capturedPieces.length === 0 &&
      snapshot.capturedRow !== null &&
      snapshot.capturedCol !== null
    ) {
      snapshot.capturedPieces = [
        `${snapshot.capturedRow},${snapshot.capturedCol}`,
      ];
    }

    return snapshot;
  },

  storeMoveEvaluation(move, score) {
    const snapshot = this.buildMoveSnapshot(move);
    if (!snapshot) return;

    const boardHash = this.getPositionHash();

    this.memory.lastGameMoves.push({
      move: snapshot,
      evaluation: Number.isFinite(score) ? score : 0,
      position: boardHash,
      boardHash,
    });
  },

  recordMoveAttempt(move, score) {
    this.memory.totalMoves++;
    if (move.isCapture) {
      this.memory.captureAttempts++;
    }
  },

  // Enhanced strategic adaptation for middle and endgame phases
  adaptWeights() {
    // Start with a fresh copy of the base weights for this turn's calculation
    this.weights = { ...this.baseWeights };

    // --- Game Phase Analysis ---
    let totalPieces = 0;
    let blackPieces = 0;
    let redPieces = 0;
    let blackKings = 0;
    let redKings = 0;
    let emptyBackRankSquares = 0;
    let exposedPieces = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = this.getPieceAt(r, c);
        if (p) {
          totalPieces++;
          if (p.dataset.color === "black") {
            blackPieces++;
            if (p.dataset.king === "true") blackKings++;
            // Check if black piece is exposed (no support)
            if (this.isExposedPiece(r, c, p)) exposedPieces++;
          } else {
            redPieces++;
            if (p.dataset.king === "true") redKings++;
          }
        } else {
          // Check for empty back rank squares (rows 0, 1 for black)
          if (r <= 1 && (r + c) % 2 === 1) emptyBackRankSquares++;
        }
      }
    }

    const materialAdvantage = blackPieces - redPieces;
    const gamePhase = this.determineGamePhase(
      totalPieces,
      blackPieces,
      redPieces
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
      this.weights.trapCreationBonus = (this.weights.trapCreationBonus || 0) + 500;
    }

    // ENHANCED ENDGAME STRATEGY (8 or fewer pieces total)
    if (gamePhase === "endgame") {
      this.weights.safety *= 2.0; // CRITICAL: Don't give away pieces in endgame
      this.weights.selfDanger *= 3.0; // Extreme caution
      this.weights.king *= 1.8; // Kings dominate endgame
      this.weights.mobility *= 1.4; // King mobility crucial
      this.weights.advancement *= 1.6; // Push for promotion
      this.weights.sacrificeThreshold *= 2.0; // Much stricter sacrifice rules

      // DEFENSIVE ENDGAME: Focus on piece preservation
      this.weights.cohesion *= 1.8;
      this.weights.support *= 2.0;
      this.weights.edgeSafety *= 1.5;
    }

    // ENHANCED MIDGAME STRATEGY (9-16 pieces total)
    else if (gamePhase === "midgame") {
      this.weights.safety *= 1.8; // Very high safety priority
      this.weights.selfDanger *= 2.0; // High caution
      this.weights.cohesion *= 1.5; // Strong formation
      this.weights.support *= 1.7; // Pieces support each other
      this.weights.defensiveValue *= 1.8; // Value defensive moves highly

      // FILL EMPTY SQUARES STRATEGY
      this.weights.fillGapBonus *= 2.0; // Prioritize filling gaps
      this.weights.compactFormationBonus *= 1.8; // Stay compact
      this.weights.fragmentationPenalty *= 2.0; // Avoid splitting forces

      // BACK RANK PROTECTION
      if (emptyBackRankSquares > 2) {
        this.weights.backRankLeaving *= 3.0; // Heavily penalize leaving back rank
      }
    }

    // OPENING STRATEGY (17+ pieces total)
    else {
      // Don't boost advancement if it's negative (pure defense mode)
      if (this.weights.advancement > 0) {
        this.weights.advancement *= 1.1;
      }
      this.weights.position *= 1.2;
      this.weights.center *= 1.1;
    }

    // --- MATERIAL ADVANTAGE ADJUSTMENTS ---

    // If AI is AHEAD: Play extremely defensively
    if (materialAdvantage > 1) {
      this.weights.safety *= 2.5; // Extreme safety when ahead
      this.weights.cohesion *= 2.0; // Maintain winning formation
      this.weights.selfDanger *= 3.0; // Ultra risk-averse
      this.weights.sacrificeThreshold *= 3.0; // Almost never sacrifice
      this.weights.support *= 2.0; // Pieces protect each other
      this.weights.edgeSafety *= 1.8; // Use board edges for safety

      // ANTI-SACRIFICE MEASURES
      this.weights.chainPreventionMajor *= 2.0;
      this.weights.chainPreventionMinor *= 2.0;
    }

    // If AI is BEHIND: PURE DEFENSIVE STALLING (Fortress Recovery)
    else if (materialAdvantage < -1) {
      this.weights.material *= 5.0; // Pieces are ultra-precious (250,000 each)
      this.weights.safety *= 4.0;
      this.weights.selfDanger = 300000; // CATASTROPHIC risk penalty
      this.weights.captureBase = 0; // Don't take captures if they are trades
      this.weights.advancement = -50000; // Strongest penalty for moving forward
      this.weights.cohesion *= 5.0;
    }

    // EXPOSED PIECES EMERGENCY
    if (exposedPieces > 2) {
      this.weights.support *= 3.0; // Desperately seek piece support
      this.weights.cohesion *= 2.0; // Group pieces together
      this.weights.isolationPenalty *= 3.0; // Avoid isolated pieces
    }
  },

  // Helper function to determine game phase more accurately
  determineGamePhase(totalPieces, blackPieces, redPieces) {
    if (totalPieces <= 16) return "endgame";
    if (totalPieces <= 32) return "midgame";
    return "opening";
  },

  // Helper function to check if a piece is exposed (no friendly support)
  isExposedPiece(row, col, piece) {
    const supportPositions = [
      [row - 1, col - 1],
      [row - 1, col + 1],
      [row + 1, col - 1],
      [row + 1, col + 1],
    ];

    for (const [r, c] of supportPositions) {
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const supportPiece = this.getPieceAt(r, c);
        if (
          supportPiece &&
          supportPiece.dataset.color === piece.dataset.color
        ) {
          return false; // Has support
        }
      }
    }
    return true; // No support found - exposed
  },

  // Minimax with alpha-beta pruning
  minimax(depth, alpha, beta, maximizingPlayer, color) {
    if (depth === 0) {
      return this.evaluatePosition(color);
    }

    const moves = this.getAllMoves(
      maximizingPlayer ? color : color === "black" ? "red" : "black"
    );

    if (maximizingPlayer) {
      let maxEval = -Infinity;
      for (const move of moves) {
        // Simulate move
        const evaluation = this.minimax(depth - 1, alpha, beta, false, color);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        // Simulate move
        const evaluation = this.minimax(depth - 1, alpha, beta, true, color);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  },

  // ==================== MONTE CARLO TREE SEARCH (MCTS) ====================

  // MCTS Node class for tree structure
  createMCTSNode(move = null, parent = null, board = null) {
    return {
      move: move, // The move that led to this node
      parent: parent, // Parent node
      children: [], // Child nodes
      wins: 0, // Number of wins from this node
      visits: 0, // Number of times this node was visited
      untriedMoves: null, // Moves that haven't been tried yet
      playerJustMoved: null, // Player who just made a move to reach this state
      board: board, // Board state (simplified representation)
    };
  },

  // Main MCTS algorithm
  async runMCTS(rootBoard, color) {
    const startTime = Date.now();

    // Create root node
    const rootNode = this.createMCTSNode(null, null, rootBoard);
    rootNode.playerJustMoved = color === "black" ? "red" : "black";
    rootNode.untriedMoves = this.getAllMovesForBoard(rootBoard, color);

    let simulations = 0;
    const timeLimit = this.mcts.timeLimit;

    // Run simulations until time limit or simulation count reached
    while (
      simulations < this.mcts.simulationsPerMove &&
      Date.now() - startTime < timeLimit
    ) {
      let node = rootNode;
      let board = this.copyBoardState(rootBoard);
      let currentColor = color;

      // 1. SELECTION: Select node to expand
      while (
        node.untriedMoves &&
        node.untriedMoves.length === 0 &&
        node.children.length > 0
      ) {
        node = this.selectUCB1(node);
        if (node.move) {
          board = this.applyMoveToBoard(board, node.move);
          currentColor = currentColor === "black" ? "red" : "black";
        }
      }

      // 2. EXPANSION: Add a child node
      if (node.untriedMoves && node.untriedMoves.length > 0) {
        const move = node.untriedMoves.pop();
        board = this.applyMoveToBoard(board, move);
        currentColor = currentColor === "black" ? "red" : "black";
        const childNode = this.createMCTSNode(move, node, board);
        childNode.playerJustMoved = currentColor === "black" ? "red" : "black";
        childNode.untriedMoves = this.getAllMovesForBoard(board, currentColor);
        node.children.push(childNode);
        node = childNode;
      }

      // 3. SIMULATION: Play out a random game
      const result = this.simulateRandomPlayout(board, currentColor);

      // 4. BACKPROPAGATION: Update nodes with result
      while (node !== null) {
        node.visits++;
        // Update wins based on perspective
        if (result === color) {
          node.wins++;
        } else if (result === "draw") {
          node.wins += 0.5;
        }
        node = node.parent;
      }

      simulations++;
    }

    const elapsedTime = Date.now() - startTime;
    this.mcts.totalSimulations += simulations;

    // Select best move based on most visits (most robust)
    return this.selectBestMCTSMove(rootNode);
  },

  // UCB1 selection formula
  selectUCB1(node) {
    const c = this.mcts.explorationConstant;
    let bestScore = -Infinity;
    let bestChild = null;

    for (const child of node.children) {
      // UCB1 formula: (wins/visits) + c * sqrt(ln(parent_visits) / visits)
      const exploitation = child.wins / child.visits;
      const exploration = c * Math.sqrt(Math.log(node.visits) / child.visits);
      const ucb1Score = exploitation + exploration;

      if (ucb1Score > bestScore) {
        bestScore = ucb1Score;
        bestChild = child;
      }
    }

    return bestChild;
  },

  // Select best move after MCTS completes
  selectBestMCTSMove(rootNode) {
    let bestVisits = -1;
    let bestMove = null;
    let bestWinRate = -1;

    for (const child of rootNode.children) {
      const winRate = child.visits > 0 ? (child.wins / child.visits) * 100 : 0;

      // Select move with most visits (most robust)
      if (child.visits > bestVisits) {
        bestVisits = child.visits;
        bestMove = child.move;
        bestWinRate = winRate;
      }
    }

    return bestMove;
  },

  // Simulate a random playout from current position
  simulateRandomPlayout(board, startColor) {
    let currentBoard = this.copyBoardState(board);
    let currentColor = startColor;
    let depth = 0;
    const maxDepth = this.mcts.maxDepth;

    while (depth < maxDepth) {
      const moves = this.getAllMovesForBoard(currentBoard, currentColor);

      if (moves.length === 0) {
        // No moves available - opponent wins
        return currentColor === "black" ? "red" : "black";
      }

      // Check for game end conditions
      const gameState = this.checkGameEndOnBoard(currentBoard);
      if (gameState !== "ongoing") {
        return gameState;
      }

      // Select random move (with slight bias toward captures)
      const move = this.selectSimulationMove(moves);
      currentBoard = this.applyMoveToBoard(currentBoard, move);

      // Switch player
      currentColor = currentColor === "black" ? "red" : "black";
      depth++;
    }

    // If we reach max depth, evaluate position
    return this.evaluateEndPosition(currentBoard);
  },

  // Select move during simulation (can add heuristics)
  selectSimulationMove(moves) {
    const captures = moves.filter((m) => m.isCapture);

    // 70% chance to select a capture if available
    if (captures.length > 0 && Math.random() < 0.7) {
      return captures[Math.floor(Math.random() * captures.length)];
    }

    // Otherwise random move
    return moves[Math.floor(Math.random() * moves.length)];
  },

  // Get all possible moves for a given board state
  getAllMovesForBoard(board, color) {
    const moves = [];

    // Check if we are in a forced multi-capture sequence
    if (
      typeof mustContinueCapture !== "undefined" &&
      mustContinueCapture &&
      forcedCapturePiece
    ) {
      // We must ONLY generate moves for the forced piece
      const parent = forcedCapturePiece.parentElement;
      if (parent) {
        const r = parseInt(parent.dataset.row);
        const c = parseInt(parent.dataset.col);
        const piece = board[r][c];
        console.log("getAllMovesForBoard: forced capture on board at", r, c, "snapshotPiece=", piece);
        if (piece && piece.color === color) {
          const moves = this.getMovesForPieceOnBoard(board, r, c, piece);
          console.log("getAllMovesForBoard: returning", moves.length, "moves for forced piece");
          return moves;
        }
      }
    }

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece.color === color) {
          const pieceMoves = this.getMovesForPieceOnBoard(
            board,
            row,
            col,
            piece
          );
          moves.push(...pieceMoves);
        }
      }
    }

    // Filter for captures if any exist (forced capture rule)
    const captures = moves.filter((m) => m.isCapture);

    if (captures.length > 0) {
      // MANDATORY MAX CAPTURE ENFORCEMENT
      // We must calculate the full potential of each capture to know which is "Max"
      // because getMovesForPieceOnBoard only returns the first step.

      let maxCaptures = 0;
      const movesWithCounts = captures.map((move) => {
        const count = this.calculateVirtualCapturePotential(board, move);
        if (count > maxCaptures) maxCaptures = count;
        return { move, count };
      });

      // Strict filter: Only return moves that match the maximum capture count
      const bestCaptures = movesWithCounts
        .filter((item) => item.count === maxCaptures)
        .map((item) => item.move);

      return bestCaptures;
    }

    return moves;
  },

  // NEW: Recursive function to count total captures on a virtual board
  calculateVirtualCapturePotential(board, move) {
    if (!move.isCapture) return 0;

    // Simulate this single step
    const nextBoard = this.applyMoveToBoard(board, move);
    let maxChain = 0;

    // Check if we can continue capturing from the new position
    // The piece is now at move.toRow, move.toCol
    const piece = nextBoard[move.toRow][move.toCol];
    if (piece) {
      // Find possible next steps
      const nextMoves = this.getMovesForPieceOnBoard(
        nextBoard,
        move.toRow,
        move.toCol,
        piece
      );
      const nextCaptures = nextMoves.filter((m) => m.isCapture);

      if (nextCaptures.length > 0) {
        for (const nextMove of nextCaptures) {
          const chain = this.calculateVirtualCapturePotential(
            nextBoard,
            nextMove
          );
          if (chain > maxChain) maxChain = chain;
        }
      }
    }

    return 1 + maxChain;
  },

  // Get moves for a specific piece on a board state
  getMovesForPieceOnBoard(board, row, col, piece) {
    const moves = [];
    const isKing = piece.king;
    const color = piece.color;

    // International Checkers: All pieces can capture forwards and backwards
    const captureDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    // Regular movement directions
    let moveDirections;
    if (isKing) {
      moveDirections = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];
    } else if (color === "red") {
      moveDirections = [
        [-1, -1],
        [-1, 1],
      ];
    } else {
      moveDirections = [
        [1, -1],
        [1, 1],
      ];
    }

    // 1. GENERATE CAPTURES (Critical for AI)
    if (isKing) {
      // Flying King Capture Logic
      for (const [dRow, dCol] of captureDirections) {
        let foundEnemy = false;
        let capturedR = -1;
        let capturedC = -1;

        for (let i = 1; i < BOARD_SIZE; i++) {
          const r = row + dRow * i;
          const c = col + dCol * i;

          if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;

          const p = board[r][c];

          if (!foundEnemy) {
            if (p) {
              if (p.color === color) break; // Blocked by self
              foundEnemy = true;
              capturedR = r;
              capturedC = c;
            }
          } else {
            if (p) break; // Blocked by second piece (cannot jump two connected)

            // Valid landing spot found!
            moves.push({
              fromRow: row,
              fromCol: col,
              toRow: r,
              toCol: c,
              isCapture: true,
              capturedRow: capturedR,
              capturedCol: capturedC,
              king: isKing,
              color: color,
            });
          }
        }
      }
    } else {
      // Regular Piece Capture (Forward & Backward allowed)
      for (const [dRow, dCol] of captureDirections) {
        const midR = row + dRow;
        const midC = col + dCol;
        const destR = row + dRow * 2;
        const destC = col + dCol * 2;

        if (
          destR >= 0 &&
          destR < BOARD_SIZE &&
          destC >= 0 &&
          destC < BOARD_SIZE
        ) {
          const midP = board[midR][midC];
          if (midP && midP.color !== color && !board[destR][destC]) {
            moves.push({
              fromRow: row,
              fromCol: col,
              toRow: destR,
              toCol: destC,
              isCapture: true,
              capturedRow: midR,
              capturedCol: midC,
              king: isKing,
              color: color,
            });
          }
        }
      }
    }

    // 2. GENERATE REGULAR MOVES (Only if no captures? Normally yes, but Minimax can handle sort)
    // Note: Forced capture rule is handled in getAllMovesForBoard filter.

    if (isKing) {
      for (const [dRow, dCol] of moveDirections) {
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
          if (board[newRow][newCol]) break;

          moves.push({
            fromRow: row,
            fromCol: col,
            toRow: newRow,
            toCol: newCol,
            isCapture: false,
            king: isKing,
            color: color,
          });
        }
      }
    } else {
      for (const [dRow, dCol] of moveDirections) {
        const newRow = row + dRow;
        const newCol = col + dCol;
        if (
          newRow >= 0 &&
          newRow < BOARD_SIZE &&
          newCol >= 0 &&
          newCol < BOARD_SIZE &&
          !board[newRow][newCol]
        ) {
          moves.push({
            fromRow: row,
            fromCol: col,
            toRow: newRow,
            toCol: newCol,
            isCapture: false,
            king: isKing,
            color: color,
          });
        }
      }
    }
    return moves;
  },

  // Apply a move to a board state (returns new board)
  applyMoveToBoard(board, move) {
    const newBoard = this.copyBoardState(board);

    // Move the piece
    // Note: We use the existing piece data from the board, not from the move object
    const movingPiece = newBoard[move.fromRow][move.fromCol];
    newBoard[move.toRow][move.toCol] = movingPiece;
    newBoard[move.fromRow][move.fromCol] = null;

    // Handle captures (multi-capture support)
    if (move.isCapture) {
      if (move.capturedPieces && Array.isArray(move.capturedPieces)) {
        for (const pieceKey of move.capturedPieces) {
          const [r, c] = pieceKey.split(",").map(Number);
          newBoard[r][c] = null;
        }
      } else if (
        move.capturedRow !== undefined &&
        move.capturedCol !== undefined
      ) {
        newBoard[move.capturedRow][move.capturedCol] = null;
      }
    }

    // Handle king promotion
    // Black promotes at row 9 (BOARD_SIZE - 1), Red promotes at row 0
    if (movingPiece) {
      if (
        move.toRow === 0 &&
        movingPiece.color === "red" &&
        !movingPiece.king
      ) {
        movingPiece.king = true;
      } else if (
        move.toRow === BOARD_SIZE - 1 &&
        movingPiece.color === "black" &&
        !movingPiece.king
      ) {
        movingPiece.king = true;
      }
    }

    return newBoard;
  },

  // Copy board state
  copyBoardState(board) {
    const newBoard = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      newBoard[i] = [];
      for (let j = 0; j < BOARD_SIZE; j++) {
        if (board[i][j]) {
          newBoard[i][j] = { ...board[i][j] };
        } else {
          newBoard[i][j] = null;
        }
      }
    }
    return newBoard;
  },

  // Get current board state from DOM
  getCurrentBoardState() {
    const board = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      board[row] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (piece) {
          board[row][col] = {
            color: piece.dataset.color,
            king: piece.dataset.king === "true",
          };
        } else {
          board[row][col] = null;
        }
      }
    }
    return board;
  },

  // Check if game has ended on a board state
  checkGameEndOnBoard(board) {
    let blackPieces = 0;
    let redPieces = 0;
    let blackKings = 0;
    let redKings = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col]) {
          const p = board[row][col];
          if (p.color === "black") {
            blackPieces++;
            if (p.king) blackKings++;
          } else {
            redPieces++;
            if (p.king) redKings++;
          }
        }
      }
    }

    if (blackPieces === 0) return "red";
    if (redPieces === 0) return "black";

    // Draw condition: 1 King vs 1 King
    if (
      blackPieces === 1 &&
      blackKings === 1 &&
      redPieces === 1 &&
      redKings === 1
    ) {
      return "draw";
    }

    return "ongoing";
  },

  // Evaluate final position for simulation
  evaluateEndPosition(board) {
    let blackScore = 0;
    let redScore = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece) {
          const value = piece.king ? 3 : 1;
          if (piece.color === "black") {
            blackScore += value;
          } else {
            redScore += value;
          }
        }
      }
    }

    if (blackScore > redScore * 1.5) return "black";
    if (redScore > blackScore * 1.5) return "red";
    return "draw";
  },

  // ═══════════════════════════════════════════════════════════════════
  // EARLY EXIT STRATEGY (Fast rejection for obviously bad moves)
  // ═══════════════════════════════════════════════════════════════════

  shouldRejectMove(move, board = null) {
    const currentBoard = board || this.getCurrentBoardState();
    
    if (!move.isCapture && this.isPieceUnderAttack(this.applyMoveToBoard(currentBoard, move), move.toRow, move.toCol, "black")) return true;
    
    const totalPieces = this.countPieces(currentBoard);
    if (move.fromRow <= 1 && move.toRow > 1 && !move.isCapture && totalPieces > 12) return true;
    
    if (this.wouldIsolatePiece(move) && !move.isCapture) return true;
    if (this.createsOpponentChain(move)) return true;
    return false;
  },
  
  // Legacy version preserved for compatibility if needed elsewhere
  _shouldRejectMoveOld(move) {
    // LAYER 1: INSTANT REJECTIONS

    // Reject: Moving into direct threat (non-capture)
    if (!move.isCapture && this.willBeUnderThreat(move.toRow, move.toCol, move.piece)) {
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

      const currentBoard = this.getCurrentBoardState();
      this.adaptWeights(); // CRITICAL: Populate this.weights from baseWeights
      let moves = this.getAllMovesForBoard(currentBoard, "black");

      // PHASE 3 OPTIMIZATION: Early exit - filter obviously bad moves
      // Temporarily disabled due to edge case - using all moves
      const movesToEvaluate = moves;

      if (movesToEvaluate.length === 1) {
        return movesToEvaluate[0];
      }

      const bestMove = await this.iterativeDeepeningSearch(
        currentBoard,
        "black",
        3500, // Increased time limit for higher challenge
        movesToEvaluate
      );

      if (bestMove) {
        const testBoard = this.applyMoveToBoard(currentBoard, bestMove);
        const isSafe = !this.isPieceUnderAttack(
          testBoard,
          bestMove.toRow,
          bestMove.toCol,
          "black"
        );

        if (!isSafe) {
          // Re-evaluate ONLY safe moves and pick the best one
          let bestSafeMove = null;
          let maxSafeScore = -Infinity;

          for (const m of movesToEvaluate) {
            // Yield to UI thread every move evaluation
            await new Promise(resolve => setTimeout(resolve, 0));
            
            const tb = this.applyMoveToBoard(currentBoard, m);
            if (
              m.isCapture ||
              !this.isPieceUnderAttack(tb, m.toRow, m.toCol, "black")
            ) {
              const s = this.evaluatePositionEnhanced(tb, "black");
              if (s > maxSafeScore) {
                maxSafeScore = s;
                bestSafeMove = m;
                bestSafeMove.score = s; // Attach score for learning
              }
            }
          }

          if (bestSafeMove) {
            return bestSafeMove;
          }
        }

        return bestMove;
      } else {
        // If iterativeDeepeningSearch returns null, fall back to a simple move
        return movesToEvaluate.length > 0 ? movesToEvaluate[0] : null;
      }
    } catch (err) {
      const board = this.getCurrentBoardState(); // Changed from getBoardState() to getCurrentBoardState()
      let moves = this.getAllMovesForBoard(board, "black");
      return moves.length > 0 ? moves[0] : null;
    }
  },

  async iterativeDeepeningSearch(board, color, timeLimit, searchMoves = null) {
    const startTime = Date.now();
    let bestMove = null;
    let depth = 1;
    const maxDepth = 20; // Increased max depth thanks to TT and Pruning

    let moves = searchMoves || this.getAllMovesForBoard(board, color);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const captures = moves.filter((m) => m.isCapture);

    const candidateMoves = captures.length > 0 ? captures : moves;
    if (candidateMoves.length === 1) return candidateMoves[0];

    while (Date.now() - startTime < timeLimit && depth <= maxDepth) {
      this.currentSearchDepth = depth;
      let alpha = -1000000;
      let beta = 1000000;

      // Re-sort moves based on previous best result and captures
      candidateMoves.sort((a, b) => {
        if (
          bestMove &&
          a.fromRow === bestMove.fromRow &&
          a.toRow === bestMove.toRow &&
          a.fromCol === bestMove.fromCol &&
          a.toCol === bestMove.toCol
        )
          return -1;
        if (b.isCapture && !a.isCapture) return 1;
        if (a.isCapture && !b.isCapture) return -1;
        return 0;
      });

      let currentBestMove = null;
      let currentBestScore = -Infinity;

      for (const move of candidateMoves) {
        const resultBoard = this.applyMoveToBoard(board, move);
        const score = -this.minimax(
          resultBoard,
          depth - 1,
          -beta,
          -alpha,
          color === "black" ? "red" : "black"
        );

        // Apply move-specific learning bonus at the root level
        const learningBonus = this.evaluateLearnedPatterns(move);
        const finalScore = score + learningBonus;

        if (finalScore > currentBestScore) {
          currentBestScore = finalScore;
          currentBestMove = move;
        }

        alpha = Math.max(alpha, finalScore);
        if (Date.now() - startTime > timeLimit) break;
      }

      if (Date.now() - startTime <= timeLimit) {
        bestMove = currentBestMove;
        if (bestMove) bestMove.score = currentBestScore; // Attach score for learning
        depth++;
      }
    }

    return bestMove;
  },

  // MINIMAX with Alpha-Beta Pruning and Transposition Table
  minimax(board, depth, alpha, beta, color) {
    const originalAlpha = alpha;
    const hash = this.getZobristHash(board, color);

    this.totalNodes++;

    // 1. TT Lookup
    if (this.transpositionTable.has(hash)) {
      const entry = this.transpositionTable.get(hash);
      if (entry.depth >= depth) {
        this.cacheHits++;
        if (entry.type === 0) return entry.score; // EXACT
        if (entry.type === 1 && entry.score >= beta) return beta; // BETA (Lower bound)
        if (entry.type === 2 && entry.score <= alpha) return alpha; // ALPHA (Upper bound)
      }
    }

    // --- NULL MOVE PRUNING ---
    // If we're at a decent depth and not in a tactical state, check if passing is safe.
    if (depth >= 3 && !this.isInEndgame(board)) {
      // We simulate a side switch (null move)
      const score = -this.minimax(
        board,
        depth - 1 - 2,
        -beta,
        -beta + 1,
        color === "black" ? "red" : "black"
      );
      if (score >= beta) return beta;
    }

    // 2. Base cases
    const gameEnd = this.checkGameEndOnBoard(board);
    if (gameEnd === "black")
      return color === "black" ? 100000 + depth : -100000 - depth;
    if (gameEnd === "red")
      return color === "red" ? 100000 + depth : -100000 - depth;
    if (gameEnd === "draw") return 0;

    if (depth <= 0) {
      return this.quiescenceSearch(board, alpha, beta, color);
    }

    // 3. Move generation
    const moves = this.getAllMovesForBoard(board, color);
    if (moves.length === 0) return -100000;

    // Mandatory capture rule
    const captures = moves.filter((m) => m.isCapture);
    const validMoves = captures.length > 0 ? captures : moves;

    // Improved Move ordering
    const ttEntry = this.transpositionTable.get(hash);
    const hashMove = ttEntry ? ttEntry.bestMove : null;
    const killer = this.killerMoves[depth] || [];

    validMoves.sort((a, b) => {
      // 1. Hash move first
      if (
        hashMove &&
        a.fromRow === hashMove.fromRow &&
        a.toRow === hashMove.toRow &&
        a.fromCol === hashMove.fromCol &&
        a.toCol === hashMove.toCol
      )
        return -1;
      if (
        hashMove &&
        b.fromRow === hashMove.fromRow &&
        b.toRow === hashMove.toRow &&
        b.fromCol === hashMove.fromCol &&
        b.toCol === hashMove.toCol
      )
        return 1;

      // 2. Captures next
      if (b.isCapture && !a.isCapture) return 1;
      if (a.isCapture && !b.isCapture) return -1;

      // 3. Killer moves
      const isAKiller = killer.some(
        (m) =>
          m.fromRow === a.fromRow &&
          m.toRow === a.toRow &&
          m.fromCol === a.fromCol &&
          m.toCol === a.toCol
      );
      const isBKiller = killer.some(
        (m) =>
          m.fromRow === b.fromRow &&
          m.toRow === b.toRow &&
          m.fromCol === b.fromCol &&
          m.toCol === b.toCol
      );
      if (isAKiller && !isBKiller) return -1;
      if (isBKiller && !isAKiller) return 1;

      // 4. History Heuristic
      const keyA = `${a.fromRow},${a.fromCol},${a.toRow},${a.toCol}`;
      const keyB = `${b.fromRow},${b.fromCol},${b.toRow},${b.toCol}`;
      return (this.historyTable[keyB] || 0) - (this.historyTable[keyA] || 0);
    });

    let maxScore = -Infinity;
    let bestMove = null;
    let movesSearched = 0;

    for (const move of validMoves) {
      const nextBoard = this.applyMoveToBoard(board, move);
      let score;

      // --- LATE MOVE REDUCTION (LMR) ---
      // Search later moves with reduced depth if they aren't tactical
      if (
        movesSearched >= 4 &&
        depth >= 3 &&
        !move.isCapture &&
        !move.isPromotion
      ) {
        score = -this.minimax(
          nextBoard,
          depth - 2,
          -(alpha + 1),
          -alpha,
          color === "black" ? "red" : "black"
        );
        if (score > alpha) {
          // If the move actually looks good, research with full depth
          score = -this.minimax(
            nextBoard,
            depth - 1,
            -beta,
            -alpha,
            color === "black" ? "red" : "black"
          );
        }
      } else {
        score = -this.minimax(
          nextBoard,
          depth - 1,
          -beta,
          -alpha,
          color === "black" ? "red" : "black"
        );
      }

      movesSearched++;
      if (score > maxScore) {
        maxScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) {
        // Beta cutoff: Update Killer moves and History table
        if (!move.isCapture) {
          const killer = this.killerMoves[depth];
          if (
            !killer.some(
              (m) =>
                m.fromRow === move.fromRow &&
                m.toRow === move.toRow &&
                m.fromCol === move.fromCol &&
                m.toCol === move.toCol
            )
          ) {
            killer.unshift(move);
            if (killer.length > 2) killer.pop();
          }
          const key = `${move.fromRow},${move.fromCol},${move.toRow},${move.toCol}`;
          this.historyTable[key] =
            (this.historyTable[key] || 0) + depth * depth;
        }
        break;
      }
    }

    // 4. Store TT entry
    let type = 0;
    if (maxScore <= originalAlpha) type = 2; // BETA (Upper bound)
    else if (maxScore >= beta) type = 1; // ALPHA (Lower bound)

    this.transpositionTable.set(hash, {
      score: maxScore,
      depth: depth,
      type: type,
      bestMove: bestMove,
    });

    return maxScore;
  },

  quiescenceSearch(board, alpha, beta, color) {
    const hash = this.getZobristHash(board, color);
    if (this.transpositionTable.has(hash)) {
      const entry = this.transpositionTable.get(hash);
      if (entry.depth >= 0 && entry.type === 0) return entry.score;
    }

    const standPat = this.evaluatePositionEnhanced(board, color);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const moves = this.getAllMovesForBoard(board, color);
    const captures = moves.filter((m) => m.isCapture);

    for (const move of captures) {
      const nextBoard = this.applyMoveToBoard(board, move);
      const score = -this.quiescenceSearch(
        nextBoard,
        -beta,
        -alpha,
        color === "black" ? "red" : "black"
      );

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  },

  // ENHANCED STATIC EVALUATION
  evaluatePositionEnhanced(board, color) {
    let score = 0;
    // Robust weight selection
    const w =
      this.weights && Object.keys(this.weights).length > 0
        ? this.weights
        : this.baseWeights;

    // First pass: Calculate average row position for each team to identify runners
    let blackRows = 0,
      blackCount = 0;
    let redRows = 0,
      redCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (p) {
          if (p.color === "black") {
            blackRows += r;
            blackCount++;
          } else {
            redRows += r;
            redCount++;
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
      score -= (blackSpread / blackCount) * (w.groupSpreadPenalty || 5);
    } else if (redCount > 0) {
      score -= (redSpread / redCount) * (w.groupSpreadPenalty || 5);
    }

    // Pre-calculate hash once for the whole board
    const nodeHash = this.getPositionHash(board);
    const hasOpeningBook = this.memory.openingBook && this.memory.openingBook.has(nodeHash);

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];

        // --- EMPTY SQUARE ANALYSIS (Defensive Integrity) ---
        if (!piece) continue;

        // Apply a small bias based on learned patterns at every node
        if (hasOpeningBook) {
          score += (piece.color === color ? 50 : -50);
        }

        const isMe = piece.color === color;
        const isKing = piece.king;

        // Base Material Value
        let value = isKing ? w.king : w.material;

        // --- SAFETY & TACTICS (ABSOLUTE) ---
        const isUnderAttack = this.isPieceUnderAttack(board, row, col, piece.color);
        if (isUnderAttack) {
          // ANY threat is treated as material loss - even if protected
          value -= w.selfDanger;
          
          // Kings under long-range threat are extreme priority
          if (isKing) value -= w.kingEndangerPenalty;
        }

        // --- KING PROTECTION BONUS ---
        if (isKing && isMe) {
          // Check if king is protected by friendly pieces
          const protectionCount = this.countKingProtectors(
            board,
            row,
            col,
            piece.color
          );
          if (protectionCount > 0) {
            value += w.kingProtection * protectionCount;
          }

          // Penalize exposed kings (no protection and can be attacked)
          if (protectionCount === 0 && isUnderAttack) {
            value -= w.kingExposurePenalty;
          }
        }

        // --- POSITIONAL BONUSES ---
        if (!isKing) {
          // Encourage advancement toward promotion
          const advanceRow =
            piece.color === "black" ? row : BOARD_SIZE - 1 - row;

          // Reward forward progress (opposite of penalty)
          value += advanceRow * w.advancement;

          // PROMOTION RUSH: Black pieces at row 7+ should prioritize promoting
          if (piece.color === "black" && row >= 7) {
            // Strong bonus for being at row 7 or 8 (close to promotion at row 9)
            value += w.promotionRush;

            // Extra bonus based on how close to promotion
            if (row === 8) {
              value += w.promotionRush * 2.5; 
            }
          }

          // Bonus for being close to promotion (general case)
          if (piece.color === "black" && row >= BOARD_SIZE - 2) {
            value += w.nearPromotion;
          } else if (piece.color === "red" && row <= 1) {
            value += w.nearPromotion;
          }

          // Center control (moderate bonus)
          if (row >= 3 && row <= 6 && col >= 3 && col <= 6) {
            value += w.center;
          }

          // Edge pieces are slightly safer
          if (col === 0 || col === BOARD_SIZE - 1) value += w.edgeSafety;

          // Back rank defense (small bonus, not excessive)
          if (piece.color === "black" && row <= 1) value += w.backRankDefense;
          if (piece.color === "red" && row >= BOARD_SIZE - 2)
            value += w.backRankDefense;

          // --- COHESION & DEFENSIVE FORMATION (Close The Gap) ---
          // Reward pieces that have friendly neighbors (formation)
          let neighbors = 0;
          const checkDirs = [
            [1, -1],
            [1, 1],
            [-1, -1],
            [-1, 1],
          ];
          for (const [dr, dc] of checkDirs) {
            const nr = row + dr,
              nc = col + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
              const neighbor = board[nr][nc];
              if (neighbor && neighbor.color === piece.color) {
                neighbors++;
              }
            }
          }
          // Add cohesion bonus (Gap Closure)
          if (neighbors > 0) value += neighbors * w.cohesion;

          // --- GROUP ADVANCEMENT (PHALANX LOGIC) ---
          const distFromGroup =
            piece.color === "black" ? row - avgBlackRow : avgRedRow - row;

          // EXTREME penalties for being ahead of the group
          if (distFromGroup > 1.0) {
            // Any piece ahead of the pack is heavily penalized
            value -= w.lonePiecePenalty * distFromGroup;
          } else if (distFromGroup < -1.0) {
            // REWARD pieces that are behind - encourage backfilling
            value += w.phalanxBonus;
          } else {
            // PHALANX: Piece is aligned with the pack
            value += w.phalanxBonus;
          }
        } else {
          // King centrality
          if (row >= 3 && row <= 6 && col >= 3 && col <= 6)
            value += w.center * 2;
        }

        // --- OFFENSIVE PRESSURE (NEW) ---
        // Reward creating threats/forks
        const threats = this.countThreatsEnhanced(board, row, col, piece);
        if (threats > 0) {
           // Much higher effective weight for search
           value += threats * (w.threatCreation || 2000); 
        }

        if (isMe) score += value;
        else score -= value;
      }
    }

    return score;
  },

  // Helper: Check if a piece is under immediate attack
  isPieceUnderAttack(board, row, col, color) {
    const opponent = color === "black" ? "red" : "black";
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

      if (
        landingRow >= 0 &&
        landingRow < BOARD_SIZE &&
        landingCol >= 0 &&
        landingCol < BOARD_SIZE
      ) {
        if (!board[landingRow][landingCol]) {
          // Landing square is clear. Now look for attackers in the opposite direction.
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

            const attacker = board[attackRow][attackCol];
            if (attacker) {
              if (attacker.color === opponent) {
                if (attacker.king || dist === 1) {
                  return true;
                }
              }
              break; // Path blocked
            }
          }
        }
      }
    }
    return false;
  },

  // NEW: Count how many friendly pieces are protecting a king
  countKingProtectors(board, kingRow, kingCol, color) {
    let protectors = 0;
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // Check adjacent diagonal squares
      const adjRow = kingRow + dRow;
      const adjCol = kingCol + dCol;

      if (
        adjRow >= 0 &&
        adjRow < BOARD_SIZE &&
        adjCol >= 0 &&
        adjCol < BOARD_SIZE
      ) {
        const adjacent = board[adjRow][adjCol];
        if (adjacent && adjacent.color === color) {
          protectors++;
        }
      }

      // For kings, also check if there are friendly pieces along diagonal lines
      // that block potential attacks
      for (let dist = 2; dist <= 3; dist++) {
        const distantRow = kingRow + dRow * dist;
        const distantCol = kingCol + dCol * dist;

        if (
          distantRow >= 0 &&
          distantRow < BOARD_SIZE &&
          distantCol >= 0 &&
          distantCol < BOARD_SIZE
        ) {
          const distant = board[distantRow][distantCol];
          if (distant) {
            if (distant.color === color) {
              protectors += 0.5; // Partial protection from distance
            }
            break; // Stop checking this direction
          }
        }
      }
    }

    return Math.floor(protectors);
  },

  // NEW: Search-safe threat counting (uses board array, not moves which use DOM)
  countThreatsEnhanced(board, row, col, piece) {
    let threatCount = 0;
    const isKing = piece.king;
    const opponentColor = piece.color === "black" ? "red" : "black";

    // In International Checkers, ALL pieces can capture in ALL directions
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    if (!isKing) {
        // Regular pieces: immediate jumps
        for (const [dRow, dCol] of directions) {
            const jumpRow = row + dRow * 2;
            const jumpCol = col + dCol * 2;
            const middleRow = row + dRow;
            const middleCol = col + dCol;

            if (
                jumpRow >= 0 &&
                jumpRow < BOARD_SIZE &&
                jumpCol >= 0 &&
                jumpCol < BOARD_SIZE
            ) {
                const middlePiece = board[middleRow][middleCol];
                const landSquare = board[jumpRow][jumpCol];
                // Check for enemy piece to jump over and empty landing spot
                if (middlePiece && middlePiece.color === opponentColor && !landSquare) {
                    threatCount++;
                }
            }
        }
    } else {
        // Flying King: Long range jumps
        for (const [dRow, dCol] of directions) {
            let foundEnemy = false;
            // Scan along the diagonal
            for (let dist = 1; dist < BOARD_SIZE; dist++) {
                const checkRow = row + dRow * dist;
                const checkCol = col + dCol * dist;

                if (checkRow < 0 || checkRow >= BOARD_SIZE || checkCol < 0 || checkCol >= BOARD_SIZE) break;

                const p = board[checkRow][checkCol];

                if (!foundEnemy) {
                    if (p) {
                        if (p.color === piece.color) break; // Blocked by friendly
                        if (p.color === opponentColor) foundEnemy = true; // Found target
                    }
                } else {
                    // We already found an enemy, now looking for landing spot
                    if (p) break; // Blocked by another piece after enemy
                    
                    // Empty square after enemy => VALID THREAT
                    threatCount++;
                    break; // Count 1 threat per direction
                }
            }
        }
    }
    
    return threatCount;
  },

  // Helper: Detect endgame phase
  isInEndgame(board) {
    let pieces = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (board[r][c]) pieces++;
      }
    }
    return pieces <= 6; // Standard checkers endgame threshold
  },

  // TACTICAL EVALUATION - No randomness, pure calculation
  evaluateTactical(move) {
    let tacticalScore = 0;

    // Capture evaluation (prioritized by piece value)
    if (move.isCapture) {
      tacticalScore += this.weights.captureBase;

      // Calculate total capture potential for this move
      const totalCapturePotential = this.getTotalCaptureCount(move);

      // MAXIMUM CAPTURE ENFORCEMENT: Heavily prioritize maximum captures
      const allCaptureMoves = this.getAllMoves("black").filter(
        (m) => m.isCapture
      );
      if (allCaptureMoves.length > 0) {
        const maxPossibleCaptures = Math.max(
          ...allCaptureMoves.map((m) => this.getTotalCaptureCount(m))
        );

        if (totalCapturePotential === maxPossibleCaptures) {
          // This is a maximum capture - HUGE bonus
          tacticalScore += 1000; // Massive bonus for maximum capture
        } else {
          // This is not maximum capture - HUGE penalty
          tacticalScore -= 2000; // Massive penalty for non-maximum capture
          return tacticalScore; // Return early with heavy penalty
        }
      }

      // Multi-capture bonus - heavily reward capturing more pieces
      if (move.capturedPieces && move.capturedPieces.length > 1) {
        // Kings with multi-captures already have this info
        const captureCount = move.capturedPieces.length;
        tacticalScore += (captureCount - 1) * this.weights.multiCaptureBonus;

        // LEARNING BOOST: Extra bonus for longer chains to encourage multi-capture mastery
        if (captureCount >= 3) {
          tacticalScore += 300; // Bonus for 3+ capture chains
        }
        if (captureCount >= 4) {
          tacticalScore += 500; // Additional bonus for 4+ capture chains
        }
      } else if (totalCapturePotential > 1) {
        // Regular pieces - check potential continuation captures
        tacticalScore +=
          (totalCapturePotential - 1) * this.weights.multiCaptureBonus;

        // LEARNING BOOST: Reward recognizing multi-capture potential
        if (totalCapturePotential >= 3) {
          tacticalScore += 200;
        }
      }

      // NEW: Multi-capture setup detection
      // Check if this capture creates an opportunity for another multi-capture
      const multiCaptureSetupValue = this.evaluateMultiCaptureSetup(move);
      tacticalScore += multiCaptureSetupValue;

      // King capture bonus - reward capturing kings
      if (move.isKingCapture) {
        // Regular piece capturing a king
        tacticalScore += this.weights.kingCaptureBonus;
      } else if (move.capturedKingsCount && move.capturedKingsCount > 0) {
        // King capturing other king(s) in multi-capture
        tacticalScore +=
          move.capturedKingsCount * this.weights.kingCaptureBonus;
      }

      // CRITICAL: Heavily reward safe captures, penalize dangerous ones
      const isSafe = !this.willBeUnderThreat(
        move.toRow,
        move.toCol,
        move.piece
      );
      if (isSafe) {
        tacticalScore += this.weights.safeCaptureBonus;
      } else {
        // Dangerous capture - reduce the score significantly
        tacticalScore -= 250; // Penalty for risky capture

        // Unless it's a multi-capture that's worth the risk
        if (totalCapturePotential > 1) {
          tacticalScore += 100; // Partially offset risk for multi-capture
        }
      }
    }

    // King promotion potential
    if (
      move.toRow === BOARD_SIZE - 1 &&
      move.piece.dataset.color === "black" &&
      move.piece.dataset.king !== "true"
    ) {
      tacticalScore += this.weights.promotionBonus;

      // But check if promotion square is safe
      if (!this.willBeUnderThreat(move.toRow, move.toCol, move.piece)) {
        tacticalScore += 200; // Bonus for safe promotion
      } else {
        tacticalScore -= 150; // Penalize risky promotion
      }
    }

    // PROMOTION RUSH: Heavily reward forward movement for pieces at row 7+
    if (
      !move.isCapture &&
      move.piece.dataset.color === "black" &&
      move.piece.dataset.king !== "true"
    ) {
      const fromRow = move.fromRow;
      const toRow = move.toRow;

      // If piece is at row 7 or 8, rushing toward promotion
      if (fromRow >= 7 && toRow > fromRow) {
        // Moving forward toward promotion - MASSIVE bonus
        tacticalScore += this.weights.nearPromotionAdvancement;

        // Even bigger bonus if at row 8 (one move from promotion)
        if (fromRow === 8) {
          tacticalScore += this.weights.promotionRush;
        }
      }
    }

    // Threat creation
    tacticalScore += this.evaluateThreatCreation(move);

    // Defensive value
    tacticalScore += this.evaluateDefensiveValue(move);

    return tacticalScore;
  },

  // ENHANCED POSITIONAL EVALUATION - Defensive-focused positioning
  evaluatePositional(move) {
    let positionalScore = 0;

    // PRIORITY 1: Defensive formation (NEW - highest priority)
    const defensiveValue = this.evaluateDefensiveFormation(move);
    positionalScore += defensiveValue;

    // PRIORITY 2: Piece cohesion (keeping pieces together)
    positionalScore += this.evaluateCohesion(move) * this.weights.cohesion;

    // PRIORITY 3: Gap closure (maintaining formation)
    positionalScore += this.evaluateGapClosure(move) * this.weights.gapClosure;

    // PRIORITY 4: Mutual support
    positionalScore += this.evaluateSupport(move) * this.weights.support;

    // PRIORITY 5: Center control (strategic squares) - REDUCED priority
    const centerValue = this.evaluateCenterControl(move);
    positionalScore += centerValue * this.weights.center * 0.7; // Reduced by 30%

    // Edge safety
    if (move.toCol === 0 || move.toCol === BOARD_SIZE - 1) {
      positionalScore += this.weights.edgeSafety;
    }

    // Avoid isolation
    positionalScore -=
      this.evaluateIsolation(move) * this.weights.isolationPenalty;

    // CRITICAL: Check if this move puts our piece in danger
    positionalScore += this.evaluateSelfDanger(move);

    // NEW: Reward filling gaps left by advancing pieces
    positionalScore += this.evaluateGapFilling(move);

    // NEW: Reward following the formation forward
    positionalScore += this.evaluateFollowLeader(move);

    // NEW: Reward compact forward advancement
    positionalScore += this.evaluateCompactAdvancement(move);

    // Side square occupation priority
    positionalScore += this.evaluateSideOccupation(move);

    return positionalScore;
  },

  // STRATEGIC EVALUATION - Long-term planning
  evaluateStrategic(move) {
    let strategicScore = 0;

    // Advancement bonus for regular pieces
    if (move.piece.dataset.king !== "true") {
      const advancement =
        move.piece.dataset.color === "black"
          ? move.toRow
          : BOARD_SIZE - 1 - move.toRow;
      strategicScore += advancement * this.weights.advancement;
    }

    // King mobility and activity
    if (move.piece.dataset.king === "true") {
      strategicScore += this.evaluateKingActivity(move);
    }

    // Control of key squares
    strategicScore += this.evaluateKeySquareControl(move);

    // Tempo and initiative
    strategicScore += this.evaluateTempo(move);

    return strategicScore;
  },

  // LEARNED PATTERNS - Experience-based evaluation
  evaluateLearnedPatterns(move) {
    let learnedScore = 0;

    // Get position hash for pattern recognition
    const positionHash = this.getPositionHash();

    // Check if we've seen this position before
    if (this.memory.positionDatabase.has(positionHash)) {
      const positionData = this.memory.positionDatabase.get(positionHash);
      learnedScore += positionData.evaluation || 0;
    }

    // Check winning move types
    const moveType = this.getMoveType(move);
    if (this.memory.winningMoveTypes.has(moveType)) {
      learnedScore +=
        this.memory.winningMoveTypes.get(moveType) *
        this.weights.learnedWinPattern;
    }

    // Avoid losing move types
    if (this.memory.losingMoveTypes.has(moveType)) {
      learnedScore -=
        this.memory.losingMoveTypes.get(moveType) *
        this.weights.learnedLossPattern;
    }

    return learnedScore;
  },

  getAllMoves(color) {
    const allMoves = [];
    const captureMoves = [];

    // If we must continue capturing with a specific piece, only get moves for that piece
    if (mustContinueCapture && forcedCapturePiece && color === "black") {
      console.log("getAllMoves: forced capture active for black; forcedCapturePiece=", forcedCapturePiece ? (forcedCapturePiece.dataset.row + "," + forcedCapturePiece.dataset.col) : null);
      // Find the position of the forced piece
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const piece = this.getPieceAt(row, col);
          if (piece === forcedCapturePiece) {
            const pieceMoves = this.getPieceMoves(row, col, piece);
            const caps = pieceMoves.filter((move) => move.isCapture);
            console.log("getAllMoves: forced piece found at", row, col, "captureMoves=", caps.length);
            return caps; // Only return capture moves
          }
        }
      }
      console.log("getAllMoves: forcedCapturePiece not found on board");
      return []; // Piece not found
    }

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.getPieceAt(row, col);
        if (!piece || piece.dataset.color !== color) continue;

        // Get all valid moves for this piece
        const pieceMoves = this.getPieceMoves(row, col, piece);

        // Separate capture moves from regular moves
        for (const move of pieceMoves) {
          if (move.isCapture) {
            captureMoves.push(move);
          } else {
            allMoves.push(move);
          }
        }
      }
    }

    // ENHANCED MANDATORY CAPTURE: Must choose the sequence that captures the most pieces
    if (captureMoves.length > 0) {
      return this.filterForMaximumCaptures(captureMoves);
    }

    return allMoves;
  },

  // NEW: Filter capture moves to only include those with maximum capture count
  filterForMaximumCaptures(captureMoves) {
    // Calculate capture count for each move
    const movesWithCounts = captureMoves.map((move) => {
      const captureCount = this.getTotalCaptureCount(move);
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

    return maxCaptureMoves;
  },

  // NEW: Get total number of pieces captured in a move sequence
  getTotalCaptureCount(move) {
    if (!move.isCapture) return 0;

    // For king multi-captures, count captured pieces
    if (move.capturedPieces && move.capturedPieces.length > 0) {
      return move.capturedPieces.length;
    }

    // For regular pieces, use the existing calculateCapturePotential method
    return this.calculateCapturePotential(move);
  },

  getPieceMoves(row, col, piece) {
    const MAX_MOVES_PER_PIECE = 100; // Safety limit to prevent infinite loops
    const moves = [];
    const isKing = piece.dataset.king === "true";
    const color = piece.dataset.color;
    const opponentColor = color === "black" ? "red" : "black";

    // Kings can move in all directions, regular pieces can capture in all directions but move only forward
    const allDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    const forwardDirections = isKing
      ? allDirections
      : color === "black"
      ? [
          [1, -1],
          [1, 1],
        ] // Black moves downward
      : [
          [-1, -1],
          [-1, 1],
        ]; // Red moves upward

    if (isKing) {
      // Kings can move and capture at long distance with multiple captures

      // First, get all possible capture moves with safety limit
      const sequenceStartTime = Date.now();
      const captureSequences = this.getKingCaptureSequences(
        row,
        col,
        piece,
        []
      );
      const sequenceTime = Date.now() - sequenceStartTime;

      // If king capture sequences took too long, fall back to simpler logic
      if (sequenceTime > 3000) {
        // Fallback: just look for immediate captures
        for (const [dRow, dCol] of allDirections) {
          for (let distance = 1; distance < BOARD_SIZE; distance++) {
            const enemyRow = row + dRow * distance;
            const enemyCol = col + dCol * distance;
            if (
              enemyRow < 0 ||
              enemyRow >= BOARD_SIZE ||
              enemyCol < 0 ||
              enemyCol >= BOARD_SIZE
            )
              break;

            const enemyPiece = this.getPieceAt(enemyRow, enemyCol);
            if (!enemyPiece) continue;
            if (enemyPiece.dataset.color !== opponentColor) break;

            // Found enemy, look for landing square
            for (
              let landDistance = distance + 1;
              landDistance < BOARD_SIZE;
              landDistance++
            ) {
              const landRow = row + dRow * landDistance;
              const landCol = col + dCol * landDistance;
              if (
                landRow < 0 ||
                landRow >= BOARD_SIZE ||
                landCol < 0 ||
                landCol >= BOARD_SIZE
              )
                break;

              const landPiece = this.getPieceAt(landRow, landCol);
              if (!landPiece) {
                moves.push({
                  fromRow: row,
                  fromCol: col,
                  toRow: landRow,
                  toCol: landCol,
                  piece: piece,
                  isCapture: true,
                  capturedPieces: [`${enemyRow},${enemyCol}`],
                  isKingCapture: enemyPiece.dataset.king === "true",
                });
                break; // Only take first landing square for simplicity
              } else {
                break; // Landing square occupied
              }
            }
            break; // Only take first enemy in this direction for simplicity
          }
        }
      } else if (
        captureSequences.length > 0 &&
        captureSequences.length <= MAX_MOVES_PER_PIECE
      ) {
        // If captures are available and reasonable number, only return capture moves
        moves.push(...captureSequences);
      } else if (captureSequences.length > MAX_MOVES_PER_PIECE) {
        moves.push(...captureSequences.slice(0, MAX_MOVES_PER_PIECE));
      } else {
        // No captures available, check regular long-distance moves
        for (const [dRow, dCol] of allDirections) {
          for (let distance = 1; distance < BOARD_SIZE; distance++) {
            const newRow = row + dRow * distance;
            const newCol = col + dCol * distance;

            if (
              newRow < 0 ||
              newRow >= BOARD_SIZE ||
              newCol < 0 ||
              newCol >= BOARD_SIZE
            )
              break;

            const targetPiece = this.getPieceAt(newRow, newCol);

            if (!targetPiece) {
              // Empty square - valid move
              moves.push({
                fromRow: row,
                fromCol: col,
                toRow: newRow,
                toCol: newCol,
                piece: piece,
                isCapture: false,
              });
            } else {
              // Piece blocks path
              break;
            }
          }
        }
      }
    } else {
      // Regular piece movement - can capture backward but can only move forward

      // Check for multi-capture sequences in ALL directions (including backward)
      const captureSequences = this.getRegularCaptureSequences(
        row,
        col,
        piece,
        []
      );
      if (captureSequences.length > 0) {
        moves.push(...captureSequences);
      }

      // If no captures, check regular moves (forward only)
      if (moves.length === 0) {
        for (const [dRow, dCol] of forwardDirections) {
          const newRow = row + dRow;
          const newCol = col + dCol;

          if (
            newRow >= 0 &&
            newRow < BOARD_SIZE &&
            newCol >= 0 &&
            newCol < BOARD_SIZE
          ) {
            if (!this.getPieceAt(newRow, newCol)) {
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
    }

    return moves;
  },

  getPieceAt(row, col) {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
      return null;
    const square = squares[row * BOARD_SIZE + col];
    return square.querySelector(".black-piece, .red-piece, .king");
  },

  // NEW: Record individual moves for analysis
  recordLastMove(move, score) {
    if (!move) return;
    
    // Get current position hash BEFORE the move
    const position = this.getPositionHash();
    
    // Create detailed move record
    const moveRecord = {
      move: {
        fromRow: move.fromRow,
        fromCol: move.fromCol,
        toRow: move.toRow,
        toCol: move.toCol,
        isCapture: move.isCapture,
        isKing: move.piece && move.piece.dataset ? move.piece.dataset.king === "true" : false,
        color: move.piece && move.piece.dataset ? move.piece.dataset.color : null
      },
      position: position,
      evaluation: score || 0,
      timestamp: Date.now(),
      // We will fill actualOutcome later when analyzing game
    };
    
    // Push to temporary game memory
    if (!this.memory.lastGameMoves) this.memory.lastGameMoves = [];
    this.memory.lastGameMoves.push(moveRecord);
    
    // Console log for debug (optional, can be removed later)
    // console.log(`[LEARNING] Recorded move. Total: ${this.memory.lastGameMoves.length}`);
  },

  // Enhanced Learning functions with deep analysis
  recordGame(won) {
    this.memory.games++;
    const previousExperience = this.memory.experienceLevel;

    const gameRecord = {
      gameId: this.memory.games,
      result: won ? "win" : "loss",
      moves: [...this.memory.lastGameMoves],
      gameLength: this.memory.lastGameMoves.length,
      timestamp: Date.now(),
      finalEvaluation: this.evaluatePosition("black"),
      strategyUsed: this.getCurrentStrategy(),
      mistakeCount: this.countMistakes(),
    };

    this.memory.gameHistory.push(gameRecord);
    if (this.memory.gameHistory.length > 100) {
      this.memory.gameHistory.shift(); // Keep only last 100 games
    }

    if (won === "draw") {
      this.memory.draws++;
      this.memory.experienceLevel += 2;
    } else if (won) {
      this.memory.wins++;
      this.learnFromVictory(gameRecord);
      this.memory.experienceLevel += 10;
    } else {
      this.memory.losses++;
      this.learnFromDefeat(gameRecord);
      this.memory.experienceLevel += 5;
    }

    console.log(`[LEARNING] Game recorded: ${won ? 'WIN' : 'LOSS'}. Moves: ${this.memory.lastGameMoves.length}. Winning patterns: ${this.memory.winningMoveTypes.size}. Losing patterns: ${this.memory.losingMoveTypes.size}`);

    const experienceGained = this.memory.experienceLevel - previousExperience;

    // Update game length statistics
    const gameLength = this.memory.lastGameMoves.length;
    this.memory.averageGameLength =
      (this.memory.averageGameLength * (this.memory.games - 1) + gameLength) /
      this.memory.games;

    // Enhanced learning from this game
    this.analyzeGameMoves();
    this.updatePlayerPatterns();
    this.evaluateStrategies();
    this.adjustConfidence(won);
    this.updateContextualLearning(gameRecord);

    // Clear temporary game data
    this.memory.lastGameMoves = [];

    this.saveMemory();
    this.displayLearningProgress();

    if (typeof updateAIStatsDisplay === "function") {
      updateAIStatsDisplay();
    }
  },

  recordThinkingTime(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;

    if (!Array.isArray(this.memory.timeSpentThinking)) {
      this.memory.timeSpentThinking = [];
    }

    this.memory.timeSpentThinking.push(durationMs);
    if (this.memory.timeSpentThinking.length > 50) {
      this.memory.timeSpentThinking.shift();
    }

    const totalMs = this.memory.timeSpentThinking.reduce(
      (sum, value) => (Number.isFinite(value) ? sum + value : sum),
      0
    );

    const sampleCount = this.memory.timeSpentThinking.filter((value) =>
      Number.isFinite(value)
    ).length;

    this.memory.averageThinkingTime =
      sampleCount > 0 ? totalMs / sampleCount : 0;
  },

  learnFromVictory(gameRecord) {
    let newPositions = 0;
    let newMoveTypes = 0;

    // Reinforce successful move patterns with enhanced analysis
    for (let i = 0; i < gameRecord.moves.length; i++) {
      const moveData = gameRecord.moves[i];
      const moveType = this.getMoveType(moveData.move);

      // Weight moves based on their position in the game
      const gamePhase = i / gameRecord.moves.length;
      const importance = this.calculateMoveImportance(moveData, gamePhase);

      if (this.memory.winningMoveTypes.has(moveType)) {
        this.memory.winningMoveTypes.set(
          moveType,
          this.memory.winningMoveTypes.get(moveType) + importance
        );
      } else {
        this.memory.winningMoveTypes.set(moveType, importance);
      }

      // Store position data for learning
      if (moveData.position) {
        const isNewPosition = !this.memory.positionDatabase.has(
          moveData.position
        );
        if (isNewPosition) newPositions++;

        const posData = this.memory.positionDatabase.get(moveData.position) || {
          wins: 0,
          losses: 0,
          totalGames: 0,
          averageEval: 0,
        };
        posData.wins++;
        posData.totalGames++;
        posData.averageEval =
          (posData.averageEval * (posData.totalGames - 1) +
            moveData.evaluation) /
          posData.totalGames;
        this.memory.positionDatabase.set(moveData.position, posData);
      }

      // Store successful sequences
      if (i < this.memory.lastGameMoves.length - 2) {
        const sequence = [
          moveData,
          this.memory.lastGameMoves[i + 1],
          this.memory.lastGameMoves[i + 2],
        ];
        this.memory.successfulSequences.push(sequence);
      }
    }

    // Adaptive weight adjustment based on what worked
    this.adaptWeightsFromSuccess(gameRecord);

    // Show top 3 most successful winning move types with their scores
    const winningMovesArray = Array.from(this.memory.winningMoveTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Update strategy effectiveness
    const strategy = gameRecord.strategyUsed;
    if (this.memory.strategyEffectiveness.has(strategy)) {
      this.memory.strategyEffectiveness.set(
        strategy,
        this.memory.strategyEffectiveness.get(strategy) + 1
      );
    } else {
      this.memory.strategyEffectiveness.set(strategy, 1);
    }
  },

  learnFromDefeat(gameRecord) {
    let newPositions = 0;
    let newMoveTypes = 0;
    const timestamp = Date.now();

    // Initialize new data structures if needed
    if (!this.memory.losingMovesByPosition) this.memory.losingMovesByPosition = new Map();
    if (!this.memory.losingPatternsByContext) this.memory.losingPatternsByContext = new Map();
    if (!this.memory.losingMoveTimestamps) this.memory.losingMoveTimestamps = new Map();

    // Enhanced mistake analysis
    for (let i = 0; i < gameRecord.moves.length; i++) {
      const moveData = gameRecord.moves[i];
      const moveType = this.getMoveType(moveData.move);
      const contextType = this.getMoveTypeWithContext(moveData.move, moveData.position);

      // IMPROVED THRESHOLD: More granular categorization
      // Severe mistakes (eval < 50): Count as +2
      // Moderate mistakes (50-100): Count as +1
      // Weak moves (100-150): Count as +0.5
      let penaltyWeight = 0;
      if (moveData.evaluation < 50) penaltyWeight = 2;
      else if (moveData.evaluation < 100) penaltyWeight = 1;
      else if (moveData.evaluation < 150) penaltyWeight = 0.5;
      else penaltyWeight = 0.2; // BASELINE: Even 'good' evaluation moves get a small penalty if the game was lost

      // Track critical mistakes
      if (moveData.evaluation < 50) {
        const mistakeContext = {
          moveType,
          position: moveData.position,
          gamePhase: i / gameRecord.moves.length,
          evaluation: moveData.evaluation,
          timestamp,
        };

        if (this.memory.mistakePatterns.has(moveType)) {
          this.memory.mistakePatterns.get(moveType).push(mistakeContext);
        } else {
          this.memory.mistakePatterns.set(moveType, [mistakeContext]);
        }
      }

      // If we lost using an opening line, reduce its score
      if (i < 8 && moveData.position && this.memory.openingBook.has(moveData.position)) {
        const currentScore = this.memory.openingBook.get(moveData.position);
        this.memory.openingBook.set(moveData.position, Math.max(0, currentScore - 2));
      }

      // GLOBAL PATTERN LEARNING (existing, but improved)
      if (penaltyWeight > 0) {
        const currentCount = this.memory.losingMoveTypes.get(moveType) || 0;
        this.memory.losingMoveTypes.set(moveType, currentCount + penaltyWeight);
        
        // Track timestamp for time-decay
        this.memory.losingMoveTimestamps.set(moveType, timestamp);
      }

      // NEW: POSITION-SPECIFIC PATTERN LEARNING
      if (moveData.position && penaltyWeight > 0) {
        const positionKey = `${moveData.position}_${moveType}`;
        const currentCount = this.memory.losingMovesByPosition.get(positionKey) || 0;
        this.memory.losingMovesByPosition.set(positionKey, currentCount + penaltyWeight);
      }

      // NEW: CONTEXT-SPECIFIC PATTERN LEARNING (game phase + move type)
      if (penaltyWeight > 0) {
        const currentCount = this.memory.losingPatternsByContext.get(contextType) || 0;
        this.memory.losingPatternsByContext.set(contextType, currentCount + penaltyWeight);
      }

      // Store position data for learning (defeats)
      if (moveData.position) {
        const isNewPosition = !this.memory.positionDatabase.has(
          moveData.position
        );
        if (isNewPosition) newPositions++;

        const posData = this.memory.positionDatabase.get(moveData.position) || {
          wins: 0,
          losses: 0,
          totalGames: 0,
          averageEval: 0,
        };
        posData.losses++;
        posData.totalGames++;
        posData.averageEval =
          (posData.averageEval * (posData.totalGames - 1) +
            moveData.evaluation) /
          posData.totalGames;
        this.memory.positionDatabase.set(moveData.position, posData);
      }
    }

    // Adaptive weight adjustment to avoid similar mistakes
    this.adaptWeightsFromFailure(gameRecord);

    // Show top 3 most common losing move types with their counts
    const losingMovesArray = Array.from(this.memory.losingMoveTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Decrease strategy effectiveness
    const strategy = gameRecord.strategyUsed;
    if (this.memory.strategyEffectiveness.has(strategy)) {
      this.memory.strategyEffectiveness.set(
        strategy,
        Math.max(0, this.memory.strategyEffectiveness.get(strategy) - 0.5)
      );
    }
  },

  analyzeGameMoves() {
    // Enhanced analysis of game patterns
    let captureSuccessful = 0;
    let totalCaptures = 0;
    let evaluationAccuracy = 0;
    let totalEvaluations = 0;

    for (const moveData of this.memory.lastGameMoves) {
      if (moveData.move.isCapture) {
        totalCaptures++;
        if (moveData.evaluation > 400) {
          captureSuccessful++;
        }
      }

      // Track evaluation accuracy
      if (moveData.actualOutcome !== undefined) {
        const accuracyScore =
          1 - Math.abs(moveData.evaluation - moveData.actualOutcome) / 1000;
        evaluationAccuracy += Math.max(0, accuracyScore);
        totalEvaluations++;
      }
    }

    // Update capture success statistics
    if (totalCaptures > 0) {
      this.memory.captureSuccess =
        (this.memory.captureSuccess + captureSuccessful) / 2;
      this.memory.captureAttempts += totalCaptures;
    }

    // Update evaluation accuracy
    if (totalEvaluations > 0) {
      this.memory.evaluationAccuracy =
        (this.memory.evaluationAccuracy +
          evaluationAccuracy / totalEvaluations) /
        2;
    }

    // PERFORM BLUNDER ANALYSIS
    this.analyzeBlunders();

    // REINFORCE OPENING SUCCESS
    if (this.memory.lastGameMoves.length > 5) {
      this.reinforceOpening(this.memory.lastGameMoves.slice(0, 10));
    }

    // ANALYZE OPPONENT
    this.analyzeOpponentArchetype();
  },

  analyzeOpponentArchetype() {
    let aggressiveMoves = 0;
    let defensiveMoves = 0;
    let greedyCaptures = 0;

    const recentGames = this.memory.gameHistory.slice(-5);
    recentGames.forEach((game) => {
      game.moves
        .filter((_, i) => i % 2 === 1)
        .forEach((m) => {
          if (m.move.isCapture) greedyCaptures++;
          // Archetype logic for 10x10
          if (m.move.toRow >= 3 && m.move.toRow <= 6) aggressiveMoves++;
          if (m.move.toRow <= 1 || m.move.toRow >= BOARD_SIZE - 2)
            defensiveMoves++;
        });
    });

    if (aggressiveMoves > defensiveMoves * 2)
      this.memory.opponentType = "aggressive";
    else if (defensiveMoves > aggressiveMoves)
      this.memory.opponentType = "turtle";
    else if (greedyCaptures > 5) this.memory.opponentType = "greedy";
    else this.memory.opponentType = "balanced";
  },

  analyzeBlunders() {
    // Track critical blunders (eval drop > 200) for special analysis
    // but don't double-count in losingMoveTypes (already counted in learnFromDefeat)
    if (!this.memory.criticalBlunders) this.memory.criticalBlunders = new Map();
    
    for (let i = 1; i < this.memory.lastGameMoves.length; i++) {
      const prevMove = this.memory.lastGameMoves[i - 1];
      const currentMove = this.memory.lastGameMoves[i];

      // If our evaluation dropped by more than 200 points after an opponent move
      // it means we failed to see a trap or the opponent found a great reply.
      if (prevMove.evaluation - currentMove.evaluation > 200) {
        const moveType = this.getMoveType(prevMove.move);
        const contextType = this.extractMovePattern(prevMove.move);

        // Track this as a critical blunder (for awareness, not penalty doubling)
        const key = `${moveType}_${contextType}`;
        const count = this.memory.criticalBlunders.get(key) || 0;
        this.memory.criticalBlunders.set(key, count + 1);
        
        // NOTE: The penalty is already applied in learnFromDefeat with penaltyWeight
        // DO NOT double-count by adding extra penalty here
      }
    }
  },

  reinforceOpening(openingMoves) {
    // If the game ended in a win, add these positions to our opening book
    const won =
      this.memory.gameHistory[this.memory.gameHistory.length - 1]?.result ===
      "win";
    if (!won) return;

    openingMoves.forEach((moveData) => {
      const hash = moveData.boardHash;
      if (hash) {
        const currentVal = this.memory.openingBook.get(hash) || 0;
        this.memory.openingBook.set(hash, currentVal + 1);
      }
    });
  },

  // New enhanced learning methods
  getCurrentStrategy() {
    // Determine current strategy based on weights
    if (this.weights.safety > 150) return "defensive";
    if (this.weights.mobility > 20) return "aggressive";
    if (this.weights.sideOccupation > 200) return "positional";
    if (this.weights.captureBase > 350) return "tactical";
    return "balanced";
  },

  countMistakes() {
    let mistakes = 0;
    for (const moveData of this.memory.lastGameMoves) {
      if (moveData.evaluation < 50) mistakes++;
    }
    return mistakes;
  },

  calculateMoveImportance(moveData, gamePhase) {
    let importance = 1;

    // Critical moves in endgame are more important
    if (gamePhase > 0.7) importance *= 1.5;

    // Captures are more important
    if (moveData.move.isCapture) importance *= 1.3;

    // High-evaluation moves are more important
    if (moveData.evaluation > 500) importance *= 1.2;

    return importance;
  },

  adaptWeightsFromSuccess(gameRecord) {
    const learningRate = this.memory.learningRate;

    // Identify which weights contributed to success
    for (const moveData of this.memory.lastGameMoves) {
      if (moveData.evaluation > 400) {
        // Reinforce weights that led to good moves
        if (moveData.move.isCapture) {
          this.baseWeights.captureBase *= 1 + learningRate * 0.1;
        }
        const isKing = moveData.move.piece ? (moveData.move.piece.dataset.king === "true") : moveData.move.isKing;
        if (isKing) {
          this.baseWeights.kingActivity *= 1 + learningRate * 0.1;
        }
      }
    }
  },

  adaptWeightsFromFailure(gameRecord) {
    const learningRate = this.memory.learningRate;

    // Adjust weights to avoid repeating mistakes
    for (const moveData of this.memory.lastGameMoves) {
      if (moveData.evaluation < 100) {
        // Reduce influence of weights that led to poor moves
        if (!moveData.move.isCapture && this.baseWeights.selfDanger < 600) {
          this.baseWeights.selfDanger *= 1 + learningRate * 0.2;
        }
        const isKing = moveData.move.piece ? (moveData.move.piece.dataset.king === "true") : moveData.move.isKing;
        if (isKing) {
          this.baseWeights.kingEndangerPenalty *= 1 + learningRate * 0.1;
        }
      }
    }
  },

  updatePlayerPatterns() {
    // Analyze human player's last few moves to learn patterns
    if (this.memory.lastGameMoves.length > 0) {
      const recentMoves = this.memory.lastGameMoves.slice(-10);
      const playerMoves = recentMoves.filter((_, index) => index % 2 === 1); // Human moves

      for (const moveData of playerMoves) {
        const pattern = this.extractMovePattern(moveData.move);
        if (this.memory.playerPatterns.has(pattern)) {
          this.memory.playerPatterns.set(
            pattern,
            this.memory.playerPatterns.get(pattern) + 1
          );
        } else {
          this.memory.playerPatterns.set(pattern, 1);
        }
      }
    }
  },

  extractMovePattern(move) {
    // Extract deep strategic pattern from move
    let patterns = [];

    if (move.isCapture) patterns.push("capture");
    if (move.isMultiCapture) patterns.push("multi_capture");
    
    // Handle both live DOM element and stored move object
    const isKing = move.piece ? (move.piece.dataset.king === "true") : move.isKing;
    const color = move.piece ? move.piece.dataset.color : move.color;

    if (isKing) patterns.push("king_activity");
    if (move.toRow === 0 || move.toRow === BOARD_SIZE - 1)
      patterns.push("promotion_zone");

    // BACK RANK ATTACK
    if (move.toRow <= 1 && color === "red")
      patterns.push("attacking_base");
    if (move.toRow >= BOARD_SIZE - 2 && color === "black")
      patterns.push("attacking_base");

    // CENTER CONTROL
    if (
      move.toRow >= 3 &&
      move.toRow <= BOARD_SIZE - 4 &&
      move.toCol >= 3 &&
      move.toCol <= BOARD_SIZE - 4
    )
      patterns.push("center_push");

    // NEW: Local Density Pattern (Friendly vs Enemy)
    const density = this.calculateLocalDensity(move.toRow, move.toCol, color);
    if (density > 1) patterns.push("supported_advance");
    else if (density < -1) patterns.push("isolated_plunge");

    // FORMATION BREAKING
    if (move.isCapture && move.capturedPieces?.length > 1)
      patterns.push("breakthrough");

    return patterns.join("|") || "positional_creep";
  },

  calculateLocalDensity(row, col, color) {
    let score = 0;
    const dirs = [[-1,-1], [-1,1], [1,-1], [1,1]];
    dirs.forEach(([dr, dc]) => {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const p = this.getPieceAt(r, c);
        if (p) {
          if (p.dataset.color === color) score++;
          else score--;
        }
      }
    });
    return score;
  },

  evaluateStrategies() {
    // Evaluate effectiveness of different strategies
    let bestStrategy = "balanced";
    let bestScore = 0;

    for (const [strategy, score] of this.memory.strategyEffectiveness) {
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  },

  adjustConfidence(won) {
    const adjustment = won ? 0.05 : -0.03;
    this.memory.confidenceLevel = Math.max(
      0.1,
      Math.min(0.9, this.memory.confidenceLevel + adjustment)
    );

    // Adjust learning rate based on confidence
    this.memory.learningRate = 0.05 + (1 - this.memory.confidenceLevel) * 0.1;
  },

  updateContextualLearning(gameRecord) {
    // Learn based on game context (material balance, game phase, etc.)
    const context = {
      gameLength: gameRecord.gameLength,
      result: gameRecord.result,
      strategy: gameRecord.strategyUsed,
      mistakes: gameRecord.mistakeCount,
    };

    const contextKey = `${gameRecord.strategyUsed}_${
      gameRecord.gameLength > 50 ? "long" : "short"
    }`;

    if (this.memory.contextualLearning.has(contextKey)) {
      const existing = this.memory.contextualLearning.get(contextKey);
      existing.count++;
      existing.wins += gameRecord.result === "win" ? 1 : 0;
      existing.avgMistakes =
        (existing.avgMistakes + gameRecord.mistakeCount) / 2;
    } else {
      this.memory.contextualLearning.set(contextKey, {
        count: 1,
        wins: gameRecord.result === "win" ? 1 : 0,
        avgMistakes: gameRecord.mistakeCount,
      });
    }
  },

  displayLearningProgress() {
    // Display every game to show progress clearly
    const bestStrategy = this.evaluateStrategies();
  },

  saveMemory() {
    localStorage.setItem(
      "enhancedAI_memory",
      JSON.stringify({
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

        // Enhanced learning data
        gameHistory: this.memory.gameHistory.slice(-50), // Save last 50 games
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
        opponentWeaknesses: Array.from(
          this.memory.opponentWeaknesses.entries()
        ),
        contextualLearning: Array.from(
          this.memory.contextualLearning.entries()
        ),
        learningRate: this.memory.learningRate,
        confidenceLevel: this.memory.confidenceLevel,
        experienceLevel: this.memory.experienceLevel,
        
        // NEW: Enhanced learning mechanisms
        losingMovesByPosition: Array.from((this.memory.losingMovesByPosition || new Map()).entries()),
        losingPatternsByContext: Array.from((this.memory.losingPatternsByContext || new Map()).entries()),
        losingMoveTimestamps: Array.from((this.memory.losingMoveTimestamps || new Map()).entries()),
        criticalBlunders: Array.from((this.memory.criticalBlunders || new Map()).entries()),
      })
    );
  },

  loadMemory() {
    try {
      const saved = localStorage.getItem("enhancedAI_memory");
      if (saved) {
        const data = JSON.parse(saved);
        this.memory.games = data.games || 0;
        this.memory.wins = data.wins || 0;
        this.memory.losses = data.losses || 0;
        this.memory.draws = data.draws || 0;
        this.memory.patterns = new Map(data.patterns || []);
        this.memory.positionDatabase = new Map(data.positionDatabase || []);
        this.memory.openingBook = new Map(data.openingBook || []);
        this.memory.endgameKnowledge = new Map(data.endgameKnowledge || []);
        this.memory.tacticalPatterns = new Map(data.tacticalPatterns || []);
        this.memory.winningMoveTypes = new Map(data.winningMoveTypes || []);
        this.memory.losingMoveTypes = new Map(data.losingMoveTypes || []);
        this.memory.averageGameLength = data.averageGameLength || 0;
        this.memory.totalMoves = data.totalMoves || 0;
        this.memory.captureSuccess = data.captureSuccess || 0;
        this.memory.captureAttempts = data.captureAttempts || 0;
        this.memory.kingPromotions = data.kingPromotions || 0;
        if (data.difficulty) this.difficulty = data.difficulty;

        // Load learned weights if they exist
        if (data.baseWeights) {
          this.baseWeights = { ...this.baseWeights, ...data.baseWeights };
        }

        // Load enhanced learning data
        this.memory.gameHistory = data.gameHistory || [];
        this.memory.playerPatterns = new Map(data.playerPatterns || []);
        this.memory.evaluationAccuracy = data.evaluationAccuracy || 0;
        this.memory.timeSpentThinking = data.timeSpentThinking || [];
        this.memory.averageThinkingTime = data.averageThinkingTime || 0;
        this.memory.strategyEffectiveness = new Map(
          data.strategyEffectiveness || []
        );
        this.memory.adaptiveWeights = new Map(data.adaptiveWeights || []);
        this.memory.positionOutcomes = new Map(data.positionOutcomes || []);
        this.memory.mistakePatterns = new Map(data.mistakePatterns || []);
        this.memory.successfulSequences = data.successfulSequences || [];
        this.memory.opponentWeaknesses = new Map(data.opponentWeaknesses || []);
        this.memory.contextualLearning = new Map(data.contextualLearning || []);
        this.memory.learningRate = data.learningRate || 0.1;
        this.memory.confidenceLevel = data.confidenceLevel || 0.5;
        this.memory.experienceLevel = data.experienceLevel || 0;
        
        // NEW: Load enhanced learning mechanisms
        this.memory.losingMovesByPosition = new Map(data.losingMovesByPosition || []);
        this.memory.losingPatternsByContext = new Map(data.losingPatternsByContext || []);
        this.memory.losingMoveTimestamps = new Map(data.losingMoveTimestamps || []);
        this.memory.criticalBlunders = new Map(data.criticalBlunders || []);
      }
    } catch (e) {}
  },

  // Enhanced learning methods for move evaluation
  applyLearningBonus(move, baseScore) {
    try {
      let bonus = 0;
      const moveType = this.getMoveType(move);
      const boardHash = this.getPositionHash();
      const timestamp = Date.now();
      const contextType = this.getMoveTypeWithContext(move, boardHash);

      // 1. POSITION SPECIFIC LEARNING (Opening Book)
      if (this.memory.openingBook && this.memory.openingBook.has(boardHash)) {
        bonus += 150; // Strong bias towards moves we know led to wins
      }

      // 2. PATTERN LEARNING (General types)
      if (
        this.memory.winningMoveTypes &&
        this.memory.winningMoveTypes.has(moveType)
      ) {
        const successCount = this.memory.winningMoveTypes.get(moveType);
        bonus += Math.min(200, successCount * 10); // Increased impact
      }

      // 3. BLUNDER AVOIDANCE WITH TIME-DECAY (Enhanced)
      if (
        this.memory.losingMoveTypes &&
        this.memory.losingMoveTypes.has(moveType)
      ) {
        const failureCount = this.memory.losingMoveTypes.get(moveType);
        const moveTimestamp = this.memory.losingMoveTimestamps?.get(moveType) || timestamp;
        
        // TIME-DECAY: Recent losses weigh more than old losses
        // Half-life: 90 days (7776000000 ms)
        const ageMs = timestamp - moveTimestamp;
        const halfLifeMs = 90 * 24 * 60 * 60 * 1000;
        const ageFactor = Math.pow(0.5, ageMs / halfLifeMs);
        const decayedFailureCount = failureCount * ageFactor;
        
        // Progressive penalty: Faster early penalty, slower later
        const basePenalty = Math.min(decayedFailureCount, 20) * 15;  // 0-300 for first 20
        const bonusScaling = Math.max(0, Math.min(decayedFailureCount - 20, 10) * 3); // Slower for 20+
        const totalPenalty = basePenalty + bonusScaling;
        
        bonus -= Math.round(totalPenalty);
      }

      // NEW: POSITION-SPECIFIC BLUNDER AVOIDANCE
      if (this.memory.losingMovesByPosition && boardHash) {
        const positionKey = `${boardHash}_${moveType}`;
        const positionFailureCount = this.memory.losingMovesByPosition.get(positionKey) || 0;
        if (positionFailureCount > 0) {
          // Higher penalty for moves that failed in THIS specific position
          bonus -= Math.round(Math.min(150, positionFailureCount * 20));
        }
      }

      // NEW: CONTEXT-SPECIFIC LEARNING
      if (this.memory.losingPatternsByContext && contextType) {
        const contextFailureCount = this.memory.losingPatternsByContext.get(contextType) || 0;
        if (contextFailureCount > 0) {
          // Medium penalty for moves that failed in this game context
          bonus -= Math.round(Math.min(100, contextFailureCount * 12));
        }
      }

      // Apply contextual learning
      try {
        const context = this.getCurrentGameContext();
        const contextKey = `${this.getCurrentStrategy()}_${context}`;
        if (
          this.memory.contextualLearning &&
          this.memory.contextualLearning.has(contextKey)
        ) {
          const contextData = this.memory.contextualLearning.get(contextKey);
          const winRate = contextData.wins / contextData.count;
          if (winRate > 0.6) bonus += 30; // Good context
          else if (winRate < 0.4) bonus -= 30; // Bad context
        }
      } catch (contextError) {}

      // 4. OPPONENT-SPECIFIC EXPLOITATION
      if (
        this.memory.opponentType === "aggressive" &&
        moveType.includes("center_push")
      ) {
        bonus += 50; // Counter aggression by controlling the center
      }
      if (
        this.memory.opponentType === "turtle" &&
        moveType.includes("attacking_base")
      ) {
        bonus += 100; // Push harder against defensive players
      }

      // 5. STRENGTH REINFORCEMENT
      if (this.memory.experienceLevel > 50) {
        bonus *= 1 + this.memory.experienceLevel / 1000; // AI gets more "confident" in its learned bonuses as it gains experience
      }

      // 6. ADAPTIVE CONFIDENCE
      const confidenceLevel = this.memory.confidenceLevel || 0.5;
      bonus *= confidenceLevel;

      return Math.round(bonus);
    } catch (error) {
      return 0;
    }
  },

  getCurrentGameContext() {
    const totalPieces = this.countAllPieces();
    if (totalPieces > 24) return "opening"; // Out of 40 pieces total
    if (totalPieces > 12) return "midgame";
    return "endgame";
  },

  countAllPieces() {
    let count = 0;
    const size = BOARD_SIZE || 10;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = this.getPieceAt(row, col);
        if (piece) count++;
      }
    }
    return count;
  },

  evaluateStrategicValue(move) {
    try {
      let value = 0;

      // King activity value
      if (move.piece && move.piece.dataset.king === "true") {
        value += 10;
      }

      // Capture value
      if (move.isCapture) {
        value += move.capturedPieces ? move.capturedPieces.length * 15 : 15;
      }

      // PROACTIVE ANNIHILATION: Check for future capture setups
      value += this.evaluateCaptureOpportunities(move);

      // Positional value (Center Control)
      const center = (BOARD_SIZE - 1) / 2; // 4.5 for 10x10
      const centerDistance =
        Math.abs(center - move.toRow) + Math.abs(center - move.toCol);
      value += Math.max(0, BOARD_SIZE - centerDistance);

      return value;
    } catch (error) {
      return 0;
    }
  },

  evaluateRiskLevel(move) {
    try {
      let risk = 0;

      // Check if moving into danger
      if (
        this.willBeUnderThreat &&
        this.willBeUnderThreat(move.toRow, move.toCol, move.piece)
      ) {
        risk += 50;
      }

      // Check if exposing other pieces
      const exposedPieces = this.countExposedPiecesAfterMove(move);
      risk += exposedPieces * 15;

      // King risk is higher
      if (move.piece && move.piece.dataset.king === "true") {
        risk *= 1.5;
      }

      return risk;
    } catch (error) {
      return 0;
    }
  },

  countExposedPiecesAfterMove(move) {
    // Simulate the move and count how many friendly pieces become exposed
    let exposedCount = 0;
    // This is a simplified check - could be expanded for more accuracy
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      const checkRow = move.fromRow + dRow;
      const checkCol = move.fromCol + dCol;
      if (
        checkRow >= 0 &&
        checkRow < BOARD_SIZE &&
        checkCol >= 0 &&
        checkCol < BOARD_SIZE
      ) {
        const piece = this.getPieceAt(checkRow, checkCol);
        if (piece && piece.dataset.color === "black") {
          // Check if this piece will be exposed after our move
          if (this.willBeExposedAfterMove(checkRow, checkCol, move)) {
            exposedCount++;
          }
        }
      }
    }

    return exposedCount;
  },

  willBeExposedAfterMove(row, col, move) {
    // Check if piece at row,col will be exposed after the given move
    const supportingPositions = [
      [row - 1, col - 1],
      [row - 1, col + 1],
      [row + 1, col - 1],
      [row + 1, col + 1],
    ];

    let supportCount = 0;
    for (const [suppRow, suppCol] of supportingPositions) {
      if (
        suppRow >= 0 &&
        suppRow < BOARD_SIZE &&
        suppCol >= 0 &&
        suppCol < BOARD_SIZE
      ) {
        // Skip the position we're moving from
        if (suppRow === move.fromRow && suppCol === move.fromCol) continue;

        const supportPiece = this.getPieceAt(suppRow, suppCol);
        if (supportPiece && supportPiece.dataset.color === "black") {
          supportCount++;
        }
      }
    }

    return supportCount === 0; // Exposed if no support
  },

  // Multi-capture sequences for regular pieces
  getRegularCaptureSequences(row, col, piece, capturedPieces = [], depth = 0, lastDirection = null) {
    const MAX_DEPTH = 6;
    const MAX_CAPTURES = 6;
    const moves = [];

    if (depth > MAX_DEPTH || capturedPieces.length >= MAX_CAPTURES) {
      return moves;
    }

    const color = piece.dataset.color;
    const opponentColor = color === "black" ? "red" : "black";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // NEW: No backtracking (180-degree turn) in the same multi-capture sequence
      if (lastDirection && dRow === -lastDirection[0] && dCol === -lastDirection[1]) {
        continue;
      }
      const targetRow = row + dRow;
      const targetCol = col + dCol;
      const landingRow = row + dRow * 2;
      const landingCol = col + dCol * 2;

      if (
        landingRow >= 0 &&
        landingRow < BOARD_SIZE &&
        landingCol >= 0 &&
        landingCol < BOARD_SIZE
      ) {
        const targetPiece = this.getPieceAt(targetRow, targetCol);
        const landingPiece = this.getPieceAt(landingRow, landingCol);
        const targetKey = `${targetRow},${targetCol}`;

        if (
          targetPiece &&
          targetPiece.dataset.color === opponentColor &&
          !capturedPieces.includes(targetKey) &&
          !landingPiece
        ) {
          const newCapturedPieces = [...capturedPieces, targetKey];
          const baseMove = {
            fromRow: row,
            fromCol: col,
            toRow: landingRow,
            toCol: landingCol,
            piece: piece,
            isCapture: true,
            capturedRow: targetRow,
            capturedCol: targetCol,
            capturedPieces: newCapturedPieces,
          };

          // Recursively check for more captures
          const furtherCaptures = this.getRegularCaptureSequences(
            landingRow,
            landingCol,
            piece,
            newCapturedPieces,
            depth + 1,
            [dRow, dCol] // NEW: Pass current direction to prevent backtracking
          );

          if (furtherCaptures.length > 0) {
            // Add step-by-step captures - current capture first, then continuations
            moves.push(baseMove);
            moves.push(...furtherCaptures);
          } else {
            moves.push(baseMove);
          }
        }
      }
    }

    return moves;
  },

  // Advanced king capture sequences - allows multiple captures in one turn
  getKingCaptureSequences(
    row,
    col,
    piece,
    capturedPieces = [],
    depth = 0,
    sharedStartTime = null,
    lastDirection = null // NEW: Track last direction to prevent 180U-turns
  ) {
    const MAX_DEPTH = 6; // Reduced slightly for safety
    const MAX_CAPTURES = 10;
    const MAX_EXECUTION_TIME = 200; // 200ms per search to prevent UI freeze
    const startTime = sharedStartTime || Date.now();
    const moves = [];

    if (depth > MAX_DEPTH || capturedPieces.length >= MAX_CAPTURES) {
      return moves;
    }

    // Timeout protection
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      return moves;
    }

    const color = piece.dataset.color;
    const opponentColor = color === "black" ? "red" : "black";
    const directions = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    for (const [dRow, dCol] of directions) {
      // NEW: No backtracking (180-degree turn) in the same multi-capture sequence
      if (lastDirection && dRow === -lastDirection[0] && dCol === -lastDirection[1]) {
        continue;
      }

      // Timeout check in main loop
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        break;
      }

      // RESTORED: Flying King Logic - Search for ANY enemy along the diagonal
      for (let distance = 1; distance < BOARD_SIZE; distance++) {
        const checkRow = row + dRow * distance;
        const checkCol = col + dCol * distance;

        // Check bounds
        if (
          checkRow < 0 ||
          checkRow >= BOARD_SIZE ||
          checkCol < 0 ||
          checkCol >= BOARD_SIZE
        ) {
          break;
        }

        const potentialPiece = this.getPieceAt(checkRow, checkCol);

        if (potentialPiece) {
          // If it's our own piece, this direction is blocked
          if (potentialPiece.dataset.color === color) {
            break;
          }

          // If it's an OPPONENT piece, this is our potential capture target
          if (potentialPiece.dataset.color === opponentColor) {
            const enemyRow = checkRow;
            const enemyCol = checkCol;
            const enemyKey = `${enemyRow},${enemyCol}`;

            // Skip if we already captured this piece in this sequence
            if (capturedPieces.includes(enemyKey)) {
              break; // Cannot jump over already captured piece
            }

            // FOUND ENEMY at [enemyRow, enemyCol]
            // Now checking landing spots BEYOND it
            // Start checking from the square immediately after the enemy
            for (
              let landDistance = distance + 1;
              landDistance < BOARD_SIZE;
              landDistance++
            ) {
              const landRow = row + dRow * landDistance;
              const landCol = col + dCol * landDistance;

              if (
                landRow < 0 ||
                landRow >= BOARD_SIZE ||
                landCol < 0 ||
                landCol >= BOARD_SIZE
              )
                break;

              const landPiece = this.getPieceAt(landRow, landCol);
              // Landing path blocked by another piece?
              // CRITICAL FIX: Ignore the piece that is currently jumping!
              if (landPiece && landPiece !== piece) break;

              // VALID LANDING SPOT
              // ... (Recursive capture logic continues below in existing code)
              const landKey = `${landRow},${landCol}`; // Re-declare for safety/clarity if needed or just use flow

              if (!capturedPieces.includes(landKey)) {
                // Valid landing square - create capture move
                const newCapturedPieces = [...capturedPieces, enemyKey];

                // Check if any captured pieces are kings
                const capturedKings = newCapturedPieces.filter(
                  (capturedKey) => {
                    const [capturedRow, capturedCol] = capturedKey
                      .split(",")
                      .map(Number);
                    const capturedPiece = this.getPieceAt(
                      capturedRow,
                      capturedCol
                    );
                    return (
                      capturedPiece && capturedPiece.dataset.king === "true"
                    );
                  }
                );

                const baseMove = {
                  fromRow: row,
                  fromCol: col,
                  toRow: landRow,
                  toCol: landCol,
                  piece: piece,
                  isCapture: true,
                  capturedPieces: newCapturedPieces,
                  isMultiCapture: newCapturedPieces.length > 1,
                  capturedKingsCount: capturedKings.length, // Track king captures
                };

                // Check if more captures are possible from the landing position
                const furtherCaptures = this.getKingCaptureSequences(
                  landRow,
                  landCol,
                  piece,
                  newCapturedPieces,
                  depth + 1,
                  startTime,
                  [dRow, dCol] // NEW: Pass current direction to prevent backtracking
                );

                if (furtherCaptures.length > 0) {
                  // FIX: Flatten the recursive moves to start from the current origin
                  // This ensures that deep capture sequences are seen as valid moves from the start position
                  // and correctly counted for mandatory capture logic (resolving "unclickable king" bug).
                  furtherCaptures.forEach((nextMove) => {
                    moves.push({
                      ...baseMove,
                      toRow: nextMove.toRow,
                      toCol: nextMove.toCol,
                      capturedPieces: nextMove.capturedPieces,
                      capturedKingsCount: nextMove.capturedKingsCount,
                      isMultiCapture: true,
                    });
                  });

                  // Also add the base move to allow step-by-step if needed, 
                  // though it may be filtered out by max-capture rules
                  moves.push(baseMove);
                } else {
                  moves.push(baseMove);
                }
              }
            }
            // After processing this enemy, we break because we can't jump OVER a piece to find another enemy in the same line without landing first
            break;
          }
        }
      }
      // Continue to next direction
    }

    return moves;
  },
};

// Game initialization
function initGame() {
  board.innerHTML = "";
  squares.length = 0;
  selectedPiece = null;
  currentPlayer = "red";
  mustContinueCapture = false;
  forcedCapturePiece = null;
  gameOver = false;
  enhancedAI.lastMoveFromRow = null;
  enhancedAI.lastMoveFromCol = null;

  loadPanelStats();

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
  updateAIStatus(
    API_CONFIG.enabled ? "Neural Network AI" : "Grandmaster Level"
  );
  updateAIStatsDisplay();

  // Auto-resume learning when game starts (if API is enabled)
  if (API_CONFIG.enabled) {
    resumeLearning();
  }

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
      improvementRate: 0
    },
    decisions: [],
    alerts: []
  };

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
    averageHealth: 100
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
      }),
    }).catch(() => null);

    if (resp && resp.ok) {
      gameResultSent = true;
      sentGames.push(gameId);
      sessionStorage.setItem("sentGameIds", JSON.stringify(sentGames));
    }
  } catch (error) {}
}

// Resume learning worker
async function resumeLearning() {
  if (!API_CONFIG.enabled) return;

  try {
    await apiFetch(`/api/resume`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => null);
  } catch (error) {}
}

// Track trajectory for learning
function addToTrajectory(beforeState, move, afterState, playerColor) {
  if (!API_CONFIG.enabled) return;
  if (!beforeState || !afterState) return;

  // Calculate heuristic evaluation for distillation (teacher signal)
  // Normalized to approx [-1, 1] using tanh
  let hScore = 0;
  if (typeof enhancedAI !== "undefined" && enhancedAI.evaluatePositionEnhanced) {
    const rawScore = enhancedAI.evaluatePositionEnhanced(afterState, "black");
    hScore = Math.tanh(rawScore / 2000000); // Scale 2.0M to ~0.76
  }

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
  });
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
      showMessage("[ALERT] You must finish the capture sequence!", "warning");
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
        `[ALERT] CAPTURE REQUIRED! Check piece at [${sourcePiece.fromRow},${sourcePiece.fromCol}]`,
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
    lastJumpDirection = [ Math.sign(toRow - fromRow), Math.sign(toCol - fromCol) ];
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
          alreadyCaptured
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
      alreadyCaptured
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
      return; // Don't end the turn - continue capture sequence
    }
  }

  recordTrajectoryIfNeeded();
  mustContinueCapture = false;
  forcedCapturePiece = null;
  lastJumpDirection = null; // Reset jump direction at end of turn
  endTurn();
  // Ensure win check happens after all DOM updates are complete
  setTimeout(() => checkForWin(), 0);
}

// ═══════════════════════════════════════════════════════════════════
// PERIODIC DEFENSE EVALUATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function performPeriodicDefenseEvaluation(moveNumber) {
  console.log(`\n🛡️ DEFENSE CHECK - Move ${moveNumber}`);
  const snapshot = {
    moveNumber: moveNumber,
    timestamp: Date.now(),
    pieceCount: document.querySelectorAll(".black-piece").length,
    kingCount: document.querySelectorAll(".black-piece[data-king='true']").length,
    formationScore: Math.min(100, Math.max(0, 100 - countDefensiveGaps() * 5)),
    gapCount: countDefensiveGaps(),
    isolatedPieces: countIsolatedPieces(),
    threatenedPieces: countThreatenedPieces(),
    threatCount: countTotalThreats(),
    safetyScore: calculateSafetyScore(),
    backRankStrength: evaluateBackRankStrength()
  };
  snapshot.defensiveHealth = 
    (snapshot.formationScore * 0.30) +
    (Math.max(0, 100 - snapshot.threatCount * 10) * 0.35) +
    ((snapshot.pieceCount / 12) * 100 * 0.20) +
    (Math.min(100, (snapshot.backRankStrength / 10) * 100) * 0.15);
  if (defensiveMetrics.snapshots.length > 0) {
    const prev = defensiveMetrics.snapshots[defensiveMetrics.snapshots.length - 1];
    const delta = snapshot.defensiveHealth - prev.defensiveHealth;
    snapshot.trend = delta > 5 ? "improving" : delta < -5 ? "declining" : "stable";
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
  defensiveState.lastCheckMove = moveNumber;
  defensiveState.nextCheckMove = moveNumber + PERIODIC_EVAL_INTERVAL;
  const bar = "█".repeat(Math.round(snapshot.defensiveHealth / 10)) + 
              "░".repeat(10 - Math.round(snapshot.defensiveHealth / 10));
  console.log(`Health: ${snapshot.defensiveHealth.toFixed(0)}/100 [${bar}]`);
  console.log(`Threat: ${snapshot.riskLevel} | Formation: ${snapshot.formationScore.toFixed(0)} | Pieces: ${snapshot.pieceCount}`);
  if (snapshot.riskLevel === "critical") {
    console.log(`⚠️ CRITICAL: Defense failing! Health: ${snapshot.defensiveHealth.toFixed(0)}`);
    if (snapshot.threatCount >= 5) {
      console.log(`   → ${snapshot.threatCount} pieces under threat`);
    }
  }
}

function countDefensiveGaps() {
  let gaps = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = enhancedAI.getPieceAt(r, c);
      if (!piece) {
        const adjacent = [
          enhancedAI.getPieceAt(r-1, c-1),
          enhancedAI.getPieceAt(r-1, c+1),
          enhancedAI.getPieceAt(r+1, c-1),
          enhancedAI.getPieceAt(r+1, c+1)
        ].filter(p => p && p.dataset.color === "black");
        if (adjacent.length >= 2) gaps++;
      }
    }
  }
  return gaps;
}

function countIsolatedPieces() {
  let isolated = 0;
  document.querySelectorAll(".black-piece").forEach(piece => {
    const row = parseInt(piece.dataset.row);
    const col = parseInt(piece.dataset.col);
    const support = [
      enhancedAI.getPieceAt(row-1, col-1),
      enhancedAI.getPieceAt(row-1, col+1),
      enhancedAI.getPieceAt(row+1, col-1),
      enhancedAI.getPieceAt(row+1, col+1)
    ].filter(p => p && p.dataset.color === "black").length;
    if (support === 0) isolated++;
  });
  return isolated;
}

function countThreatenedPieces() {
  let threatened = 0;
  document.querySelectorAll(".black-piece").forEach(piece => {
    const row = parseInt(piece.dataset.row);
    const col = parseInt(piece.dataset.col);
    if (enhancedAI.willBeUnderThreat(row, col, piece)) {
      threatened++;
    }
  });
  return threatened;
}

function countTotalThreats() {
  let total = 0;
  document.querySelectorAll(".black-piece").forEach(piece => {
    const row = parseInt(piece.dataset.row);
    const col = parseInt(piece.dataset.col);
    const threats = enhancedAI.countThreatsTo(row, col, piece);
    total += threats;
  });
  return Math.min(total, 20);
}

function calculateSafetyScore() {
  const threatened = countThreatenedPieces();
  const total = document.querySelectorAll(".black-piece").length;
  return total === 0 ? 0 : ((total - threatened) / total) * 100;
}

function evaluateBackRankStrength() {
  let count = 0;
  for (let c = 0; c < BOARD_SIZE; c++) {
    for (let r = 8; r < BOARD_SIZE; r++) {
      const piece = enhancedAI.getPieceAt(r, c);
      if (piece && piece.dataset.color === "black") count++;
    }
  }
  return count;
}

function analyzeGameDefense() {
  if (!defensiveMetrics || defensiveMetrics.snapshots.length === 0) return;
  const snaps = defensiveMetrics.snapshots;
  const avgHealth = snaps.reduce((a, b) => a + b.defensiveHealth, 0) / snaps.length;
  const minHealth = Math.min(...snaps.map(s => s.defensiveHealth));
  const maxHealth = Math.max(...snaps.map(s => s.defensiveHealth));
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
      showMessage("[ALERT] CAPTURE REQUIRED!", "warning");
    } else {
      showMessage(""); // Clear message if no capture is required
    }
  }
}

async function makeAIMove() {
  if (gameOver) return;
  aiThinking = true;
  updateAIStatus(
    API_CONFIG.enabled ? "Neural Network Thinking..." : "Thinking..."
  );

  const moveStartTime = Date.now();
  try {
    // Emergency timeout for entire AI move process
    const EMERGENCY_TIMEOUT = 60000;

    let continueMoves = true;
    while (continueMoves && !gameOver) {
      if (Date.now() - moveStartTime > EMERGENCY_TIMEOUT) {
        console.warn("AI EMERGENCY TIMEOUT - Picking first available move");
        const allMoves = enhancedAI.getAllMovesForBoard(this.getCurrentBoardState(), "black");
        if (allMoves.length > 0) movePiece(allMoves[0]);
        aiThinking = false; // Reset state
        clearHighlights(); // Cleanup
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get the best move - either from API or built-in AI
      let bestMove = null;

      if (API_CONFIG.enabled) {
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
          const forcedMoves = findPossibleCaptures(fr, fc, forcedCapturePiece, []);
          if (!bestMove || (forcedMoves.length > 0 && !forcedMoves.some(m => m.toRow === bestMove.toRow && m.toCol === bestMove.toCol))) {
            if (forcedMoves.length > 0) {
              // Choose move with maximum capture count (conservative)
              let chosen = forcedMoves[0];
              try {
                const scored = forcedMoves.map((m) => ({ m, c: enhancedAI.getTotalCaptureCount(m) || 1 }));
                scored.sort((a, b) => b.c - a.c);
                chosen = scored[0].m;
              } catch (e) {}
              console.log("makeAIMove: forced-capture fallback selecting:", chosen);
              bestMove = chosen;
            } else {
              console.log("makeAIMove: forced-capture fallback found no moves for forced piece at", fr, fc);
            }
          }
        } catch (err) {
          console.log("makeAIMove: forced-capture fallback error", err);
        }
      }

      if (bestMove) {
        console.log("makeAIMove: mustContinueCapture=", mustContinueCapture, "forcedCapturePiece=", forcedCapturePiece ? (forcedCapturePiece.dataset.row + "," + forcedCapturePiece.dataset.col) : null, "currentPlayer=", currentPlayer, "bestMoveCandidate=", bestMove);
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

        // Record move metrics for periodic defense evaluation
        if (moveCount % PERIODIC_EVAL_INTERVAL === 0) {
          performPeriodicDefenseEvaluation(moveCount);
        }

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
        console.log("makeAIMove: no bestMove found; mustContinueCapture=", mustContinueCapture, "forcedCapturePiece=", forcedCapturePiece ? (forcedCapturePiece.dataset.row + "," + forcedCapturePiece.dataset.col) : null);
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
    return findPossibleCaptures(r, c, forcedCapturePiece, [], lastJumpDirection);
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
    showMessage(
      `[TARGET] You MUST capture ${maxCaptureCount} pieces!`,
      "warning"
    );
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
      const continuationLength = calculateCaptureSequenceLength(nextMove, currentDirection);
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
function findContinuationCaptures(board, row, col, piece, lastDirection = null) {
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
    if (lastDirection && dRow === -lastDirection[0] && dCol === -lastDirection[1]) {
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

function findPossibleCaptures(row, col, piece, alreadyCaptured = [], lastDir = null) {
  const moves = [];
  const isKing = piece.dataset.king === "true";
  const opponentColor = piece.dataset.color === "red" ? "black" : "red";
  const directions = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
 
  if (isKing) {
    // King multi-capture logic - pass already captured pieces AND last direction
    return enhancedAI.getKingCaptureSequences(row, col, piece, alreadyCaptured, 0, null, lastDir);
  } else {
    // Regular piece multi-capture chain generation
    // Build capture sequences step-by-step to support continuation
    function buildCaptureChains(r, c, capturedSoFar) {
      const opponentColor = piece.dataset.color === "red" ? "black" : "red";
      const directions = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];

      const availableCaptures = [];

      for (const [dRow, dCol] of directions) {
        const middleRow = r + dRow;
        const middleCol = c + dCol;
        const jumpRow = r + dRow * 2;
        const jumpCol = c + dCol * 2;

        if (
          jumpRow >= 0 &&
          jumpRow < BOARD_SIZE &&
          jumpCol >= 0 &&
          jumpCol < BOARD_SIZE
        ) {
          const middlePiece = getPieceAt(middleRow, middleCol);
          const landSquare = getPieceAt(jumpRow, jumpCol);
          const middleKey = `${middleRow},${middleCol}`;
          const alreadyCaptured = capturedSoFar.includes(middleKey);

          if (
            middlePiece &&
            middlePiece.dataset.color === opponentColor &&
            !landSquare &&
            !alreadyCaptured
          ) {
            const newCapturedList = [...capturedSoFar, middleKey];

            // Create the move for THIS capture
            const captureMove = {
              fromRow: row,
              fromCol: col,
              toRow: jumpRow,
              toCol: jumpCol,
              piece: piece,
              isCapture: true,
              capturedRow: middleRow,
              capturedCol: middleCol,
              capturedPieces: newCapturedList,
              isKingCapture: middlePiece.dataset.king === "true",
            };

            // Check if more captures are possible from the landing position
            const furtherCaptures = buildCaptureChains(
              jumpRow,
              jumpCol,
              newCapturedList
            );

            if (furtherCaptures.length > 0) {
              console.log("findPossibleCaptures: continuation from", jumpRow, jumpCol, "has", furtherCaptures.length, "continuations");
              // There are continuation captures - add current capture first, then continuations
              availableCaptures.push(captureMove);
              availableCaptures.push(...furtherCaptures);
            } else {
              // No more captures - this is a terminal move
              availableCaptures.push(captureMove);
            }
          }
        }
      }

      return availableCaptures;
    }

    // Start building chains from this piece with already captured pieces
    const allCaptures = buildCaptureChains(row, col, alreadyCaptured);
    moves.push(...allCaptures);
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

  // Analyze defensive performance
  analyzeGameDefense();

  if (winner === "Draw") {
    showMessage("Game is a Draw! (1 King vs 1 King)", "info");
    enhancedAI.recordGame("draw");
  } else {
    showMessage(`${winner} wins!`, "win");
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
  messageArea.textContent = msg;
  messageArea.className = "message-area"; // Reset classes
  if (type) {
    messageArea.classList.add(`${type}-message`);
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
    const healthValues = snapshots.map(s => s.defensiveHealth);
    avgHealth = healthValues.reduce((a, b) => a + b, 0) / healthValues.length;
    peakHealth = Math.max(...healthValues);
    lowestHealth = Math.min(...healthValues);
  }

  const checkIntervals = snapshots.length;
  const gameLengthMoves = moveCount;

  // Format the display box
  const statsBox = `╔════════════════════════════════════╗
║  DEFENSIVE PERFORMANCE SUMMARY
╠════════════════════════════════════╣
║ Average Health:    ${avgHealth.toFixed(1).padStart(5)}/100
║ Peak Health:       ${peakHealth.toFixed(0).padStart(5)}/100
║ Lowest Health:     ${lowestHealth.toFixed(0).padStart(5)}/100
║ Check Intervals:   ${checkIntervals.toString().padStart(5)}
║ Game Length:       ${gameLengthMoves.toString().padStart(5)} moves
╚════════════════════════════════════╝`;

  defenseStatsEl.textContent = statsBox;
}

// Control functions
async function resetGame() {
  // Auto-start services when new game is clicked
  // This integrates with the auto-launcher for seamless gameplay
  if (!servicesStarted && !servicesOffline) {
    // Show that we're attempting to start services
    showMessage("[AUTO-LAUNCH] Starting backend services...", "info");
    
    const started = await startServices();
    
    if (started) {
      // Services started successfully
      showMessage("[AUTO-LAUNCH] Services ready! Using neural network AI", "success");
    } else {
      // Services not available - will use local AI
      showMessage("[AUTO-LAUNCH] Using local AI (services will auto-start next game)", "info");
    }
  } else if (servicesOffline) {
    // Already in offline mode, stay there
    showMessage("[OFFLINE MODE] Playing with local AI", "info");
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
  showMessage("New game started", "info");
}

async function showAIStats() {
  const mem = enhancedAI.memory;

  let apiStats = "";
  if (API_CONFIG.enabled) {
    try {
      const resp = await apiFetch(`/api/stats`).catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        apiStats = `
        --- Neural Network Stats ---
        Training Status: ${
          data.learning_active ? "[ACTIVE] Active" : "[PAUSED] Paused"
        }
        Total Trajectories: ${data.total_trajectories || 0}
        Games in Database: ${data.total_games || 0}
        Learning Iterations: ${data.learning_iterations || 0}
        Current Loss: ${
          data.current_loss ? data.current_loss.toFixed(4) : "N/A"
        }
        Model Health: ${
          data.model_healthy ? "[OK] Healthy" : "[WARNING] Issues Detected"
        }
        `;
      }
    } catch (error) {
      apiStats = `
        --- Neural Network Stats ---
        Status: [WARNING] API Not Available
        `;
    }
  }

  const stats = `
        --- AI Performance ---
        Games Played: ${mem.games}
        Wins: ${mem.wins}
        Losses: ${mem.losses}
        Win Rate: ${(mem.games > 0 ? (mem.wins / mem.games) * 100 : 0).toFixed(
          1
        )}%

        --- Learning Data ---
        Known Positions: ${mem.positionDatabase.size}${
    mem.games === 0 ? " (play games to learn)" : ""
  }
        Winning Move Patterns: ${mem.winningMoveTypes.size}${
    mem.wins === 0 ? " (win games to learn)" : ""
  }
        Losing Move Patterns: ${mem.losingMoveTypes.size}${
    mem.losses === 0 ? " (AI learns from losses)" : ""
  }
        Experience Level: ${mem.experienceLevel || 0}
        ${apiStats}
    `;
  alert(stats);
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

// ═══════════════════════════════════════════════════════════════════
// PERIODIC DEFENSE EVALUATION FUNCTIONS - PHASE 3 IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Perform periodic defense evaluation every N moves
 * Tracks defensive health, threats, and formation integrity
 */
function performPeriodicDefenseEvaluation(moveNumber) {
  console.log(`\n🛡️ DEFENSE CHECK - Move ${moveNumber}`);
  
  // Collect metrics
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
  
  // Calculate health (0-100)
  snapshot.defensiveHealth = 
    (snapshot.formationScore * 0.30) +
    (Math.max(0, 100 - snapshot.threatCount * 10) * 0.35) +
    ((snapshot.pieceCount / 12) * 100 * 0.20) +
    (Math.min(100, (snapshot.backRankStrength / 10) * 100) * 0.15);
  
  // Determine trend
  if (defensiveMetrics.snapshots.length > 0) {
    const prev = defensiveMetrics.snapshots[defensiveMetrics.snapshots.length - 1];
    const delta = snapshot.defensiveHealth - prev.defensiveHealth;
    snapshot.trend = delta > 5 ? "improving" : delta < -5 ? "declining" : "stable";
  } else {
    snapshot.trend = "stable";
  }
  
  // Determine risk
  if (snapshot.defensiveHealth >= 80) snapshot.riskLevel = "low";
  else if (snapshot.defensiveHealth >= 60) snapshot.riskLevel = "medium";
  else if (snapshot.defensiveHealth >= 40) snapshot.riskLevel = "high";
  else snapshot.riskLevel = "critical";
  
  // Store snapshot
  defensiveMetrics.snapshots.push(snapshot);
  
  // Update state
  defensiveState.currentHealth = snapshot.defensiveHealth;
  defensiveState.threatLevel = snapshot.riskLevel;
  defensiveState.healthTrend = snapshot.trend;
  defensiveState.lastCheckMove = moveNumber;
  defensiveState.nextCheckMove = moveNumber + PERIODIC_EVAL_INTERVAL;
  
  // Log
  const bar = "█".repeat(Math.round(snapshot.defensiveHealth / 10)) + 
              "░".repeat(10 - Math.round(snapshot.defensiveHealth / 10));
  
  console.log(`Health: ${snapshot.defensiveHealth.toFixed(0)}/100 [${bar}]`);
  console.log(`Threat: ${snapshot.riskLevel} | Formation: ${snapshot.formationScore.toFixed(0)} | Pieces: ${snapshot.pieceCount}`);
  
  // Alert if critical
  if (snapshot.riskLevel === "critical") {
    console.log(`⚠️ CRITICAL: Defense failing! Health: ${snapshot.defensiveHealth.toFixed(0)}`);
    if (snapshot.threatCount >= 5) {
      console.log(`   → ${snapshot.threatCount} pieces under threat`);
    }
  }
}

/**
 * Count defensive gaps in formation
 */
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

/**
 * Count isolated pieces (no adjacent support)
 */
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

/**
 * Count pieces under threat
 */
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

/**
 * Count total threats to all pieces
 */
function countTotalThreats() {
  let total = 0;
  document.querySelectorAll(".black-piece").forEach(piece => {
    const row = parseInt(piece.dataset.row);
    const col = parseInt(piece.dataset.col);
    // Count threats to this piece (simplified)
    const threats = enhancedAI.countThreatsTo(row, col, piece);
    total += threats;
  });
  return Math.min(total, 20); // Cap at 20 for scoring purposes
}

/**
 * Calculate safety score (% of pieces safe)
 */
function calculateSafetyScore() {
  const threatened = countThreatenedPieces();
  const total = document.querySelectorAll(".black-piece").length;
  return total === 0 ? 0 : ((total - threatened) / total) * 100;
}

/**
 * Evaluate back rank strength
 */
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

/**
 * End-of-game analysis
 */
function analyzeGameDefense() {
  if (!defensiveMetrics || defensiveMetrics.snapshots.length === 0) return;
  
  const snaps = defensiveMetrics.snapshots;
  const avgHealth = snaps.reduce((a, b) => a + b.defensiveHealth, 0) / snaps.length;
  const minHealth = Math.min(...snaps.map(s => s.defensiveHealth));
  const maxHealth = Math.max(...snaps.map(s => s.defensiveHealth)); 
}

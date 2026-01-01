# AI Multi-Capture Learning Guide

## How the AI Learns to Create Multi-Capture Chains

### Overview

The AI uses a combination of **reinforcement learning** (neural network) and **heuristic evaluation** to learn and execute multi-capture strategies. This guide explains how both systems work together.

---

## 🧠 Neural Network Learning (Backend - Python)

### Enhanced Reward Structure (v2.0)

The AI now learns through a **6-tier hierarchical reward system**:

#### **Terminal Rewards** (Game End)

- **Win**: +1.0
- **Loss**: -1.0
- **Draw**: 0.0

#### **Tier 1: Material & Captures**

- **Multi-Capture Bonus** (Quadratic Scaling):
  - 2 pieces captured: +0.4 + 0.05 = +0.45
  - 3 pieces captured: +0.6 + 0.20 = +0.80
  - 4 pieces captured: +0.8 + 0.45 = +1.25 (capped at 1.0)
  - Formula: `0.2 × captures + 0.05 × (captures-1)²`

- **Single Capture Bonus**: +0.08

#### **Tier 2: Positional Strength**

- **Gap Closure**: +0.03 per gap filled in formation
- **Formation Cohesion**: +0.04 per cohesion improvement
- **Piece Support**: +0.02 per newly supported piece

#### **Tier 3: King-Specific Rewards**

- **King Promotion**: +0.12 × endgame_multiplier
  - Endgame multiplier = 1.0 + (1.0 / total_pieces)
  - More valuable in endgame positions

- **King Safety**: -0.15 per newly threatened king
- **King Loss Penalty**: -0.25 per king lost

#### **Tier 4: Defensive Excellence**

- **Isolation Penalty**: -0.05 per newly isolated piece
- **Back Rank Violation**: -0.20 for premature back rank abandonment

#### **Tier 5: Tempo & Initiative**

- **Opponent Mobility Reduction**: +0.01 per move restricted

#### **Tier 6: Strategic Depth (Phase-Aware)**

- **Opening Phase** (15+ pieces): +0.02 per back rank piece maintained
- **Endgame Phase** (<8 pieces): +0.03 per active king

### Why This Works

1. **Rich Learning Signals**: AI receives feedback on 15+ different strategic concepts
2. **Hierarchical Understanding**: Learns both tactics (captures) and strategy (formation)
3. **Association**: The neural network learns to associate board patterns that lead to multi-captures with positive outcomes

### Learning Process

```text
Game Loop:
  1. AI sees board state → Neural network suggests moves
  2. AI executes move (e.g., 3-piece capture)
  3. AI receives +0.45 reward immediately
  4. Game continues...
  5. Game ends → Final reward (+1.0 for win, -1.0 for loss)

After Game:
  6. All moves and rewards stored in replay buffer
  7. Learning worker trains neural network on experiences
  8. Network learns: "Multi-captures often lead to wins"
```

---

## 🎯 Heuristic Evaluation (Frontend - JavaScript)

### Multi-Capture Detection

The `calculateCapturePotential()` method recursively simulates all possible capture continuations:

```javascript
Move: Piece at (3,4) captures at (5,6)
  → Check: Can it capture again from (5,6)?
    → Yes! Can capture at (7,8)
      → Check: Can it capture again from (7,8)?
        → No more captures

Result: Total capture potential = 2
```

### Tactical Scoring Bonuses

#### **Multi-Capture Bonuses**

- **Base multi-capture bonus**: `1000 × (captures - 1)`

  - 2 captures: +1000 points
  - 3 captures: +2000 points
  - 4 captures: +3000 points

- **Chain length bonuses** (NEW!):
  - 3+ captures: +300 bonus
  - 4+ captures: +500 additional bonus

#### **Multi-Capture Setup Detection** (NEW)

- Detects if a move creates opportunities for other pieces to multi-capture
- **Setup bonus**: `100 × (potential - 1)` per created opportunity
- **Continuation bonus**: `50 × potential` for follow-up captures

#### **Example**

```text
Move captures 3 pieces:
  Base tactical score: +1000 (first capture)
  Multi-capture bonus: +1000 × 2 = +2000
  Chain bonus (3+): +300
  Chain bonus (4+): +0 (only 3)
  Total: +3300 points

Plus if it sets up a 2-capture for another piece:
  Setup bonus: +100 × 1 = +100

Grand Total: +3400 points
```

---

## 🔄 How Multi-Capture Learning Evolves

### Phase 1: Random Exploration

- AI makes random moves (10% exploration rate)
- Occasionally executes multi-captures by chance
- Gets positive reward → starts associating patterns

### Phase 2: Pattern Recognition

- Neural network notices: "When I capture multiple pieces, I get +0.45"
- Starts preferring moves with capture opportunities
- Heuristic evaluation heavily scores multi-capture potential

### Phase 3: Strategic Setup

- NEW: `evaluateMultiCaptureSetup()` detects setup moves
- AI learns to position pieces to CREATE multi-capture opportunities
- Example: "If I move here, my other piece can capture 3 next turn"

### Phase 4: Mastery

- AI recognizes complex board patterns
- Plans 2-3 moves ahead to set up multi-captures
- Executes optimal capture sequences automatically

---

## 📊 Key Enhancements Made

### 1. **Intermediate Rewards** (`api/ai.py`)

```python
pieces_captured = pieces_before - pieces_after
if pieces_captured > 1:
    reward += 0.15 * pieces_captured  # Multi-capture bonus
```

**Impact**: AI gets immediate positive feedback for multi-captures instead of waiting until game end.

### 2. **Chain Length Bonuses** (`script.js`)

```javascript
if (captureCount >= 3) {
  tacticalScore += 300; // Bonus for 3+ chains
}
if (captureCount >= 4) {
  tacticalScore += 500; // Additional for 4+ chains
}
```

**Impact**: Encourages AI to execute longer chains, not just any multi-capture.

### 3. **Multi-Capture Setup Detection** (`script.js`)

```javascript
evaluateMultiCaptureSetup(move) {
  // Check if move creates opportunities for OTHER pieces
  // Check if moved piece has follow-up multi-captures
  return setupValue;
}
```

**Impact**: AI learns to CREATE multi-capture opportunities, not just execute them.

---

## 🎓 Training Tips

### To Accelerate Multi-Capture Learning

1. **Play games where multi-captures are possible**

   - The more the AI encounters multi-capture situations, the faster it learns

2. **Let the AI play against itself**

   - Self-play creates diverse multi-capture scenarios

3. **Check the replay buffer**

   - Verify multi-capture games are being stored and learned from

4. **Monitor reward signals**

   - Check console logs for "+0.45" rewards during multi-captures

5. **Increase exploration rate temporarily**
   - Higher exploration = more multi-capture discoveries
   - Change in `api/ai.py`: `epsilon = 0.2` (from 0.1)

---

## 🔍 Debugging Multi-Capture Learning

### Check if AI is detecting multi-captures

1. Open browser console during AI's turn
2. Look for `calculateCapturePotential` calls
3. Check tactical scores - should see +1000+ for multi-captures

### Check if AI is learning from multi-captures

1. Check backend logs for reward calculations
2. Look for rewards like "+0.45" when pieces_captured > 1
3. Verify replay buffer contains these experiences

### If AI isn't learning multi-captures

- **Problem**: Not encountering enough multi-capture situations
  - **Solution**: Create training scenarios with multi-capture setups
- **Problem**: Reward signal too weak
  - **Solution**: Increase multi-capture reward multiplier in `ai.py`
- **Problem**: Heuristic AI blocking neural network learning
  - **Solution**: Reduce heuristic influence, increase neural network weight

---

## 📈 Expected Learning Curve

- **Games 1-100**: Random with occasional multi-captures (luck)
- **Games 100-500**: Recognizes multi-capture opportunities when present
- **Games 500-1000**: Starts positioning pieces to create multi-captures
- **Games 1000+**: Consistently executes and sets up multi-capture chains

---

## 🚀 Advanced: Curriculum Learning

To accelerate learning, create a training curriculum:

1. **Stage 1**: Positions with obvious 2-piece captures
2. **Stage 2**: Positions requiring 3-piece capture sequences
3. **Stage 3**: Positions where AI must SET UP multi-captures
4. **Stage 4**: Full games with multi-capture opportunities

This structured approach helps the AI learn progressively from simple to complex multi-capture patterns.

---

## Summary

The AI learns multi-capture chains through:

1. ✅ **Immediate rewards** for executing multi-captures (+0.15 per piece)
2. ✅ **Tactical bonuses** that heavily favor multi-captures (+1000s of points)
3. ✅ **Setup detection** that rewards creating future multi-capture opportunities
4. ✅ **Neural network learning** that associates multi-capture patterns with wins
5. ✅ **Chain length incentives** that encourage longer capture sequences

The combination of these mechanisms creates a strong learning signal that guides the AI toward mastering multi-capture strategy over time.

# Checker Game Rules

## Game Overview
This is a **10x10 International Checkers** (also known as Draughts) implementation with AI opponents using MCTS, Minimax, and Neural Network algorithms.

## Board Setup

### Initial Configuration
- **Board Size:** 10×10 grid
- **Playing Surface:** Pieces occupy only dark/colored squares (50 squares total)
- **Piece Placement:** 
  - Red pieces: 10 on top rows (rows 0-2)
  - Black pieces: 10 on bottom rows (rows 7-9)
  - Empty middle rows (3-6)

### Piece Types
1. **Regular Pieces:** Standard pieces with limited movement
2. **Kings:** Promoted pieces with enhanced movement (earned by reaching promotion line)

---

## Movement Rules

### Regular Piece Movement
- **Direction:** Forward only (toward opponent's side)
- **Distance:** One dark square diagonally forward
- **No Jumping:** Cannot jump over pieces in normal movement
- **Capture Exception:** Can move backward when capturing

### King Movement
- **Direction:** Any diagonal direction (forward or backward)
- **Distance:** Any number of empty dark squares in a diagonal line
- **Jumping:** Can jump over opponent pieces during captures (like regular pieces)

---

## Capture Rules

### Mandatory Captures
- **If available:** Player MUST capture opponent pieces
- **Skip if not available:** If no captures possible, must make a regular move
- **Consequences:** Illegal non-capture moves when captures are available result in piece removal (huff rule)

### Single Capture
- Move diagonally to jump over an adjacent opponent piece
- Land on the dark square immediately after that piece
- Remove the captured piece from the board
- Turn **MAY continue** if further captures are available

### Multi-Capture Sequences
- **Continuation:** After a capture, if the piece can capture another opponent piece, it **MUST** do so
- **Direction:** Can change direction between captures (forward or backward)
- **Chain:** Continue capturing until no more captures are available
- **Promotion Delay:** If piece reaches promotion line during sequence, **promotion is DELAYED** until sequence ends
- **Turn Ends:** When no more captures are available, the turn ends

### Capture Restrictions for Kings
- Kings follow the same capture rules as regular pieces
- Kings have extended diagonal reach (any distance, not just adjacent squares)
- Multi-capture sequences apply to kings as well.
### changing direction while Capture, Restrictions for Kings
- Kings long range capture, if the king has multicapture and has pieces to capture in both directions (left and right), and the player choose any direction(let's say left) it's turn finish once he capture the piece, he doesn't comeback to the opposite direction for the piece left behind in the same turn, have to wait for the next turn to comeback to the opposite direction
---

## Promotion Rules

### How to Promote
A regular piece **promotes to a King** when it reaches the opponent's back row:
- **Red pieces** promote at **Row 0** (top of board)
- **Black pieces** promote at **Row 9** (bottom of board)

### Promotion During Capture Sequence
**Scenario:** Piece captures multiple opponents in a sequence and passes through the promotion line

**Rule:** 
- Promotion is **DELAYED** while the piece continues capturing
- Only after all captures in the sequence are complete does promotion occur
- This allows pieces to complete their mandatory capture obligations first

**Example:**
- Red piece on row 1 captures black piece, moving to row 0 (promotion line)
- After landing at row 0, if further captures are available, piece continues without promoting yet
- After the final capture in the sequence, piece finally promotes to King
- Turn ends immediately after promotion

### Promotion Ends Turn
**Scenario:** Piece lands on promotion line (via normal move or final capture in sequence)

**Rule:**
- Piece immediately promotes to King
- Turn **ENDS** regardless of captures available
- Newly-promoted King cannot continue capturing in the same turn
- Even if the new King has capture opportunities available, those must wait until the next turn

**Example:**
- Red piece captures through the board and lands on row 0
- Piece automatically promotes to King
- Turn ends immediately
- Black player gets next turn
- On Red's next turn, the King (now in its promoted status) can make moves/captures

---

## Turn Structure

### Turn Sequence
1. **Player's Turn Begins**
2. **Check for Mandatory Captures**
   - If captures available, must select capturing piece
   - Cannot make non-capture moves
3. **Make Move or Capture**
   - Single move (if no captures), OR
   - First capture in sequence
4. **Check for Continuation**
   - If more captures available with same piece, continue (forced)
   - If piece landed on promotion line and sequence is complete, promote and end turn
5. **Turn Ends**
   - Opponent gets next turn
   - Promotion check occurs (if applicable)

### Turn Ending Conditions
- No more captures available after a capture move
- Piece reaches promotion line (automatic turn end)
- Regular non-capture move is made (when no captures required)

---

## Winning Conditions

### Victory by Elimination
- **Opponent has no pieces:** Immediate win
- **Opponent cannot move:** Immediate win (blocked or no pieces)

### Victory by Forced Loss
- **Forced Piece Loss:** Capturing all opponent pieces
- **Immobilization:** Opponent's remaining pieces cannot make legal moves

---

## Special Rules

### Capture Availability Check
- **AI System:** Automatically enforces mandatory captures
- **Move Validation:** Only legal moves are highlighted and selectable
- **Illegal Moves:** Cannot be executed even if selected

### King Behavior
- Kings can move/capture in all diagonal directions
- Kings have extended range (any number of empty squares)
- Kings still cannot jump over allies
- Kings cannot capture allies

### Draw Conditions
- **Game Design:** Currently implements standard checkers (no draw conditions in this version)

---

## Game States

### Active Game
- Players alternate turns
- Mandatory captures are enforced
- Valid moves are highlighted
- Promotion occurs automatically

### Game End
- One player has no pieces
- One player cannot make legal moves
- Victory declared for opposing player

---

## AI Opponent Behavior

### AI Decision Making
The AI uses a hybrid approach:
1. **MCTS (Monte Carlo Tree Search):** Explores move possibilities
2. **Minimax Algorithm:** Evaluates position strength
3. **Neural Network:** Evaluates board positions

### Defense Monitoring
The AI includes periodic defense evaluation:
- Checks formation strength every 5 moves
- Monitors threats to pieces
- Adjusts strategy based on board state
- Predicts opponent threats

### AI Optimization
- **Early Move Rejection:** AI avoids obviously bad moves
- **Formation State Caching:** Speeds up position evaluation
- **Threat Assessment:** Unified threat evaluation system
- **Weighted Decisions:** Combines material value, position, and safety

---

## Implementation Notes

### Board Coordinates
- **Row 0:** Red's promotion line (top)
- **Row 9:** Black's promotion line (bottom)
- **Rows 3-6:** Starting empty zones
- **Dark Squares Only:** Pieces move exclusively on dark colored squares

### Piece Representation
- **Regular Pieces:** Standard colored circles
- **Kings:** Same color with "King" designation/crown symbol
- **Captured Pieces:** Removed from board instantly

### Move Notation
Moves are recorded with:
- From position (row, column)
- To position (row, column)
- Captured pieces (if capture)
- Whether it's a king move
- Whether piece was already a king before move

---

## Quick Reference

| Aspect | Red | Black |
|--------|-----|-------|
| **Starting Position** | Rows 0-2 (top) | Rows 7-9 (bottom) |
| **Promotion Line** | Row 0 (top) | Row 9 (bottom) |
| **Movement Direction** | Downward/upward diagonal | Downward/upward diagonal |
| **King Direction** | Any diagonal | Any diagonal |

---

## Frequently Asked Questions

### Q: Can a piece be promoted multiple times?
**A:** No. Once promoted to King, a piece remains a King for the rest of the game.

### Q: What if a King reaches the opposite promotion line?
**A:** Kings cannot be promoted again (they're already kings). The promotion line rule only applies to regular pieces on their first reach.

### Q: Can a player decline a capture?
**A:** No. Captures are mandatory if available. The game will not allow non-capture moves when captures are possible.

### Q: What happens if a piece can capture in multiple directions?
**A:** Player can choose which capture to make. However, once a capture is made, if continuation captures are available, the player must continue (no choice on that piece).

### Q: Can a King move backwards?
**A:** Yes. Kings can move and capture in all diagonal directions (forward and backward).

### Q: Is a game ever a draw?
**A:** In this implementation, games continue until one player loses. Standard draw rules (like move limits) are not currently implemented.
### Q: Can a King lands between two opponent pieces?
**A:** yes, a king can land between two opponent pieces, but it can't capture,both in the same turn, he first capture the piece, the turns end, and then he can make the other capture in the opposite direction in the next turn.
---

*Last Updated: December 30, 2025*
*Version: 1.0 - Based on 10x10 International Checkers*

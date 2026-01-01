from model.network import PolicyValueNet
from model.encoder import encode_state, decode_move, encode_move
from model.replay_buffer import ReplayBuffer
import torch
import numpy as np
import os
import json

MODEL_VERSION = "v0.001"
replay_buffer = ReplayBuffer()

# CRITICAL: Use learner's live model for inference to prevent race conditions
# The live model is read-only and synced from the training model
learner = None  # Will be set by learning worker
model = PolicyValueNet()  # Fallback model if learner not available

# Load model if checkpoint exists
MODEL_PATH = "checkpoints/model.pth"
if os.path.exists(MODEL_PATH):
    try:
        checkpoint = torch.load(MODEL_PATH, weights_only=False)
        try:
            model.load_state_dict(checkpoint['model_state_dict'])
            MODEL_VERSION = f"v{checkpoint.get('training_steps', 0)}"
            print(f"Loaded model checkpoint: {MODEL_VERSION}")
        except Exception as load_error:
            # Likely action-space mismatch (old checkpoints used 400 actions; new uses 2500).
            print(f"WARNING: Could not load checkpoint weights into current model: {load_error}")
            print("Starting with fresh model (untrained, action-space v2).")
            MODEL_VERSION = "v2-untrained"
        model.eval()
    except Exception as e:
        print(f"Error loading model: {e}")
        print("Using untrained model")
else:
    print("No checkpoint found. Using untrained model")


def set_learner(learner_instance):
    """Set the learner instance to use its live model for inference."""
    global learner
    learner = learner_instance
    print("[LEARNER] Connected - using live model for inference")


def get_inference_model():
    """Get the model to use for inference (live model if available)."""
    if learner is not None:
        return learner.get_live_model()
    return model


def parse_move_string(move_str: str):
    """
    Parse move string like "3,4->4,5" into coordinates.
    
    Args:
        move_str: Move in format "fromRow,fromCol->toRow,toCol"
        
    Returns:
        Tuple of (from_row, from_col, to_row, to_col)
    """
    parts = move_str.split("->")
    from_parts = parts[0].split(",")
    to_parts = parts[1].split(",")
    
    return (
        int(from_parts[0]),
        int(from_parts[1]),
        int(to_parts[0]),
        int(to_parts[1])
    )


def infer_move(req):
    """
    Use neural network to select the best move.
    
    Args:
        req: MoveRequest containing board_state and legal_moves
        
    Returns:
        Tuple of (selected_move, model_version)
    """
    # Encode the board state
    state = encode_state(req.board_state)
    state_tensor = torch.tensor(state, dtype=torch.float32).unsqueeze(0)
    
    # Encode legal moves.
    # NOTE: Multiple different moves can collapse to the same action index
    # (e.g., flying kings: same from-square + direction, different landing squares).
    encoded_moves: list[tuple[str, int]] = []
    for move_str in req.legal_moves:
        from_row, from_col, to_row, to_col = parse_move_string(move_str)
        move_idx = encode_move(from_row, from_col, to_row, to_col)
        if move_idx >= 0:
            encoded_moves.append((move_str, move_idx))

    if not encoded_moves:
        # Fallback: return first legal move if encoding fails
        print("Warning: No valid move encodings, using fallback")
        return req.legal_moves[0], MODEL_VERSION

    # Unique indices for masking / scoring.
    legal_move_indices = sorted({idx for _, idx in encoded_moves})
    
    # CRITICAL: Use live model for inference (never the training model)
    inference_model = get_inference_model()
    
    # Get action probabilities from model
    with torch.no_grad():
        policy, value = inference_model(state_tensor)
        
        # Mask illegal moves
        mask = torch.zeros_like(policy)
        mask[0, legal_move_indices] = 1.0
        masked_policy = policy * mask
        
        # Renormalize
        masked_policy = masked_policy / (masked_policy.sum() + 1e-8)
        
        # Add some exploration (10% random moves during learning)
        if np.random.random() < 0.1 and len(encoded_moves) > 1:
            selected_move, _ = encoded_moves[np.random.randint(0, len(encoded_moves))]
            return selected_move, MODEL_VERSION

        # Select action index with highest probability
        best_move_idx = legal_move_indices[masked_policy[0, legal_move_indices].argmax().item()]

        # If multiple moves share this index, pick the first matching move
        # in the original request order (stable + always legal).
        selected_move = None
        for move_str, idx in encoded_moves:
            if idx == best_move_idx:
                selected_move = move_str
                break

        if selected_move is None:
            selected_move = req.legal_moves[0]
            print(f"Warning: Could not map best move index {best_move_idx} to a move, using fallback")
    
    return selected_move, MODEL_VERSION


def _normalize_board(board):
    if isinstance(board, str):
        try:
            return json.loads(board)
        except Exception:
            return board
    return board


def _count_pieces(board):
    """Count pieces/kings from the frontend board representation."""
    board = _normalize_board(board)
    counts = {
        "total": 0,
        "kings_total": 0,
        "red_total": 0,
        "red_kings": 0,
        "black_total": 0,
        "black_kings": 0,
    }

    if not isinstance(board, list):
        return counts

    for row in board:
        if not isinstance(row, list):
            continue
        for cell in row:
            if cell is None:
                continue
            if not isinstance(cell, dict):
                # Unknown encoding; count as a piece to avoid crashing.
                counts["total"] += 1
                continue

            counts["total"] += 1
            color = cell.get("color")
            is_king = bool(cell.get("king", False))
            if is_king:
                counts["kings_total"] += 1

            if color == "red":
                counts["red_total"] += 1
                if is_king:
                    counts["red_kings"] += 1
            elif color == "black":
                counts["black_total"] += 1
                if is_king:
                    counts["black_kings"] += 1

    return counts


def _evaluate_gap_closure(board_before, board_after, color):
    """Evaluate improvement in gap closure (fewer gaps in formation)."""
    def count_gaps(board, color):
        gaps = 0
        board = _normalize_board(board)
        if not isinstance(board, list):
            return 0
        
        for row in range(len(board) - 1):
            for col in range(len(board[0])):
                if not isinstance(board[row], list):
                    continue
                # Check if there's a piece at this row and a gap followed by piece
                if (board[row][col] and isinstance(board[row][col], dict) and 
                    board[row][col].get("color") == color):
                    # Check adjacent forward positions for gaps
                    if row + 1 < len(board) and col + 1 < len(board[0]):
                        if board[row + 1][col + 1] is None:
                            gaps += 1
                    if row + 1 < len(board) and col - 1 >= 0:
                        if board[row + 1][col - 1] is None:
                            gaps += 1
        return gaps
    
    gaps_before = count_gaps(board_before, color)
    gaps_after = count_gaps(board_after, color)
    return gaps_before - gaps_after  # Positive if gaps decreased


def _evaluate_cohesion(board, color):
    """Evaluate how connected pieces are (more connected = better)."""
    board = _normalize_board(board)
    if not isinstance(board, list):
        return 0
    
    connected_count = 0
    total_pieces = 0
    
    for row in range(len(board)):
        for col in range(len(board[0])):
            if not isinstance(board[row], list):
                continue
            if (board[row][col] and isinstance(board[row][col], dict) and 
                board[row][col].get("color") == color):
                total_pieces += 1
                # Check if any adjacent diagonal has same color
                has_neighbor = False
                for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < len(board) and 0 <= nc < len(board[0]):
                        if isinstance(board[nr], list) and board[nr][nc]:
                            if isinstance(board[nr][nc], dict) and board[nr][nc].get("color") == color:
                                has_neighbor = True
                                break
                if has_neighbor:
                    connected_count += 1
    
    return connected_count / max(total_pieces, 1)


def _count_supported_pieces(board, color):
    """Count pieces that have at least one friendly neighbor."""
    board = _normalize_board(board)
    if not isinstance(board, list):
        return 0
    
    supported = 0
    for row in range(len(board)):
        for col in range(len(board[0])):
            if not isinstance(board[row], list):
                continue
            if (board[row][col] and isinstance(board[row][col], dict) and 
                board[row][col].get("color") == color):
                # Check diagonals
                for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < len(board) and 0 <= nc < len(board[0]):
                        if isinstance(board[nr], list) and board[nr][nc]:
                            if isinstance(board[nr][nc], dict) and board[nr][nc].get("color") == color:
                                supported += 1
                                break
    return supported


def _count_threatened_kings(board, color):
    """Count how many kings are under threat."""
    board = _normalize_board(board)
    if not isinstance(board, list):
        return 0
    
    threatened = 0
    opponent_color = "red" if color == "black" else "black"
    
    for row in range(len(board)):
        for col in range(len(board[0])):
            if not isinstance(board[row], list):
                continue
            if (board[row][col] and isinstance(board[row][col], dict) and 
                board[row][col].get("color") == color and 
                board[row][col].get("king", False)):
                # Check if any opponent piece can capture it
                for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                    attacker_r, attacker_c = row - dr, col - dc
                    landing_r, landing_c = row + dr, col + dc
                    if (0 <= attacker_r < len(board) and 0 <= attacker_c < len(board[0]) and
                        0 <= landing_r < len(board) and 0 <= landing_c < len(board[0])):
                        if isinstance(board[attacker_r], list) and board[attacker_r][attacker_c]:
                            if (isinstance(board[attacker_r][attacker_c], dict) and 
                                board[attacker_r][attacker_c].get("color") == opponent_color):
                                if isinstance(board[landing_r], list) and board[landing_r][landing_c] is None:
                                    threatened += 1
                                    break
    return threatened


def _count_isolated_pieces(board, color):
    """Count pieces with no friendly neighbors."""
    board = _normalize_board(board)
    if not isinstance(board, list):
        return 0
    
    isolated = 0
    for row in range(len(board)):
        for col in range(len(board[0])):
            if not isinstance(board[row], list):
                continue
            if (board[row][col] and isinstance(board[row][col], dict) and 
                board[row][col].get("color") == color):
                has_neighbor = False
                for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < len(board) and 0 <= nc < len(board[0]):
                        if isinstance(board[nr], list) and board[nr][nc]:
                            if isinstance(board[nr][nc], dict) and board[nr][nc].get("color") == color:
                                has_neighbor = True
                                break
                if not has_neighbor:
                    isolated += 1
    return isolated


def _violated_back_rank(board, color):
    """Check if back rank has been violated (pieces moved out prematurely)."""
    board = _normalize_board(board)
    if not isinstance(board, list) or len(board) == 0:
        return False
    
    back_rank = 0 if color == "black" else len(board) - 1
    if not isinstance(board[back_rank], list):
        return False
    
    # Count pieces in back rank
    back_rank_count = 0
    for col in range(len(board[back_rank])):
        if (board[back_rank][col] and isinstance(board[back_rank][col], dict) and 
            board[back_rank][col].get("color") == color):
            back_rank_count += 1
    
    # Violation if fewer than 3 pieces in back rank early game
    return back_rank_count < 3


def _estimate_mobility(board, color):
    """Estimate number of possible moves for a color (simplified)."""
    board = _normalize_board(board)
    if not isinstance(board, list):
        return 0
    
    mobility = 0
    for row in range(len(board)):
        for col in range(len(board[0])):
            if not isinstance(board[row], list):
                continue
            if (board[row][col] and isinstance(board[row][col], dict) and 
                board[row][col].get("color") == color):
                # Count potential moves (simplified)
                is_king = board[row][col].get("king", False)
                directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)] if is_king else ([(-1, -1), (-1, 1)] if color == "black" else [(1, -1), (1, 1)])
                for dr, dc in directions:
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < len(board) and 0 <= nc < len(board[0]):
                        if isinstance(board[nr], list) and board[nr][nc] is None:
                            mobility += 1
    return mobility


def _determine_phase(total_pieces):
    """Determine game phase based on piece count."""
    if total_pieces >= 15:
        return "opening"
    elif total_pieces >= 8:
        return "midgame"
    else:
        return "endgame"


def _count_back_rank_pieces(board, color):
    """Count pieces in back rank."""
    board = _normalize_board(board)
    if not isinstance(board, list) or len(board) == 0:
        return 0
    
    back_rank = 0 if color == "black" else len(board) - 1
    if not isinstance(board[back_rank], list):
        return 0
    
    count = 0
    for col in range(len(board[back_rank])):
        if (board[back_rank][col] and isinstance(board[back_rank][col], dict) and 
            board[back_rank][col].get("color") == color):
            count += 1
    return count


def _count_active_kings(board, color):
    """Count kings that are actively positioned (not stuck in corners)."""
    board = _normalize_board(board)
    if not isinstance(board, list):
        return 0
    
    active = 0
    for row in range(len(board)):
        for col in range(len(board[0])):
            if not isinstance(board[row], list):
                continue
            if (board[row][col] and isinstance(board[row][col], dict) and 
                board[row][col].get("color") == color and 
                board[row][col].get("king", False)):
                # Active if not in corner or edge
                if 1 < row < len(board) - 2 and 1 < col < len(board[0]) - 2:
                    active += 1
    return active


def calculate_reward(board_before, board_after, action, is_terminal, winner):
    """
    ENHANCED HIERARCHICAL REWARD STRUCTURE
    
    Implements 6-tier reward system aligned with strategic AI goals:
    - Tier 1: Material & Captures
    - Tier 2: Positional Strength (gap closure, cohesion, support)
    - Tier 3: King-Specific Rewards
    - Tier 4: Defensive Excellence
    - Tier 5: Tempo & Initiative
    - Tier 6: Strategic Depth (phase-aware)
    
    Args:
        board_before: Board state before move
        board_after: Board state after move
        action: Action taken
        is_terminal: Whether this is the final move
        winner: Game winner (if terminal)
        
    Returns:
        Calculated reward value (clipped to [-1.0, 1.0])
    """
    # Terminal rewards (only at game end)
    if is_terminal:
        if winner == "ai":
            return 1.0  # Win
        elif winner == "human":
            return -1.0  # Loss
        else:
            return 0.0  # Draw
    
    # === TIER 1: MATERIAL & CAPTURES ===
    reward = 0.0
    before_counts = _count_pieces(board_before)
    after_counts = _count_pieces(board_after)
    
    # Multi-capture progressive bonus (quadratic scaling)
    pieces_captured = before_counts["total"] - after_counts["total"]
    if pieces_captured > 1:
        reward += 0.2 * pieces_captured + 0.05 * (pieces_captured - 1) ** 2
    elif pieces_captured == 1:
        reward += 0.08
    
    # === TIER 2: POSITIONAL STRENGTH ===
    # Gap closure reward
    gap_improvement = _evaluate_gap_closure(board_before, board_after, "black")
    reward += 0.03 * gap_improvement
    
    # Formation cohesion
    cohesion_delta = _evaluate_cohesion(board_after, "black") - _evaluate_cohesion(board_before, "black")
    reward += 0.04 * cohesion_delta
    
    # Piece support (connected pieces)
    support_delta = _count_supported_pieces(board_after, "black") - _count_supported_pieces(board_before, "black")
    reward += 0.02 * support_delta
    
    # === TIER 3: KING-SPECIFIC REWARDS ===
    # King promotion (progressive - more valuable in endgame)
    if after_counts["black_kings"] > before_counts["black_kings"]:
        total_pieces = after_counts["total"]
        endgame_multiplier = 1.0 + (1.0 / max(total_pieces, 5))
        reward += 0.12 * endgame_multiplier
    
    # King safety (penalize exposed kings)
    king_risk_before = _count_threatened_kings(board_before, "black")
    king_risk_after = _count_threatened_kings(board_after, "black")
    reward -= 0.15 * (king_risk_after - king_risk_before)
    
    # King loss penalty
    ai_kings_before = before_counts["black_kings"]
    ai_kings_after = after_counts["black_kings"]
    if ai_kings_after < ai_kings_before:
        reward -= 0.25 * (ai_kings_before - ai_kings_after)
    
    # === TIER 4: DEFENSIVE EXCELLENCE ===
    # Isolation penalty (pieces without neighbors)
    isolation_before = _count_isolated_pieces(board_before, "black")
    isolation_after = _count_isolated_pieces(board_after, "black")
    reward -= 0.05 * (isolation_after - isolation_before)
    
    # Back rank integrity
    if _violated_back_rank(board_after, "black") and not _violated_back_rank(board_before, "black"):
        reward -= 0.20
    
    # === TIER 5: TEMPO & INITIATIVE ===
    # Reward for limiting opponent mobility
    opponent_mobility_before = _estimate_mobility(board_before, "red")
    opponent_mobility_after = _estimate_mobility(board_after, "red")
    reward += 0.01 * (opponent_mobility_before - opponent_mobility_after)
    
    # === TIER 6: STRATEGIC DEPTH (PHASE-AWARE) ===
    game_phase = _determine_phase(after_counts["total"])
    
    if game_phase == "opening":
        # Reward solid setup
        back_rank_pieces = _count_back_rank_pieces(board_after, "black")
        reward += 0.02 * back_rank_pieces
    elif game_phase == "endgame":
        # Reward king activity
        active_kings = _count_active_kings(board_after, "black")
        reward += 0.03 * active_kings
    
    # Clip to prevent reward explosion
    return np.clip(reward, -1.0, 1.0)


def record_game(req):
    """
    Record a finished game to the replay buffer for learning.
    
    CRITICAL: All reward assignment happens here, not in frontend.
    
    Args:
        req: ResultRequest containing game_id, winner, and trajectory data
    """
    try:
        print(f"Recording game {req.game_id}. Winner: {req.winner}")
        
        # Validate winner value
        valid_winners = ["ai", "human", "draw"]
        if req.winner not in valid_winners:
            print(f"WARNING: Invalid winner value: {req.winner}, defaulting to 'draw'")
            req.winner = "draw"
        
        # Add game to replay buffer
        replay_buffer.add_game(
            game_id=req.game_id,
            winner=req.winner,
            total_moves=len(req.trajectory) if hasattr(req, 'trajectory') and req.trajectory else 0,
            duration_seconds=req.duration_seconds if hasattr(req, 'duration_seconds') else 0,
            player_color="black"  # AI plays as black
        )
        
        # Add trajectory if provided
        if hasattr(req, 'trajectory') and req.trajectory:
            # CRITICAL: Backend calculates ALL rewards
            # Frontend sends only states and actions
            
            print(f"Processing {len(req.trajectory)} trajectory steps")
            
            for i, step in enumerate(req.trajectory):
                try:
                    is_terminal = (i == len(req.trajectory) - 1)
                    
                    # Validate step has required fields
                    if not hasattr(step, 'board_state') or not hasattr(step, 'next_state') or not hasattr(step, 'action'):
                        print(f"WARNING: Skipping step {i}: missing required fields")
                        continue
                    
                    # Calculate reward backend-side
                    reward = calculate_reward(
                        board_before=step.board_state,
                        board_after=step.next_state,
                        action=step.action,
                        is_terminal=is_terminal,
                        winner=req.winner
                    )
                    
                    step_player = getattr(step, 'player', None) or "black"

                    replay_buffer.add_trajectory(
                        game_id=req.game_id,
                        move_number=i,
                        board_state=step.board_state,
                        action=step.action,
                        reward=reward,  # Backend-calculated reward
                        next_state=step.next_state,
                        done=is_terminal,
                        player=step_player
                    )
                except Exception as step_error:
                    print(f"WARNING: Error processing step {i}: {step_error}")
                    # Continue processing other steps
                    continue
        
        # Print buffer statistics
        stats = replay_buffer.get_stats()
        print(f"SUCCESS: Game recorded. Buffer stats: {stats}")
        
    except Exception as e:
        print(f"ERROR: Error recording game: {e}")
        import traceback
        traceback.print_exc()
        # Re-raise to let the API handler know there was an error
        raise

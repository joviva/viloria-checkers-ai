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
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()
        MODEL_VERSION = f"v{checkpoint.get('training_steps', 0)}"
        print(f"Loaded model checkpoint: {MODEL_VERSION}")
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
    
    # Get legal move indices
    legal_move_indices = []
    legal_moves_map = {}
    
    for move_str in req.legal_moves:
        from_row, from_col, to_row, to_col = parse_move_string(move_str)
        move_idx = encode_move(from_row, from_col, to_row, to_col)
        
        if move_idx >= 0:  # Valid encoding
            legal_move_indices.append(move_idx)
            legal_moves_map[move_idx] = move_str
    
    if not legal_move_indices:
        # Fallback: return first legal move if encoding fails
        print("Warning: No valid move encodings, using fallback")
        return req.legal_moves[0], MODEL_VERSION
    
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
        
        # Select move with highest probability
        best_move_idx = legal_move_indices[masked_policy[0, legal_move_indices].argmax().item()]
        
        # Add some exploration (10% random moves during learning)
        if np.random.random() < 0.1 and len(legal_move_indices) > 1:
            best_move_idx = np.random.choice(legal_move_indices)
        
        # Get the corresponding move string
        selected_move = legal_moves_map.get(best_move_idx)
        
        if selected_move is None:
            # Fallback if something went wrong
            selected_move = req.legal_moves[0]
            print(f"Warning: Move index {best_move_idx} not in legal moves map, using fallback")
    
    return selected_move, MODEL_VERSION


def calculate_reward(board_before, board_after, action, is_terminal, winner):
    """
    CRITICAL: All reward logic is backend-only.
    Frontend only sends game state, backend assigns rewards.
    
    This prevents reward manipulation and ensures consistent learning.
    
    Args:
        board_before: Board state before move
        board_after: Board state after move
        action: Action taken
        is_terminal: Whether this is the final move
        winner: Game winner (if terminal)
        
    Returns:
        Calculated reward value
    """
    # Terminal rewards (only at game end)
    if is_terminal:
        if winner == "ai":
            return 1.0  # Win
        elif winner == "human":
            return -1.0  # Loss
        else:
            return 0.0  # Draw
    
    # Non-terminal: no intermediate rewards
    # Pure RL - only final outcome matters
    return 0.0


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
                    
                    replay_buffer.add_trajectory(
                        game_id=req.game_id,
                        move_number=i,
                        board_state=step.board_state,
                        action=step.action,
                        reward=reward,  # Backend-calculated reward
                        next_state=step.next_state,
                        done=is_terminal,
                        player="black"  # AI player
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

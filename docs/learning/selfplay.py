"""
Self-Play Game Generation for AI Training.

Generates training data through AI vs AI matches to explore diverse
positions and strategies beyond what human opponents provide.
"""

import json
import random
import uuid
from datetime import datetime
import torch
import numpy as np
import os
from model.network import AdvancedPolicyValueNet
from model.encoder import encode_state, encode_move

class SelfPlayGenerator:
    """Generates self-play games for training data diversity."""
    
    def __init__(self, replay_buffer=None, model_path="checkpoints/model.pth"):
        """
        Initialize self-play generator.
        
        Args:
            replay_buffer: ReplayBuffer instance to store generated games
            model_path: Path to load trained model weight
        """
        self.replay_buffer = replay_buffer
        self.games_generated = 0
        
        # Load Model
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AdvancedPolicyValueNet().to(self.device)
        self.model.eval()
        
        if os.path.exists(model_path):
            try:
                checkpoint = torch.load(model_path, map_location=self.device)
                self.model.load_state_dict(checkpoint['model_state_dict'])
                print(f"SelfPlayGenerator loaded model from {model_path}")
            except Exception as e:
                print(f"Warning: SelfPlayGenerator could not load model: {e}")
        else:
            print("Warning: SelfPlayGenerator using untrained model (random weights)")
        
    def generate_games(self, num_games=10, max_moves=200, exploration_epsilon=0.1):
        """
        Generate self-play training games.
        
        Args:
            num_games: Number of games to generate
            max_moves: Maximum moves per game (prevents infinite games)
            exploration_epsilon: Exploration rate (lower is better for self-play quality)
            
        Returns:
            List of generated game records
        """
        games = []
        
        print(f"Generating {num_games} self-play games...")
        
        for game_num in range(num_games):
            game_record = self._play_single_game(
                game_id=f"selfplay_{uuid.uuid4().hex[:8]}",
                max_moves=max_moves,
                exploration_epsilon=exploration_epsilon
            )
            
            games.append(game_record)
            self.games_generated += 1
            
            if (game_num + 1) % 5 == 0:
                print(f"  Generated {game_num + 1}/{num_games} games")
        
        print(f"Self-play generation complete. Total games: {self.games_generated}")
        return games
    
    def _play_single_game(self, game_id, max_moves, exploration_epsilon):
        """
        Play a single self-play game.
        
        Returns:
            Game record dictionary
        """
        # Initialize board (10x10 international draughts starting position)
        board = self._initialize_board()
        game_history = []
        current_player = "black"  # AI starts (or random if desired, but std is white/black logic)
        move_count = 0
        
        # Play game
        while not self._is_game_over(board) and move_count < max_moves:
            # Get legal moves
            legal_moves = self._get_legal_moves_simple(board, current_player)
            
            if not legal_moves:
                # No legal moves - player loses
                break
            
            # Select move (Network or Exploration)
            if random.random() < exploration_epsilon:
                move = random.choice(legal_moves)
            else:
                move = self._select_move_network(board, legal_moves, current_player)
            
            # Apply move
            next_board = self._apply_move(board, move, current_player)
            
            # Record transition (only for black/AI moves, or BOTH for full self-play training?)
            # Standard is to record perspectives for the learner. 
            # Our learner assumes "black" is the learning agent.
            # But in self-play, BOTH are learning agents.
            # For simplicity, we record BLACK's moves as training data.
            if current_player == "black":
                game_history.append({
                    "board_state": self._board_to_json(board),
                    "action": move,
                    "player": current_player,
                    "next_state": self._board_to_json(next_board),
                    "move_number": len(game_history)
                })
            
            # Update state
            board = next_board
            current_player = "red" if current_player == "black" else "black"
            move_count += 1
        
        # Determine winner
        winner = self._determine_winner(board)
        
        # Store in replay buffer if available
        if self.replay_buffer and game_history:
            try:
                self.replay_buffer.add_game(
                    game_id=game_id,
                    winner=winner,
                    total_moves=len(game_history),
                    duration_seconds=0.0,  # Self-play is instant
                    player_color="black"
                )
                
                # Add trajectories (rewards will be calculated by backend)
                for step in game_history:
                    self.replay_buffer.add_trajectory(
                        game_id=game_id,
                        move_number=step["move_number"],
                        board_state=step["board_state"],
                        action=step["action"],
                        reward=0.0,  # Placeholder - backend calculates
                        next_state=step["next_state"],
                        done=(step["move_number"] == len(game_history) - 1),
                        player=step["player"]
                    )
            except Exception as e:
                print(f"Warning: Failed to store self-play game: {e}")
        
        return {
            "game_id": game_id,
            "winner": winner,
            "moves": len(game_history),
            "trajectory": game_history
        }

    def _select_move_network(self, board, legal_moves, color):
        """Select best move using the neural network."""
        try:
            # 1. Encode State
            # Note: We need to respect the perspective. 
            # The encoder expects the board and handles channel assignment.
            # We assume the model learns from "Black's perspective" typically.
            # But if Red is playing, should we flip? 
            # Current encoder handles pieces by color name.
            json_board = self._board_to_json(board)
            state_tensor = torch.tensor(encode_state(json_board), dtype=torch.float32).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                policy_logits, _ = self.model(state_tensor)
            
            # 2. Mask Legal Moves
            # Retrieve encoded indices for all legal moves
            move_candidates = []
            for move in legal_moves:
                # "from" and "to" are [row, col] lists
                idx = encode_move(
                    move["from"][0], move["from"][1],
                    move["to"][0], move["to"][1]
                )
                if idx != -1:
                    move_candidates.append((move, idx))
            
            if not move_candidates:
                return random.choice(legal_moves)
            
            # Extract probabilities for legal moves
            best_move = None
            best_prob = -1.0
            
            # Simple greedy selection from logits
            # For better play, we could use softmax distribution sampling
            policy_probs = torch.softmax(policy_logits, dim=1).cpu().numpy()[0]
            
            for move, idx in move_candidates:
                if idx < len(policy_probs):
                    prob = policy_probs[idx]
                    if prob > best_prob:
                        best_prob = prob
                        best_move = move
            
            return best_move if best_move else random.choice(legal_moves)
            
        except Exception as e:
            print(f"Error in network move selection: {e}")
            return random.choice(legal_moves)

    
    def _initialize_board(self):
        """Initialize 10x10 checkers board with starting position."""
        board = [[None for _ in range(10)] for _ in range(10)]
        
        # Place red pieces (rows 0-3)
        for row in range(4):
            for col in range(10):
                if (row + col) % 2 == 1:  # Dark squares only
                    board[row][col] = {"color": "red", "king": False}
        
        # Place black pieces (rows 6-9)
        for row in range(6, 10):
            for col in range(10):
                if (row + col) % 2 == 1:  # Dark squares only
                    board[row][col] = {"color": "black", "king": False}
        
        return board
    
    def _get_legal_moves_simple(self, board, color):
        """
        Get legal moves (simplified - doesn't handle all international draughts rules).
        Returns list of move dictionaries: {"from": [row, col], "to": [row, col]}
        """
        moves = []
        
        # Find all pieces of this color
        for row in range(len(board)):
            for col in range(len(board[0])):
                if board[row][col] and board[row][col]["color"] == color:
                    piece_moves = self._get_piece_moves(board, row, col, color)
                    moves.extend(piece_moves)
        
        return moves
    
    def _get_piece_moves(self, board, row, col, color):
        """Get possible moves for a single piece."""
        moves = []
        is_king = board[row][col].get("king", False)
        
        # Determine movement directions
        if is_king:
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        else:
            # Regular pieces move forward only
            directions = [(-1, -1), (-1, 1)] if color == "black" else [(1, -1), (1, 1)]
        
        # Check each direction
        for dr, dc in directions:
            nr, nc = row + dr, col + dc
            
            # Simple move (no capture)
            if 0 <= nr < len(board) and 0 <= nc < len(board[0]):
                if board[nr][nc] is None:
                    moves.append({
                        "from": [row, col],
                        "to": [nr, nc],
                        "captures": 0
                    })
                elif board[nr][nc]["color"] != color:
                    # Capture move
                    jr, jc = nr + dr, nc + dc
                    if 0 <= jr < len(board) and 0 <= jc < len(board[0]):
                        if board[jr][jc] is None:
                            moves.append({
                                "from": [row, col],
                                "to": [jr, jc],
                                "captures": 1
                            })
        
        return moves
    
    def _select_best_move_simple(self, board, legal_moves, color):
        """
        DEPRECATED: Simple heuristic move selection.
        Kept for fallback if needed.
        """
        # Prioritize captures
        capture_moves = [m for m in legal_moves if m.get("captures", 0) > 0]
        
        if capture_moves:
            return random.choice(capture_moves)
        
        return random.choice(legal_moves)
    
    def _apply_move(self, board, move, color):
        """Apply a move and return new board state."""
        # Deep copy board
        new_board = [row[:] for row in board]
        for i in range(len(new_board)):
            new_board[i] = [cell.copy() if cell else None for cell in new_board[i]]
        
        from_row, from_col = move["from"]
        to_row, to_col = move["to"]
        
        # Move piece
        piece = new_board[from_row][from_col]
        new_board[to_row][to_col] = piece
        new_board[from_row][from_col] = None
        
        # Check for promotion (simplified - promote at end rows)
        if not piece["king"]:
            if (color == "black" and to_row == 0) or (color == "red" and to_row == 9):
                new_board[to_row][to_col]["king"] = True
        
        # Remove captured pieces (simplified - midpoint between from and to)
        if move.get("captures", 0) > 0:
            cap_row = (from_row + to_row) // 2
            cap_col = (from_col + to_col) // 2
            new_board[cap_row][cap_col] = None
        
        return new_board
    
    def _is_game_over(self, board):
        """Check if game is over (simplified)."""
        red_count = 0
        black_count = 0
        
        for row in board:
            for cell in row:
                if cell:
                    if cell["color"] == "red":
                        red_count += 1
                    else:
                        black_count += 1
        
        # Game over if either side has no pieces
        return red_count == 0 or black_count == 0
    
    def _determine_winner(self, board):
        """Determine game winner."""
        red_count = 0
        black_count = 0
        
        for row in board:
            for cell in row:
                if cell:
                    if cell["color"] == "red":
                        red_count += 1
                    else:
                        black_count += 1
        
        if black_count == 0:
            return "human"  # Red (human) won
        elif red_count == 0:
            return "ai"  # Black (AI) won
        else:
            return "draw"
    
    def _board_to_json(self, board):
        """Convert board to JSON string."""
        return json.dumps(board)

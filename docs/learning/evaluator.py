"""
Comprehensive AI Evaluation System.

Tracks detailed performance metrics across multiple dimensions:
- Win/loss statistics
- Tactical execution (captures, sacrifices)
- Strategic positioning (cohesion, formation)
- Learning progress (policy entropy, value accuracy)
"""

import numpy as np
from datetime import datetime
import json


class AIEvaluator:
    """Tracks and analyzes AI performance metrics."""
    
    def __init__(self):
        self.metrics = {
            # === Win Conditions ===
            "games_won": 0,
            "games_lost": 0,
            "games_drawn": 0,
            
            # === Tactical Metrics ===
            "single_captures_executed": 0,
            "multi_captures_executed": 0,
            "total_pieces_captured": 0,
            "pieces_lost_unnecessarily": 0,  # Losses that didn't lead to advantage
            "kings_promoted": 0,
            "kings_lost": 0,
            "max_capture_chain": 0,
            
            # === Strategic Metrics ===
            "avg_piece_cohesion": [],
            "avg_gap_closure_score": [],
            "avg_formation_strength": [],
            "defensive_integrity_maintained": 0,
            "defensive_violations": 0,
            
            # === Learning Progress ===
            "avg_policy_entropy": [],  # Higher = more exploration
            "avg_value_error": [],     # Lower = better evaluation
            "avg_advantage_accuracy": [],
            "training_steps_completed": 0,
            
            # === Game Statistics ===
            "avg_game_length": [],
            "opening_win_rate": [],
            "midgame_win_rate": [],
            "endgame_win_rate": [],
            
            # === Time Series ===
            "performance_history": [],  # {timestamp, win_rate, metrics}
        }
        
        self.games_evaluated = 0
        self.evaluation_interval = 10  # Summarize every N games
        
    def evaluate_game(self, game_trajectory, winner, game_id=None):
        """
        Extract detailed metrics from a completed game.
        
        Args:
            game_trajectory: List of game states and actions
            winner: 'ai', 'human', or 'draw'
            game_id: Optional game identifier
            
        Returns:
            Dictionary of extracted metrics
        """
        # Update win/loss
        if winner == "ai":
            self.metrics["games_won"] += 1
        elif winner == "human":
            self.metrics["games_lost"] += 1
        else:
            self.metrics["games_drawn"] += 1
        
        game_metrics = {
            "captures": 0,
            "multi_captures": 0,
            "kings_promoted": 0,
            "cohesion_scores": [],
            "game_length": len(game_trajectory)
        }
        
        # Analyze trajectory
        for i, step in enumerate(game_trajectory):
            try:
                # Count captures
                if 'board_state' in step and 'next_state' in step:
                    pieces_before = self._count_total_pieces(step['board_state'])
                    pieces_after = self._count_total_pieces(step['next_state'])
                    captures = pieces_before - pieces_after
                    
                    if captures > 0:
                        game_metrics["captures"] += captures
                        self.metrics["total_pieces_captured"] += captures
                        
                        if captures == 1:
                            self.metrics["single_captures_executed"] += 1
                        else:
                            self.metrics["multi_captures_executed"] += 1
                            self.metrics["max_capture_chain"] = max(
                                self.metrics["max_capture_chain"], 
                                captures
                            )
                    
                    # Check king promotion
                    kings_before = self._count_kings(step['board_state'], "black")
                    kings_after = self._count_kings(step['next_state'], "black")
                    if kings_after > kings_before:
                        game_metrics["kings_promoted"] += 1
                        self.metrics["kings_promoted"] += 1
                    
                    # Track cohesion
                    cohesion = self._evaluate_cohesion_simple(step['next_state'], "black")
                    game_metrics["cohesion_scores"].append(cohesion)
                    
            except Exception as e:
                print(f"Warning: Error analyzing step {i}: {e}")
                continue
        
        # Update averages
        if game_metrics["cohesion_scores"]:
            avg_cohesion = np.mean(game_metrics["cohesion_scores"])
            self.metrics["avg_piece_cohesion"].append(avg_cohesion)
        
        self.metrics["avg_game_length"].append(game_metrics["game_length"])
        
        self.games_evaluated += 1
        
        # Periodic summary
        if self.games_evaluated % self.evaluation_interval == 0:
            self._record_performance_snapshot()
        
        return game_metrics
    
    def _count_total_pieces(self, board):
        """Count total pieces on board."""
        if isinstance(board, str):
            try:
                board = json.loads(board)
            except:
                return 0
        
        if not isinstance(board, list):
            return 0
        
        count = 0
        for row in board:
            if isinstance(row, list):
                for cell in row:
                    if cell is not None:
                        count += 1
        return count
    
    def _count_kings(self, board, color):
        """Count kings for a specific color."""
        if isinstance(board, str):
            try:
                board = json.loads(board)
            except:
                return 0
        
        if not isinstance(board, list):
            return 0
        
        count = 0
        for row in board:
            if isinstance(row, list):
                for cell in row:
                    if (cell and isinstance(cell, dict) and 
                        cell.get("color") == color and 
                        cell.get("king", False)):
                        count += 1
        return count
    
    def _evaluate_cohesion_simple(self, board, color):
        """Simple cohesion metric (fraction of pieces with neighbors)."""
        if isinstance(board, str):
            try:
                board = json.loads(board)
            except:
                return 0
        
        if not isinstance(board, list):
            return 0
        
        total_pieces = 0
        connected_pieces = 0
        
        for row in range(len(board)):
            for col in range(len(board[0])):
                if not isinstance(board[row], list):
                    continue
                if (board[row][col] and isinstance(board[row][col], dict) and 
                    board[row][col].get("color") == color):
                    total_pieces += 1
                    
                    # Check for neighbors
                    for dr, dc in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                        nr, nc = row + dr, col + dc
                        if 0 <= nr < len(board) and 0 <= nc < len(board[0]):
                            if isinstance(board[nr], list) and board[nr][nc]:
                                if (isinstance(board[nr][nc], dict) and 
                                    board[nr][nc].get("color") == color):
                                    connected_pieces += 1
                                    break
        
        return connected_pieces / max(total_pieces, 1)
    
    def _record_performance_snapshot(self):
        """Record current performance metrics."""
        total_games = self.metrics["games_won"] + self.metrics["games_lost"] + self.metrics["games_drawn"]
        
        if total_games == 0:
            return
        
        snapshot = {
            "timestamp": datetime.now().isoformat(),
            "total_games": total_games,
            "win_rate": self.metrics["games_won"] / total_games,
            "avg_cohesion": np.mean(self.metrics["avg_piece_cohesion"][-100:]) if self.metrics["avg_piece_cohesion"] else 0,
            "multi_capture_rate": self.metrics["multi_captures_executed"] / max(total_games, 1),
            "avg_game_length": np.mean(self.metrics["avg_game_length"][-100:]) if self.metrics["avg_game_length"] else 0,
        }
        
        self.metrics["performance_history"].append(snapshot)
    
    def get_summary(self):
        """Generate comprehensive summary report."""
        total_games = self.metrics["games_won"] + self.metrics["games_lost"] + self.metrics["games_drawn"]
        
        if total_games == 0:
            return {"error": "No games played yet"}
        
        # Calculate statistics
        win_rate = self.metrics["games_won"] / total_games
        
        recent_cohesion = (
            np.mean(self.metrics["avg_piece_cohesion"][-100:])
            if len(self.metrics["avg_piece_cohesion"]) > 0
            else 0.0
        )
        
        recent_game_length = (
            np.mean(self.metrics["avg_game_length"][-100:])
            if len(self.metrics["avg_game_length"]) > 0
            else 0.0
        )
        
        return {
            # Overall performance
            "total_games": total_games,
            "win_rate": round(win_rate, 3),
            "wins": self.metrics["games_won"],
            "losses": self.metrics["games_lost"],
            "draws": self.metrics["games_drawn"],
            
            # Tactical performance
            "single_captures": self.metrics["single_captures_executed"],
            "multi_captures": self.metrics["multi_captures_executed"],
            "multi_capture_rate": round(
                self.metrics["multi_captures_executed"] / max(total_games, 1), 
                3
            ),
            "max_capture_chain": self.metrics["max_capture_chain"],
            "total_pieces_captured": self.metrics["total_pieces_captured"],
            "kings_promoted": self.metrics["kings_promoted"],
            "kings_lost": self.metrics["kings_lost"],
            
            # Strategic performance
            "avg_cohesion": round(recent_cohesion, 3),
            "avg_game_length": round(recent_game_length, 1),
            
            # Learning progress
            "training_steps": self.metrics["training_steps_completed"],
            "games_evaluated": self.games_evaluated,
        }
    
    def update_training_metrics(self, policy_entropy, value_error, advantage_accuracy):
        """Update learning progress metrics."""
        self.metrics["avg_policy_entropy"].append(policy_entropy)
        self.metrics["avg_value_error"].append(value_error)
        self.metrics["avg_advantage_accuracy"].append(advantage_accuracy)
        self.metrics["training_steps_completed"] += 1
    
    def export_metrics(self, filepath):
        """Export metrics to JSON file."""
        with open(filepath, 'w') as f:
            json.dump({
                "metrics": self.metrics,
                "summary": self.get_summary()
            }, f, indent=2, default=str)
    
    def get_performance_trend(self, window=50):
        """Get performance trend over recent games."""
        if len(self.metrics["performance_history"]) < 2:
            return "insufficient_data"
        
        recent = self.metrics["performance_history"][-window:]
        
        if len(recent) < 2:
            return "improving"  # Default optimistic
        
        # Simple linear trend
        win_rates = [s["win_rate"] for s in recent]
        trend = np.polyfit(range(len(win_rates)), win_rates, 1)[0]
        
        if trend > 0.01:
            return "improving"
        elif trend < -0.01:
            return "declining"
        else:
            return "stable"

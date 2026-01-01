import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional
import threading

class ReplayBuffer:
    """
    SQLite-based replay buffer for storing game trajectories.
    Supports online learning by accumulating game data for training.
    """
    
    def __init__(self, db_path: str = None, max_games: int = 10000):
        # Use config path if not specified
        if db_path is None:
            import config
            self.db_path = config.REPLAY_DB_PATH
        else:
            self.db_path = db_path
        self.max_games = max_games
        self.lock = threading.Lock()
        self._init_db()
    
    def _init_db(self):
        """Initialize the database schema."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Games table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS games (
                    game_id TEXT PRIMARY KEY,
                    winner TEXT,
                    total_moves INTEGER,
                    duration_seconds REAL,
                    timestamp TEXT,
                    player_color TEXT
                )
            """)
            
            # Trajectories table (state-action-reward sequences)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS trajectories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id TEXT,
                    move_number INTEGER,
                    board_state TEXT,
                    action TEXT,
                    reward REAL,
                    next_state TEXT,
                    done INTEGER,
                    player TEXT,
                    priority REAL DEFAULT 1.0,
                    heuristic_score REAL DEFAULT 0.0,
                    heuristic_move TEXT,
                    FOREIGN KEY (game_id) REFERENCES games(game_id)
                )
            """)
            
            # Create indices for faster queries
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_game_id 
                ON trajectories(game_id)
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_timestamp 
                ON games(timestamp)
            """)
            
            # NEW: Index  for priority-based sampling
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_priority
                ON trajectories(priority DESC)
            """)
            
            conn.commit()
    
    def add_game(self, game_id: str, winner: str, total_moves: int, 
                 duration_seconds: float, player_color: str = "black"):
        """Add a completed game to the database."""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO games 
                    (game_id, winner, total_moves, duration_seconds, timestamp, player_color)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (game_id, winner, total_moves, duration_seconds, 
                      datetime.now().isoformat(), player_color))
                conn.commit()
                
                # Clean up old games if over limit
                self._cleanup_old_games(conn)
    
    def add_trajectory(self, game_id: str, move_number: int, board_state: Dict,
                      action: Dict, reward: float, next_state: Dict,
                      done: bool, player: str, priority: float = 1.0,
                      heuristic_score: float = 0.0, heuristic_move: Dict = None):
        """
        Add a single state-action-reward transition.
        
        Args:
            priority: Importance weight for sampling
            heuristic_score: Value prediction from heuristic AI
            heuristic_move: Best move suggested by heuristic AI
        """
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO trajectories 
                    (game_id, move_number, board_state, action, reward, next_state, 
                     done, player, priority, heuristic_score, heuristic_move)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (game_id, move_number, json.dumps(board_state), 
                      json.dumps(action), reward, json.dumps(next_state), 
                      int(done), player, priority, heuristic_score, 
                      json.dumps(heuristic_move) if heuristic_move else None))
                conn.commit()
    
    def add_batch_trajectories(self, game_id: str, trajectories: List[Dict]):
        """Add multiple trajectories at once (more efficient)."""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                batch_data = [
                    (game_id, t['move_number'], json.dumps(t['board_state']),
                     json.dumps(t['action']), t['reward'], json.dumps(t['next_state']),
                     int(t['done']), t['player'])
                    for t in trajectories
                ]
                cursor.executemany("""
                    INSERT INTO trajectories 
                    (game_id, move_number, board_state, action, reward, next_state, done, player)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, batch_data)
                conn.commit()
    
    def get_recent_trajectories(self, limit: int = 1000, player: str = "black") -> List[Dict]:
        """Get recent trajectories for training."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT t.board_state, t.action, t.reward, t.next_state, t.done
                FROM trajectories t
                JOIN games g ON t.game_id = g.game_id
                WHERE t.player = ?
                ORDER BY g.timestamp DESC, t.move_number
                LIMIT ?
            """, (player, limit))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'board_state': json.loads(row[0]),
                    'action': json.loads(row[1]),
                    'reward': row[2],
                    'next_state': json.loads(row[3]),
                    'done': bool(row[4])
                })
            
            return results
    
    def get_random_trajectories(self, limit: int = 200, player: str = "black") -> List[Dict]:
        """
        CRITICAL: Get random historical trajectories.
        Used for preventing catastrophic forgetting.
        
        Args:
            limit: Number of random trajectories to sample
            player: Player color to filter by
            
        Returns:
            List of random trajectory dictionaries
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT t.board_state, t.action, t.reward, t.next_state, t.done
                FROM trajectories t
                WHERE t.player = ?
                ORDER BY RANDOM()
                LIMIT ?
            """, (player, limit))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'board_state': json.loads(row[0]),
                    'action': json.loads(row[1]),
                    'reward': row[2],
                    'next_state': json.loads(row[3]),
                    'done': bool(row[4])
                })
            
            return results
    
    def get_mixed_trajectories(self, batch_size: int = 32, recent_ratio: float = 0.8, player: str = "black") -> List[Dict]:
        """
        CRITICAL: Get mixed batch of recent and historical trajectories.
        This prevents catastrophic forgetting while prioritizing recent experience.
        
        Args:
            batch_size: Total number of trajectories to return
            recent_ratio: Fraction of batch that should be recent (e.g., 0.8 = 80%)
            player: Player color to filter by
            
        Returns:
            Mixed list of trajectories
        """
        recent_count = int(batch_size * recent_ratio)
        historical_count = batch_size - recent_count
        
        # Get recent trajectories
        recent = self.get_recent_trajectories(limit=recent_count, player=player)
        
        # Get random historical trajectories
        historical = self.get_random_trajectories(limit=historical_count, player=player)
        
        # Combine and shuffle
        import random
        mixed = recent + historical
        random.shuffle(mixed)
        
        return mixed
    
    def get_prioritized_trajectories(self, batch_size: int = 32, player: str = "black", 
                                     temperature: float = 1.0) -> List[Dict]:
        """
        ENHANCED: Get trajectories with priority-based sampling.
        
        Higher priority trajectories are more likely to be sampled.
        This accelerates learning of important patterns (multi-captures, critical moves).
        
        Args:
            batch_size: Number of trajectories to sample
            player: Player color to filter by
            temperature: Sampling temperature (higher = more uniform, lower = more greedy)
                        Default 1.0. Use 0.5 for more aggressive prioritization.
            
        Returns:
            List of prioritized trajectories
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Get all trajectories with their priorities
            cursor.execute("""
                SELECT t.board_state, t.action, t.reward, t.next_state, t.done, t.priority,
                       t.heuristic_score, t.heuristic_move,
                       ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
                FROM trajectories t
                WHERE t.player = ?
            """, (player,))
            
            rows = cursor.fetchall()
            
            if not rows:
                return []
            
            # Extract priorities and apply temperature
            priorities = [row[5] ** (1.0 / temperature) for row in rows]
            total_priority = sum(priorities)
            
            if total_priority == 0:
                # Fallback to uniform sampling
                probabilities = [1.0 / len(rows)] * len(rows)
            else:
                probabilities = [p / total_priority for p in priorities]
            
            # Sample based on priorities
            import numpy as np
            selected_indices = np.random.choice(
                len(rows), 
                size=min(batch_size, len(rows)), 
                replace=False,
                p=probabilities
            )
            
            # Build result
            results = []
            for idx in selected_indices:
                row = rows[idx]
                results.append({
                    'board_state': json.loads(row[0]),
                    'action': json.loads(row[1]),
                    'reward': row[2],
                    'next_state': json.loads(row[3]),
                    'done': bool(row[4]),
                    'heuristic_score': row[6],
                    'heuristic_move': json.loads(row[7]) if row[7] else None
                })
            
            return results
    
    def get_game_trajectory(self, game_id: str) -> List[Dict]:
        """Get all trajectories for a specific game."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT board_state, action, reward, next_state, done, player
                FROM trajectories
                WHERE game_id = ?
                ORDER BY move_number
            """, (game_id,))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'board_state': json.loads(row[0]),
                    'action': json.loads(row[1]),
                    'reward': row[2],
                    'next_state': json.loads(row[3]),
                    'done': bool(row[4]),
                    'player': row[5]
                })
            
            return results
    
    def get_stats(self) -> Dict:
        """Get statistics about the replay buffer."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Total games
            cursor.execute("SELECT COUNT(*) FROM games")
            total_games = cursor.fetchone()[0]
            
            # Win statistics
            cursor.execute("""
                SELECT winner, COUNT(*) 
                FROM games 
                GROUP BY winner
            """)
            wins = dict(cursor.fetchall())
            
            # Total trajectories
            cursor.execute("SELECT COUNT(*) FROM trajectories")
            total_trajectories = cursor.fetchone()[0]
            
            # Average game length
            cursor.execute("SELECT AVG(total_moves) FROM games")
            avg_moves = cursor.fetchone()[0] or 0
            
            return {
                'total_games': total_games,
                'total_trajectories': total_trajectories,
                'wins': wins,
                'average_moves': avg_moves
            }
    
    def _cleanup_old_games(self, conn):
        """Remove oldest games if exceeding max_games limit."""
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM games")
        total_games = cursor.fetchone()[0]
        
        if total_games > self.max_games:
            # Get oldest game IDs to delete
            cursor.execute("""
                SELECT game_id FROM games
                ORDER BY timestamp
                LIMIT ?
            """, (total_games - self.max_games,))
            
            old_game_ids = [row[0] for row in cursor.fetchall()]
            
            # Delete from both tables
            for game_id in old_game_ids:
                cursor.execute("DELETE FROM trajectories WHERE game_id = ?", (game_id,))
                cursor.execute("DELETE FROM games WHERE game_id = ?", (game_id,))
            
            conn.commit()
    
    def clear_all(self):
        """Clear all data from the replay buffer."""
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM trajectories")
                cursor.execute("DELETE FROM games")
                conn.commit()

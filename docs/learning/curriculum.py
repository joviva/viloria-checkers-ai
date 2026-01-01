"""
Curriculum Learning Manager for Progressive AI Training.

Implements structured learning progression from basic to advanced concepts:
- Stage 1: Basic captures
- Stage 2: Multi-capture chains  
- Stage 3: Defensive positioning
- Stage 4: King endgames
- Stage 5: Mastery (balanced gameplay)
"""

class CurriculumManager:
    """Manages progressive difficulty stages in AI training."""
    
    def __init__(self):
        self.stages = {
            "basic_captures": {
                "min_games": 0,
                "max_games": 100,
                "focus": "capture_rewards",
                "description": "Learning basic piece captures",
                "reward_multipliers": {
                    "captures": 2.0,
                    "material": 1.5
                }
            },
            "multi_capture_chains": {
                "min_games": 100,
                "max_games": 300,
                "focus": "chain_rewards",
                "description": "Learning multi-capture sequences",
                "reward_multipliers": {
                    "multi_captures": 2.5,
                    "chain_length": 2.0
                }
            },
            "defensive_positioning": {
                "min_games": 300,
                "max_games": 600,
                "focus": "formation_rewards",
                "description": "Learning defensive formations",
                "reward_multipliers": {
                    "gap_closure": 2.0,
                    "cohesion": 2.0,
                    "support": 1.5,
                    "isolation_penalty": 1.5
                }
            },
            "king_endgames": {
                "min_games": 600,
                "max_games": 1000,
                "focus": "king_activity",
                "description": "Learning king endgame tactics",
                "reward_multipliers": {
                    "king_activity": 2.0,
                    "king_promotion": 1.5,
                    "king_safety": 1.5
                }
            },
            "mastery": {
                "min_games": 1000,
                "max_games": float('inf'),
                "focus": "balanced",
                "description": "Balanced strategic gameplay",
                "reward_multipliers": {}  # No multipliers at mastery
            }
        }
        
        self.current_stage = None
        self.games_completed = 0
        
    def get_current_stage(self, games_played=None):
        """
        Determine which curriculum stage we're in.
        
        Args:
            games_played: Number of games completed (uses internal counter if None)
            
        Returns:
            Tuple of (stage_name, stage_config)
        """
        if games_played is None:
            games_played = self.games_completed
            
        for stage_name, config in self.stages.items():
            if config["min_games"] <= games_played < config["max_games"]:
                self.current_stage = stage_name
                return stage_name, config
                
        self.current_stage = "mastery"
        return "mastery", self.stages["mastery"]
    
    def update_games_count(self, games_completed):
        """Update the internal games counter."""
        self.games_completed = games_completed
        
    def get_stage_info(self):
        """Get information about current stage."""
        stage_name, config = self.get_current_stage()
        progress = self.games_completed - config["min_games"]
        total = config["max_games"] - config["min_games"]
        
        if total == float('inf'):
            progress_pct = 100.0
        else:
            progress_pct = (progress / total) * 100
            
        return {
            "stage": stage_name,
            "description": config["description"],
            "games_completed": self.games_completed,
            "progress_pct": progress_pct,
            "focus": config["focus"]
        }
    
    def should_advance_stage(self):
        """Check if AI should advance to next stage."""
        stage_name, config = self.get_current_stage()
        return self.games_completed >= config["max_games"]


class AdaptiveExploration:
    """
    Manages exploration rate based on learning progress.
    
    Uses multiple factors to determine optimal exploration:
    - Time-based decay (explore more early on)
    - Performance-based adjustment (explore more if struggling)
    - Curriculum-aware (different exploration per stage)
    """
    
    def __init__(self):
        self.base_epsilon = 0.10
        self.min_epsilon = 0.01
        self.max_epsilon = 0.30
        self.performance_window = []
        self.window_size = 50  # Track last 50 games
        
    def get_epsilon(self, training_steps, recent_win_rate=None, curriculum_stage=None):
        """
        Calculate adaptive exploration rate.
        
        Args:
            training_steps: Number of training iterations completed
            recent_win_rate: Win rate over recent games (0.0 to 1.0)
            curriculum_stage: Current curriculum stage name
            
        Returns:
            Exploration epsilon (0.0 to max_epsilon)
        """
        # Base decay over time (exploration → exploitation)
        time_decay = max(self.min_epsilon, self.base_epsilon * (0.995 ** training_steps))
        
        # Performance-based adjustment
        performance_factor = 1.0
        if recent_win_rate is not None:
            if recent_win_rate < 0.3:  # Struggling - explore more
                performance_factor = 1.5
            elif recent_win_rate > 0.7:  # Doing well - exploit more
                performance_factor = 0.7
            else:
                performance_factor = 1.0
        
        # Curriculum-based adjustment
        curriculum_factor = 1.0
        if curriculum_stage:
            if curriculum_stage == "basic_captures":
                curriculum_factor = 1.5  # More exploration early
            elif curriculum_stage == "mastery":
                curriculum_factor = 0.6  # Less exploration at mastery
                
        epsilon = time_decay * performance_factor * curriculum_factor
        epsilon = max(self.min_epsilon, min(self.max_epsilon, epsilon))
        
        return epsilon
    
    def update_performance(self, won):
        """Update performance tracking."""
        self.performance_window.append(1 if won else 0)
        if len(self.performance_window) > self.window_size:
            self.performance_window.pop(0)
    
    def get_recent_win_rate(self):
        """Get win rate over recent games."""
        if not self.performance_window:
            return 0.5  # Default
        return sum(self.performance_window) / len(self.performance_window)

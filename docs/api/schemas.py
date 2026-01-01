from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class MoveRequest(BaseModel):
    """Request for AI to make a move."""
    game_id: str
    board_state: str | List[List[Optional[Dict[str, Any]]]]  # JSON string or array
    legal_moves: List[str]  # Format: "fromRow,fromCol->toRow,toCol"
    player: str = "ai"
    move_number: int = 0


class TrajectoryStep(BaseModel):
    """Single step in a game trajectory."""
    board_state: List[List[Optional[Dict[str, Any]]]]
    action: Dict[str, Any]  # {"from": [row, col], "to": [row, col]}
    reward: float = 0.0
    next_state: List[List[Optional[Dict[str, Any]]]]
    player: Optional[str] = None  # "black" (AI) or "red" (human)
    heuristic_score: Optional[float] = 0.0  # Normalized evaluation from heuristic AI
    heuristic_move: Optional[Dict[str, Any]] = None  # Best move suggested by heuristic AI


class ResultRequest(BaseModel):
    """Request to record a game result."""
    game_id: str
    winner: str  # "human", "ai", "draw"
    trajectory: Optional[List[TrajectoryStep]] = None
    duration_seconds: float = 0.0
    total_moves: int = 0


class MoveResponse(BaseModel):
    """Response containing AI's selected move."""
    ai_move: str  # Format: "fromRow,fromCol->toRow,toCol"
    model_version: str
    confidence: Optional[float] = None
    
    
class StatsResponse(BaseModel):
    """Response with replay buffer statistics."""
    total_games: int
    total_trajectories: int
    wins: Dict[str, int]
    average_moves: float
    learning_active: bool = False
    learning_iterations: int = 0
    current_loss: Optional[float] = None
    model_healthy: bool = True

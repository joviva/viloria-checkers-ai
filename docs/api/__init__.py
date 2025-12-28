# API package for Checkers AI
from .ai import infer_move, record_game
from .schemas import MoveRequest, ResultRequest, MoveResponse, StatsResponse, TrajectoryStep

__all__ = [
    'infer_move',
    'record_game',
    'MoveRequest',
    'ResultRequest',
    'MoveResponse',
    'StatsResponse',
    'TrajectoryStep'
]

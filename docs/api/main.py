from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from api.schemas import MoveRequest, ResultRequest, MoveResponse, StatsResponse
from api.ai import infer_move, record_game, replay_buffer
import config
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format=config.LOG_FORMAT)
logger = logging.getLogger(__name__)

app = FastAPI(title="Checkers Online Learning AI", version=config.MODEL_VERSION)

# Enable CORS for frontend integration  
# Allow all origins for local development (including file:// protocol)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins including file://
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint to verify system status."""
    try:
        stats = replay_buffer.get_stats()
        return {
            "status": "healthy",
            "version": config.MODEL_VERSION,
            "database_accessible": True,
            "games_in_buffer": stats["total_games"]
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "degraded",
            "version": config.MODEL_VERSION,
            "error": str(e)
        }

@app.get("/")
async def root():
    return {
        "message": "Checkers Online Learning AI",
        "version": config.MODEL_VERSION,
        "endpoints": {
            "GET /health": "System health check",
            "POST /ai/move": "Get AI move for current position",
            "POST /ai/result": "Record game result for learning",
            "GET /ai/stats": "Get training statistics"
        }
    }

@app.post("/ai/move", response_model=MoveResponse)
async def ai_move(req: MoveRequest):
    """
    Get the best move from the AI for the current board position.
    """
    try:
        logger.info(f"Processing move request for game {req.game_id}")
        move, version = infer_move(req)
        return MoveResponse(
            ai_move=move,
            model_version=version
        )
    except Exception as e:
        logger.error(f"Error processing AI move: {e}")
        raise HTTPException(status_code=500, detail=f"AI move failed: {str(e)}")

@app.post("/ai/result")
async def ai_result(req: ResultRequest, bg: BackgroundTasks):
    """
    Record a finished game for learning.
    The actual learning happens asynchronously in the background.
    """
    try:
        logger.info(f"Recording game {req.game_id}, winner: {req.winner}")
        bg.add_task(record_game, req)
        return {"status": "recorded", "game_id": req.game_id}
    except Exception as e:
        logger.error(f"Error recording game: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to record game: {str(e)}")

@app.get("/ai/stats", response_model=StatsResponse)
async def ai_stats():
    """
    Get statistics about the replay buffer and training progress.
    """
    try:
        from api.ai import learner
        stats = replay_buffer.get_stats()
        # Check if learner is connected and not paused
        stats['learning_active'] = learner is not None and not getattr(learner, 'learning_paused', True)
        
        # Add training metrics if learner is available
        if learner is not None:
            stats['learning_iterations'] = getattr(learner, 'training_steps', 0)
            # Get recent loss from history
            if hasattr(learner, 'avg_loss_window') and len(learner.avg_loss_window) > 0:
                stats['current_loss'] = float(learner.avg_loss_window[-1])
            # Model health check
            stats['model_healthy'] = learner._check_model_health() if hasattr(learner, '_check_model_health') else True
        
        return StatsResponse(**stats)
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")

@app.post("/ai/resume")
async def resume_learning():
    """
    Resume the learning worker if it's paused.
    """
    try:
        from api.ai import learner
        if learner is not None:
            learner.resume_learning()
            return {"status": "resumed", "learning_active": True}
        else:
            return {"status": "no_learner", "message": "Learning worker not connected"}
    except Exception as e:
        logger.error(f"Error resuming learning: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to resume learning: {str(e)}")

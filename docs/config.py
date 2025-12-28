"""
Configuration file for Checkers AI Backend
Centralized settings for easy management
"""
import os

# Base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT_DIR = os.path.join(BASE_DIR, "..", "checkpoints")
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

# Model settings
MODEL_PATH = os.path.join(CHECKPOINT_DIR, "model.pth")
MODEL_VERSION = "v0.001"

# Training hyperparameters
LEARNING_RATE = 1e-4
GAMMA = 0.99  # Discount factor
VALUE_LOSS_COEF = 0.5
ENTROPY_COEF = 0.01
MAX_GRAD_NORM = 0.5
MAX_LOSS_THRESHOLD = 10.0

# Replay buffer settings
REPLAY_DB_PATH = os.path.join(DATA_DIR, "replay_buffer.db")
MAX_GAMES_IN_BUFFER = 10000
RECENT_TRAJECTORIES_LIMIT = 1000
RANDOM_TRAJECTORIES_LIMIT = 200

# Training settings
BATCH_SIZE = 64
TRAIN_INTERVAL = 60  # seconds between training runs
SAVE_INTERVAL = 300  # seconds between model saves
MIXED_SAMPLING_RATIO = 0.8  # 80% recent, 20% random

# API settings
API_HOST = "0.0.0.0"
API_PORT = 8000
API_WORKERS = 1

# CORS settings (security)
ALLOWED_ORIGINS = [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:5500",  # Live Server
    "http://127.0.0.1:5500",
]

# Logging
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# Neural Network Architecture
BOARD_SIZE = 10
NUM_CHANNELS = 5  # red, red_king, black, black_king, valid_squares
NUM_ACTIONS = 400  # 50 squares * 8 directions
CONV_CHANNELS = [64, 128, 128]
RESIDUAL_BLOCKS = 2

# Exploration
EXPLORATION_RATE = 0.1  # 10% random moves during training

# Create directories if they don't exist
os.makedirs(CHECKPOINT_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Verify critical paths exist
if not os.path.exists(CHECKPOINT_DIR):
    print(f"Warning: Checkpoint directory does not exist: {CHECKPOINT_DIR}")
if not os.path.exists(DATA_DIR):
    print(f"Warning: Data directory does not exist: {DATA_DIR}")

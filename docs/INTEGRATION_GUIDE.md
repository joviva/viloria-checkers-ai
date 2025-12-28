# Checkers AI - Neural Network Integration Guide

## Overview

This project now includes a complete neural network-based AI system that learns from real games using online reinforcement learning. The system consists of:

1. **Frontend**: HTML/CSS/JavaScript game interface
2. **Backend API**: FastAPI server for AI inference and game recording
3. **Neural Network**: PyTorch-based policy-value network with A2C learning
4. **Replay Buffer**: SQLite database for storing game trajectories
5. **Learning Worker**: Background process for continuous model improvement

## Architecture

```text
Frontend (script.js)
    ↓ HTTP API calls
Backend (FastAPI)
    ↓ Uses
Neural Network (PolicyValueNet)
    ↓ Stores data in
Replay Buffer (SQLite)
    ↑ Reads from
Learning Worker (A2C Learner)
    ↓ Updates
Neural Network Checkpoint
```

## Installation

### 1. Install Python Dependencies

```bash
cd docs
pip install -r requirements.txt
```

### 2. Directory Structure

The project should have this structure:

```text
checker game/
├── index.html                 # Game frontend
├── script.js                  # Game logic + API integration
├── style.css                  # Styling
├── docs/
│   ├── api/
│   │   ├── main.py           # FastAPI server
│   │   ├── ai.py             # AI inference logic
│   │   └── schemas.py        # API data models
│   ├── model/
│   │   ├── network.py        # Neural network architecture
│   │   ├── encoder.py        # Board state encoding
│   │   └── replay_buffer.py  # SQLite trajectory storage
│   ├── learning/
│   │   └── worker.py         # A2C training loop
│   └── requirements.txt      # Python dependencies
└── checkpoints/              # Model checkpoints (auto-created)
```

## Usage

### Running with Built-in AI (Default)

By default, the game uses the built-in minimax AI. Just open `index.html` in a browser.

### Running with Neural Network AI

#### Step 1: Start the API Server

```bash
cd docs
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

You can test it by visiting:

- `http://localhost:8000` - API info
- `http://localhost:8000/docs` - Interactive API documentation
- `http://localhost:8000/ai/stats` - Current training statistics

#### Step 2: Enable API Mode in Frontend

Edit `script.js` and change:

```javascript
const API_CONFIG = {
  enabled: true, // Change from false to true
  baseUrl: "http://localhost:8000",
  timeout: 5000,
};
```

#### Step 3: Start the Learning Worker (Optional)

To enable continuous learning from games:

```bash
cd docs
python -m learning.worker
```

This will:

- Monitor the replay buffer for new games
- Train the neural network every 60 seconds
- Save model checkpoints every 10 training iterations
- Print training statistics

#### Step 4: Play Games

Open `index.html` in a browser and play against the AI. Each game will:

1. Use the neural network for move selection
2. Record the game trajectory
3. Store it in the SQLite database
4. The learning worker will use it for training

## How It Works

### 1. Board Encoding

The 10x10 checkerboard is encoded into a 5-channel tensor:

- Channel 0: Red pieces
- Channel 1: Red kings
- Channel 2: Black pieces
- Channel 3: Black kings
- Channel 4: Valid play squares

### 2. Neural Network

The `PolicyValueNet` uses a convolutional architecture:

- 3 convolutional layers with batch normalization
- 2 residual blocks
- Policy head: outputs move probabilities
- Value head: estimates position value

### 3. Move Selection

The AI:

1. Receives current board state
2. Encodes it into a tensor
3. Runs forward pass through network
4. Masks illegal moves
5. Selects highest probability legal move
6. Includes 10% exploration for learning

### 4. Learning Process

The A2C (Advantage Actor-Critic) algorithm:

1. Collects game trajectories (state, action, reward sequences)
2. Computes returns and advantages
3. Updates policy to prefer advantageous moves
4. Updates value function to predict outcomes
5. Saves improved model checkpoints

### 5. Reward Shaping

Rewards are assigned for:

- **Captures**: +0.5 per piece captured
- **King promotion**: +0.3
- **Win**: +1.0
- **Loss**: -1.0
- **Draw**: 0.0

## API Endpoints

### POST /ai/move

Request AI move for current position.

**Request:**

```json
{
  "game_id": "game_123",
  "board_state": [[null, {"color": "red", "king": false}, ...], ...],
  "legal_moves": ["3,2->4,3", "5,4->6,5"],
  "player": "ai",
  "move_number": 5
}
```

**Response:**

```json
{
  "ai_move": "3,2->4,3",
  "model_version": "v42"
}
```

### POST /ai/result

Record finished game for learning.

**Request:**

```json
{
  "game_id": "game_123",
  "winner": "ai",
  "trajectory": [...],
  "duration_seconds": 120.5,
  "total_moves": 45
}
```

**Response:**

```json
{
  "status": "recorded",
  "game_id": "game_123"
}
```

### GET /ai/stats

Get training statistics.

**Response:**

```json
{
  "total_games": 150,
  "total_trajectories": 6750,
  "wins": { "ai": 75, "human": 60, "draw": 15 },
  "average_moves": 45.3
}
```

## Configuration

### API Configuration (script.js)

```javascript
const API_CONFIG = {
  enabled: false, // Enable/disable neural network AI
  baseUrl: "http://localhost:8000", // API server URL
  timeout: 5000, // Request timeout in ms
};
```

### Learning Configuration (learning/worker.py)

```python
learner = A2CLearner(
    model_path="checkpoints/model.pth",
    learning_rate=1e-4,      # Learning rate
    gamma=0.99,              # Discount factor
    value_loss_coef=0.5,     # Value loss weight
    entropy_coef=0.01,       # Exploration bonus
    max_grad_norm=0.5        # Gradient clipping
)

learner.train_loop(
    training_interval=60,    # Seconds between training
    batch_size=32,          # Trajectories per batch
    save_interval=10        # Save every N iterations
)
```

## Monitoring Training

Watch the console output from the learning worker:

```text
Starting A2C training loop...

Replay buffer stats: {'total_games': 15, 'total_trajectories': 675, ...}
Training iteration 1:
  Total loss: 2.3456
  Policy loss: 1.2345
  Value loss: 0.9876
  Entropy: 0.1234
Model saved to checkpoints/model.pth

Replay buffer stats: {'total_games': 20, 'total_trajectories': 900, ...}
Training iteration 2:
  Total loss: 2.1234
  Policy loss: 1.1234
  Value loss: 0.8765
  Entropy: 0.1235
```

## Troubleshooting

### API Not Responding

- Check if the server is running: `curl http://localhost:8000`
- Verify CORS settings in `api/main.py`
- Check firewall settings

### Neural Network Not Learning

- Ensure learning worker is running
- Check replay buffer has enough data: `GET /ai/stats`
- Monitor training losses (should decrease over time)
- Verify model checkpoints are being saved

### Frontend Not Using API

- Verify `API_CONFIG.enabled = true` in script.js
- Check browser console for errors
- Ensure API_CONFIG.baseUrl matches server address

### Import Errors

- Ensure all dependencies are installed: `pip install -r requirements.txt`
- Check Python version (3.8+ required)
- Verify you're in the correct directory

## Performance Tips

1. **Batch Size**: Larger batches (64-128) give more stable training but require more memory
2. **Training Interval**: More frequent training (30s) learns faster but uses more CPU
3. **Learning Rate**: Lower rates (1e-5) are safer but slower; higher (1e-3) are faster but riskier
4. **Exploration**: Increase exploration (20%) early, decrease (5%) as model improves

## Future Improvements

As noted in `docs/next`:

- Replace random.choice with NN inference
- Implement encoder from board format
- Add replay buffer (SQLite)
- Turn on learning worker
- Wire real A2C learning
- Map exact board format
- Add Docker support
- Convert to monorepo with frontend
- Add model versioning and A/B testing
- Implement opening book learning
- Add distributed training support

## Credits

Built with:

- FastAPI for the API server
- PyTorch for neural network
- SQLite for data persistence
- A2C (Advantage Actor-Critic) for reinforcement learning

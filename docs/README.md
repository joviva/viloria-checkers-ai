# Checkers Online Learning AI

A FastAPI-based Checkers AI that learns **only from real games** using online reinforcement learning.

## Features

- **Hybrid AI System**: Switch between built-in minimax AI and neural network AI
- **Live Inference Endpoint**: Real-time move prediction via REST API
- **Asynchronous Learning**: Background training from game trajectories
- **No Offline Pretraining**: Learns entirely from actual gameplay
- **Robust Production Design**: Fallback mechanisms and error handling
- **Complete Trajectory Tracking**: Full game history for learning
- **SQLite Replay Buffer**: Persistent storage of game data
- **A2C Reinforcement Learning**: Advanced actor-critic algorithm

## Quick Start

### Option 1: Use Built-in AI (Default)

Just open `../index.html` in your browser. No setup needed!

### Option 2: Use Neural Network AI

**Windows:**

```bash
cd docs
start.bat
```

**Linux/Mac:**

```bash
cd docs
chmod +x start.sh
./start.sh
```

Then:

1. Edit `../script.js` and set `API_CONFIG.enabled = true`
2. Open `../index.html` in your browser
3. Play games to train the AI!

See [QUICKSTART.md](QUICKSTART.md) for details.

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
- **[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)** - Complete technical documentation
- **[PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md)** - [CRITICAL] **Critical production improvements**
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was implemented and how it works
- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Comprehensive testing instructions
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was implemented and how it works

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    (HTML/CSS/JavaScript)                     │
│                                                              │
│  • Game Board Rendering                                     │
│  • User Input Handling                                      │
│  • API Integration (optional)                               │
│  • Built-in Minimax AI (fallback)                           │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP REST API
                 ↓
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│                       (FastAPI)                              │
│                                                              │
│  • POST /ai/move      - Get AI move                         │
│  • POST /ai/result    - Record game result                  │
│  • GET  /ai/stats     - Training statistics                 │
└────────────────┬────────────────────────────────────────────┘
                 │
         ┌───────┴───────┐
         ↓               ↓
┌─────────────────┐  ┌──────────────────┐
│ Neural Network  │  │  Replay Buffer   │
│  (PolicyValue)  │  │    (SQLite)      │
│                 │  │                  │
│ • 5-channel CNN │  │ • Game History   │
│ • Policy Head   │  │ • Trajectories   │
│ • Value Head    │  │ • Statistics     │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         │          ┌─────────┘
         │          │
         ↓          ↓
┌─────────────────────────────────┐
│      Learning Worker             │
│         (A2C Agent)              │
│                                  │
│ • Batch Trajectory Sampling     │
│ • Advantage Calculation         │
│ • Policy Gradient Update        │
│ • Value Function Learning       │
│ • Model Checkpointing           │
└─────────────────────────────────┘
```

## Installation

```bash
pip install -r requirements.txt
```

Requirements:

- Python 3.8+
- PyTorch
- FastAPI
- Uvicorn
- NumPy
- Pydantic

## Running the System

### Manual Start

**Terminal 1 - API Server:**

```bash
uvicorn api.main:app --reload --port 8000
```

**Terminal 2 - Learning Worker (optional):**

```bash
python -m learning.worker
```

**Browser:**

1. Edit `../script.js`: Set `API_CONFIG.enabled = true`
2. Open `../index.html`
3. Play games!

### Check Training Progress

Visit <http://localhost:8000/ai/stats> or:

```bash
curl http://localhost:8000/ai/stats
```

## How It Works

1. **Neural Network**: Convolutional network with policy and value heads
2. **Board Encoding**: 5-channel tensor (red pieces, red kings, black pieces, black kings, valid squares)
3. **Move Selection**: Network outputs probabilities for 400 possible moves
4. **Learning**: A2C algorithm updates network from game trajectories
5. **Replay Buffer**: SQLite stores up to 10,000 games for training
6. **Continuous Improvement**: Background worker trains model every 60 seconds

## Learning Process

```text
Play Game → Record Trajectory → Store in Database
                ↓
        Learning Worker Samples Batch
                ↓
        Compute Returns & Advantages
                ↓
        Update Policy & Value Networks
                ↓
        Save Improved Checkpoint
                ↓
        Use Better Model for Next Game
```

## Reward Structure

- **Piece Capture**: +0.5 per piece
- **King Promotion**: +0.3
- **Game Win**: +1.0
- **Game Loss**: -1.0
- **Draw**: 0.0

## Expected Performance

- **Games 1-50**: Random-like play, learning basic rules
- **Games 50-200**: Recognizing tactical patterns
- **Games 200-1000**: Strategic understanding develops
- **Games 1000+**: Strong positional play

## Configuration

### API Config (../script.js)

```javascript
const API_CONFIG = {
  enabled: false, // true to use neural network
  baseUrl: "http://localhost:8000",
  timeout: 5000,
};
```

### Learning Config (learning/worker.py)

```python
learner = A2CLearner(
    learning_rate=1e-4,
    gamma=0.99,
    batch_size=32
)
```

## Project Structure

```text
checker game/
├── index.html                 # Game frontend
├── script.js                  # Game logic + API integration
├── style.css                  # Styling
└── docs/
    ├── README.md             # This file
    ├── QUICKSTART.md         # Quick start guide
    ├── INTEGRATION_GUIDE.md  # Complete documentation
    ├── IMPLEMENTATION_SUMMARY.md  # Technical details
    ├── requirements.txt      # Python dependencies
    ├── start.sh / start.bat  # Startup scripts
    ├── api/
    │   ├── __init__.py
    │   ├── main.py          # FastAPI server
    │   ├── ai.py            # AI inference
    │   └── schemas.py       # Data models
    ├── model/
    │   ├── __init__.py
    │   ├── network.py       # Neural network
    │   ├── encoder.py       # Board encoding
    │   └── replay_buffer.py # SQLite storage
    └── learning/
        ├── __init__.py
        └── worker.py        # A2C training loop
```

## Technical Details

**Neural Network Architecture:**

- Input: (batch, 5, 10, 10) board state
- 3 conv layers (64, 128, 128 channels)
- 2 residual blocks
- Policy head: 400 action probabilities
- Value head: position evaluation (-1 to +1)

**A2C Algorithm:**

- Actor-Critic with Advantage estimation
- Generalized Advantage Estimation (GAE)
- Policy gradient with entropy bonus
- MSE value loss
- Gradient clipping for stability

## Contributing

This is a complete learning AI system. To extend:

1. Modify reward structure in `addToTrajectory()` (script.js)
2. Adjust network architecture in `network.py`
3. Tune learning hyperparameters in `worker.py`
4. Add new evaluation metrics in `schemas.py`

## License

Educational project - feel free to use and modify!

## Credits

Built with:

- FastAPI - Modern web framework
- PyTorch - Neural network framework
- SQLite - Database storage
- A2C - Reinforcement learning algorithm

---

**Ready to train your own Checkers AI?**
Run `start.bat` (Windows) or `./start.sh` (Linux/Mac) and start playing!

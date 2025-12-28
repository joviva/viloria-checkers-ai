# Checkers AI with Reinforcement Learning

An intelligent checkers game featuring a hybrid AI that combines Monte Carlo Tree Search (MCTS), Minimax algorithm, and a neural network trained with Advantage Actor-Critic (A2C) reinforcement learning.

## 🚀 Quick Start

### Double-click to start:

```
START_GAME.bat
```

This will automatically:

1. ✅ Start the API server
2. ✅ Start the learning worker
3. ✅ Open the game in your browser

### Manual start:

```powershell
cd docs
.\start_all.ps1
```

## 🎮 How to Play

1. **Start the game** - Use the quick start method above
2. **Click "New Game"** - The game will check if services are running
3. **Play checkers** - You (red) vs AI (black)
4. **AI learns** - Every game trains the neural network

## 📊 Features

- **Hybrid AI System**
  - MCTS for tactical search
  - Minimax with alpha-beta pruning
  - Neural network for position evaluation
- **Continuous Learning**

  - A2C reinforcement learning
  - Trains every 60 seconds in background
  - Saves checkpoints automatically

- **Real-time Stats**
  - Click "AI Statistics" to view training progress
  - See total games, trajectories, and loss metrics
  - Monitor learning iterations

## 🛠️ System Requirements

- Python 3.8+
- Virtual environment at `.venv`
- PyTorch, FastAPI, uvicorn (see `docs/requirements.txt`)

## 📁 Project Structure

```
/
├── START_GAME.bat          # Quick launcher
├── index.html              # Game frontend
├── script.js               # Game logic and AI
├── style.css               # Game styling
└── docs/
    ├── start_all.ps1       # PowerShell startup script
    ├── start_all.bat       # Batch startup script
    ├── STARTUP.md          # Detailed startup guide
    ├── api/
    │   ├── main.py         # FastAPI server
    │   └── ai.py           # Neural network inference
    ├── learning/
    │   └── worker.py       # A2C training loop
    └── model/
        ├── network.py      # PolicyValueNet architecture
        └── replay_buffer.py # SQLite trajectory storage
```

## 🔧 Troubleshooting

### "Backend not running" alert when clicking "New Game"

Run the startup script:

```
START_GAME.bat
```

Or manually:

```powershell
cd docs
.\start_all.ps1
```

### Port 8000 already in use

Stop existing services:

```powershell
Get-NetTCPConnection -LocalPort 8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Learning status shows "Paused"

The game auto-resumes learning. Or manually:

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/ai/resume" -Method POST
```

## 📈 Monitoring

Check training status:

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/ai/stats"
```

API documentation:

```
http://localhost:8000/docs
```

## 🎯 Game Controls

- **New Game** - Start fresh game (checks if backend is running)
- **AI Statistics** - View training metrics and game history
- **Click pieces** - Select and move your pieces
- **Kings** - Pieces that reach the opposite end become kings

## 📝 Notes

- First game may have slower AI as model initializes
- Training improves AI over time
- Model checkpoints saved at `checkpoints/model.pth`
- Game data stored at `data/replay_buffer.db`

---

**Enjoy playing and watching the AI learn!** 🎲🤖

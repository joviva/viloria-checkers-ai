# 🎮 Checkers AI - Simple Guide

## Quick Start

### Option 1: Play with AI Learning (Recommended)

1. **Start the backend:**
   ```powershell
   cd docs
   .\start_all.ps1
   ```

2. **Open the game:**
   - Double-click `index.html`
   - Or open it in your browser

3. **Check console (F12):**
   - You should see: `🧠 AI LEARNING SYSTEM ONLINE`
   - Game will automatically use neural network

4. **Play games:**
   - Each game helps the AI learn!
   - Training happens automatically every 60 seconds

### Option 2: Play Offline (No Backend Needed)

1. **Just open the game:**
   - Double-click `index.html`

2. **Check console (F12):**
   - You'll see: `🎮 OFFLINE MODE`
   - Game uses powerful heuristic AI

3. **Play immediately:**
   - No setup needed
   - Grandmaster-level AI

---

## How It Works

The game **automatically detects** if the backend is running:

```
Page loads
    ↓
Pings: http://localhost:8000/ai/stats
    ↓
┌─────────────┬─────────────────┐
│  ✓ Online   │   ✗ Offline     │
├─────────────┼─────────────────┤
│ Neural Net  │  Heuristic AI   │
│ AI Learning │  No Learning    │
│ Enabled     │  Offline Mode   │
└─────────────┴─────────────────┘
```

**No configuration needed!** Just start the backend if you want learning, or don't for offline play.

---

## Console Messages

### When Backend is Online:
```
═══════════════════════════════════════
🧠 AI LEARNING SYSTEM ONLINE
═══════════════════════════════════════
✓ Backend connected
✓ Total games: 2
✓ Move trajectories: 0
✓ Training iterations: 0
═══════════════════════════════════════
```

### When Backend is Offline:
```
═══════════════════════════════════════
🎮 OFFLINE MODE
═══════════════════════════════════════
Backend not detected - using heuristic AI

To enable AI learning:
  1. Open PowerShell
  2. Navigate to: docs/
  3. Run: .\start_all.ps1
  4. Refresh this page
═══════════════════════════════════════
```

---

## Troubleshooting

### Backend Won't Start
- Check that Python 3.8+ is installed
- Run: `pip install -r docs/requirements.txt`
- Make sure port 8000 is not in use

### "Move trajectories: 0" Warning
- This is expected currently
- Frontend trajectory tracking needs to be implemented
- See `AI_STATS_ISSUE_EXPLAINED.md` for details
- Backend is ready, just waiting for move data

### Want to Force Offline Mode
- Don't start the backend
- Or stop it: Close the PowerShell windows

---

## Files

- `index.html` - Main game (start here!)
- `script.js` - Game logic with auto-detection  
- `docs/start_all.ps1` - Backend startup script
- `AI_STATS_ISSUE_EXPLAINED.md` - Why trajectories are 0

---

## That's It!

**Simple workflow:**
1. Want AI learning? → Start backend → Open game
2. Want quick play? → Just open game

The game handles everything else automatically! 🎯

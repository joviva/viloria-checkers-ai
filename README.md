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

### Option 3: Run Backend with Docker

1. Start API + learning worker:

```powershell
docker compose up --build
```

1. Open the game:

   - Double-click `index.html`

1. Verify:
   - API: `http://localhost:8000/api/stats`

#### Share as a prebuilt Docker image (Option B)

On your machine (build + push to Docker Hub):

Recommended (always pushes BOTH a version tag and `:stable` automatically):

```powershell
./RELEASE.ps1
```

Manual (same result, but more typing):

```powershell
docker login
docker build -t YOUR_DOCKERHUB_USERNAME/checkers-ai:v0.1.0 .
docker tag YOUR_DOCKERHUB_USERNAME/checkers-ai:v0.1.0 YOUR_DOCKERHUB_USERNAME/checkers-ai:stable
docker push YOUR_DOCKERHUB_USERNAME/checkers-ai:v0.1.0
docker push YOUR_DOCKERHUB_USERNAME/checkers-ai:stable
```

On your friend's machine (pull + run API + worker):

Recommended: create a `.env` file once (so users don't have to set env vars every run):

```powershell
Copy-Item .env.example .env
notepad .env
```

Then start the services:

```powershell
docker compose -f docker-compose.image.yml up -d
```

Tip (recommended for distribution): `docker-compose.image.yml` includes Watchtower, which auto-pulls and restarts containers when you publish a new `:stable` image.
If you don't want auto-updates, remove the `watchtower` service.

### Frontend options

- **Static file (simplest):** open `index.html` directly, backend runs at `http://localhost:8000`.
- **Docker-served frontend (recommended for sharing):** serve the frontend at `http://localhost:8080` and proxy `/api/*` to the backend so it’s same-origin (no CORS headaches).

Run frontend + API + worker (uses your published backend image):

```powershell
docker compose -f docker-compose.web.yml up -d --build
```

Then open:

- `http://localhost:8080`

---

## Recommended Deployment (Auto-update + Auto-reload)

If you want learning to keep running 24/7 _and_ make it easy to distribute updates:

1. Publish your backend image (API + worker) to Docker Hub.
2. Run the app from `docker-compose.web.yml` (frontend + API + worker).
3. Watchtower (included) will auto-update containers when a new image is published.
4. The API will automatically hot-reload `checkpoints/model.pth` when the worker saves a new checkpoint.

You can control how frequently the API checks for a new checkpoint by setting:

`CHECKERS_AI_CHECKPOINT_RELOAD_INTERVAL_SEC` (default `2.0` seconds)

### Recommended tagging strategy

- Use a version tag for traceability (example: `:v0.1.0`).
- Also push/update `:stable` for “latest approved”.
- Point users/servers at `:stable` so Watchtower updates them automatically.

---

## How It Works

The game **automatically detects** if the backend is running:

```text
Page loads
    ↓
Pings: http://localhost:8000/api/stats
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

### When Backend is Online

```text
═══════════════════════════════════════
🧠 AI LEARNING SYSTEM ONLINE
═══════════════════════════════════════
✓ Backend connected
✓ Total games: 2
✓ Move trajectories: 0
✓ Training iterations: 0
═══════════════════════════════════════
```

### When Backend is Offline

```text
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

## Production Deployment (HTTPS + Domain)

This is the simplest production setup that keeps AI learning enabled:

1. Deploy the containers from [docker-compose.web.yml](docker-compose.web.yml) (frontend + API + worker) and keep `data/` + `checkpoints/` persisted on the server.
2. Add HTTPS by running Caddy in front of the `frontend` container.

Files included:

- [Caddyfile](Caddyfile) (edit `your-domain.com`)
- [docker-compose.caddy.yml](docker-compose.caddy.yml)

Run (on the server):

```bash
docker compose -f docker-compose.web.yml -f docker-compose.caddy.yml up -d
```

Notes:

- Point your domain DNS A/AAAA record to the server IP.
- Open firewall ports `80` and `443`.
- Caddy auto-issues and renews certificates.

---

## Files

- `index.html` - Main game (start here!)
- `script.js` - Game logic with auto-detection
- `docs/start_all.ps1` - Backend startup script
- `AI_STATS_ISSUE_EXPLAINED.md` - Why trajectories are 0

---

## Deployment Note

If you deploy the backend separately (e.g., Render) and host the frontend elsewhere (GitHub Pages), you can inject the backend URL without editing `script.js`:

Add this before loading `script.js` in `index.html`:

```html
<script>
  window.CHECKERS_AI_API_BASE_URL = "https://YOUR-BACKEND.onrender.com";
</script>
```

---

## Global AI (Daily Updates)

If you want a single shared AI model that learns from all players and updates daily while hosting the game as a static site, see: [GLOBAL_AI_DAILY.md](GLOBAL_AI_DAILY.md)

---

## That's It

**Simple workflow:**

1. Want AI learning? → Start backend → Open game
2. Want quick play? → Just open game

The game handles everything else automatically! 🎯

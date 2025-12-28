# Checkers AI - Deployment Guide

## Overview

Deploy the game so users can play from anywhere without installation!

## Architecture

```
┌─────────────────┐
│  GitHub Pages   │  ← Frontend (HTML/JS/CSS)
│  (Static Site)  │
└────────┬────────┘
         │ API calls
         ↓
┌─────────────────┐
│  Render/Railway │  ← Backend (Python FastAPI + Learning Worker)
│  (Cloud Server) │
└─────────────────┘
```

## Part 1: Deploy Backend (API Server)

### Using Render.com (Recommended - Free Tier)

1. **Create account** at https://render.com

2. **Create `render.yaml`** in project root (already created for you)

3. **Push to GitHub**:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/checkers-ai.git
   git push -u origin main
   ```

4. **Connect to Render**:

   - Go to Render Dashboard
   - New → Blueprint
   - Connect your GitHub repository
   - Render will automatically deploy using `render.yaml`

5. **Get your API URL**:
   - After deployment, you'll get a URL like: `https://checkers-ai-xyz.onrender.com`
   - Copy this URL!

### Alternative: Railway.app

1. Create account at https://railway.app
2. New Project → Deploy from GitHub
3. Select your repository
4. Railway auto-detects Python and uses `requirements.txt`
5. Add start command: `cd docs && uvicorn api.main:app --host 0.0.0.0 --port $PORT`

## Part 2: Deploy Frontend (GitHub Pages)

1. **Update API URL in `script.js`**:

   ```javascript
   const API_CONFIG = {
     enabled: true,
     baseUrl: "https://YOUR-APP.onrender.com", // ← Your deployed backend URL
     timeout: 5000,
   };
   ```

2. **Create GitHub repository**:

   ```bash
   git add .
   git commit -m "Update API URL"
   git push
   ```

3. **Enable GitHub Pages**:

   - Go to repository Settings
   - Pages section
   - Source: Deploy from `main` branch
   - Root directory
   - Save

4. **Access your game**:
   - URL will be: `https://YOUR_USERNAME.github.io/checkers-ai/`
   - Share this link with anyone!

## Part 3: Configuration

### For Offline/Local Play

Users can still play without backend by changing in `script.js`:

```javascript
const API_CONFIG = {
  enabled: false, // ← Disable neural network, use pure MCTS/Minimax
  baseUrl: "http://localhost:8000",
  timeout: 5000,
};
```

### Environment Variables (Render/Railway)

Set these in your cloud dashboard:

- `PORT`: (auto-set by platform)
- `PYTHONUNBUFFERED`: `1`

## File Structure for Deployment

```
your-repo/
├── index.html              ← Frontend
├── script.js               ← Frontend
├── style.css               ← Frontend
├── render.yaml             ← Render config
├── Procfile                ← Railway/Heroku config
├── requirements.txt        ← Python dependencies (move to root)
└── docs/
    ├── api/
    ├── learning/
    ├── model/
    └── requirements.txt
```

## Cost

**FREE** for both:

- **GitHub Pages**: Unlimited static hosting
- **Render Free Tier**: 750 hours/month, auto-sleep after 15min inactivity
- **Railway Free Tier**: $5 credit/month

## Next Steps

1. Run setup script: `python setup_deployment.py`
2. Push to GitHub
3. Connect to Render/Railway
4. Update API URL in script.js
5. Enable GitHub Pages
6. Share the URL!

## Troubleshooting

### Backend not responding

- Check Render/Railway logs
- Free tier sleeps after inactivity - first request may take 30s

### CORS errors

- Already configured in `api/main.py`
- Check API URL is correct in `script.js`

### Learning worker not starting

- Check logs on Render dashboard
- Worker starts automatically with the web service

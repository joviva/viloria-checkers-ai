# 🎮 Viloria Checkers AI - Deployment Guide

## ✅ What's Ready

Your game is ready to deploy to Vercel! No manual startup - users just visit a URL.

## 🚀 Quick Deploy (5 minutes)

### Step 1: GitHub (PRIVATE Repo)

```bash
git init
git add .
git commit -m "Deploy Viloria Checkers AI"
git remote add origin https://github.com/YOUR_USERNAME/viloria-checkers-ai.git
git push -u origin main

# IMPORTANT: Make repository PRIVATE on GitHub:
# Go to Settings → Danger Zone → Change visibility → Make private
```

### Step 2: Deploy to Vercel

1. Go to https://vercel.com
2. Sign up with GitHub
3. Click **Add New Project**
4. Import your `viloria-checkers-ai` repository (private repos supported!)
5. Click **Deploy**
6. Copy your URL: `https://viloria-checkers-ai.vercel.app`

### Step 3: Update API URL

Edit `script.js` line 6:

```javascript
baseUrl: "https://viloria-checkers-ai.vercel.app/api",  // ← Your Vercel URL
```

Commit and push:

```bash
git add script.js
git commit -m "Update API URL"
git push
```

### Step 4: Done!

Your game is live at: `https://viloria-checkers-ai.vercel.app/`

## 🎯 Share & Play

Share the Vercel URL with anyone - they can play instantly! The repo stays private.

## 🔄 Game Features

- **Neural Network AI**: Trained from real games
- **Learns Over Time**: Gets smarter as it plays
- **Hybrid AI**: MCTS + Minimax + Neural Network
- **Stats Tracking**: Records all games
- **Auto-Resume**: Learning continues automatically

## 📊 Free Tier (Vercel)

- **Bandwidth**: 100GB/month
- **Functions**: Unlimited serverless requests
- **Cold Start**: ~1 second
- **Cost**: $0

## 🛠️ Local Development

Still want to run locally? Use:

```bash
python launch.py
```

---

**More Details?** Read [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) for complete guide!

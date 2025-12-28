# Deployment Platform Comparison

## GitHub Pages + Render vs Vercel

### ❌ GitHub Pages + Render (Current Plan)

**Pros:**

- Completely free
- Unlimited bandwidth
- Learning worker can run 24/7

**Cons:**

- ⚠️ **Two platforms** to manage (GitHub Pages + Render)
- ⚠️ **Two deployments** required
- ⚠️ **CORS configuration** needed
- ⚠️ Free tier **sleeps after 15min** (Render)
- ⚠️ First request after sleep = **30 seconds wait**
- ⚠️ Learning worker may not persist on free tier

### ✅ Vercel (RECOMMENDED)

**Pros:**

- ✅ **ONE platform** for everything
- ✅ **ONE deployment** from GitHub
- ✅ Automatic deployments on git push
- ✅ No CORS issues (same domain)
- ✅ **Instant cold starts** (~1 second)
- ✅ Global CDN (fast worldwide)
- ✅ Easy environment variables
- ✅ Built-in analytics
- ✅ Custom domains free
- ✅ HTTPS automatic
- ✅ Preview deployments for each PR

**Cons:**

- ⚠️ Serverless functions = **10 second timeout** (free tier)
- ⚠️ Learning worker **cannot run continuously**
- ⚠️ Need to adapt to serverless architecture

**Free Tier Limits:**

- 100 GB bandwidth/month
- Unlimited requests
- 10s function timeout
- 1000 build minutes/month

## Winner: VERCEL 🏆

**Why:**

1. **Simpler deployment** - Push to GitHub → Auto-deploy
2. **Better UX** - No 30s cold starts
3. **Easier to maintain** - One platform
4. **Professional** - Custom domain, analytics, previews

## Architecture Change

### Old (Render):

```
GitHub Pages (Frontend)
        ↓
  Render (Backend + Worker running 24/7)
```

### New (Vercel):

```
Vercel (Frontend + Serverless Backend)
  ↓
  Functions triggered on-demand
  ↓
  Database stores model/data
```

## Implementation Strategy

### Serverless Adaptation

**API Functions:**

- ✅ `/api/move` - Neural network inference (works in serverless)
- ✅ `/api/result` - Record game result (works in serverless)
- ✅ `/api/stats` - Get statistics (works in serverless)
- ❌ `/api/resume` - Not needed (no continuous worker)

**Learning Worker:**
Instead of continuous training:

1. **Option A:** Trigger training via scheduled function (cron)
2. **Option B:** Train on-demand after N games
3. **Option C:** External worker (Render free tier just for worker)

**Recommended: Option B**

- Train model after every 10 games
- Store model in Vercel Blob Storage or external storage
- Fast, serverless-friendly

## Migration Steps

1. Create `api/` folder at root (Vercel auto-detects)
2. Convert endpoints to serverless functions
3. Add `vercel.json` configuration
4. Push to GitHub
5. Connect to Vercel
6. Done!

**Deployment time: 5 minutes**

## Conclusion

**Use Vercel** for this project. It's:

- Simpler to deploy
- Faster for users
- Easier to maintain
- More professional
- Still completely free

The only tradeoff is continuous learning → on-demand training, which is actually **better for serverless** and still provides a great experience.

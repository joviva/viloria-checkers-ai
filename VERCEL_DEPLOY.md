# 🚀 Deploy to Vercel (Recommended)

## Why Vercel?

✅ **ONE platform** - Frontend + Backend together  
✅ **ONE command** - Deploy everything at once  
✅ **Instant** - No cold starts  
✅ **Free** - 100GB bandwidth, unlimited requests  
✅ **Automatic** - Push to GitHub = Auto-deploy  
✅ **Global CDN** - Fast everywhere

## 5-Minute Deployment

### Step 1: Prepare Repository

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - Checkers AI"

# Create GitHub repository (https://github.com/new)
# IMPORTANT: Set repository to PRIVATE
# Name: viloria-checkers-ai
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/viloria-checkers-ai.git
git push -u origin main
```

### Step 2: Deploy to Vercel

**Option A: Vercel Dashboard (Easiest)**

1. Go to https://vercel.com/signup
2. Sign up with GitHub
3. Click **"Add New Project"**
4. Import your `viloria-checkers-ai` repository (private repos are supported!)
5. Vercel auto-detects everything
6. Click **"Deploy"**
7. **Done!** ✅

**Option B: Vercel CLI**

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd "c:\Users\jose\Documents\1-webdevelopment\2finished projects\0-personal projects\checker game\checker game"
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: viloria-checkers-ai
# - Directory: ./
# - Override settings? No
```

### Step 3: Update API URL

After deployment, Vercel gives you a URL like: `https://viloria-checkers-ai.vercel.app`

Update [script.js](script.js) line 6:

```javascript
const API_CONFIG = {
  enabled: true,
  baseUrl: "https://viloria-checkers-ai.vercel.app/api", // ← Your Vercel URL + /api
  timeout: 5000,
};
```

Commit and push:

```bash
git add script.js
git commit -m "Update API URL"
git push
```

Vercel auto-deploys the update!

### Step 4: Play!

Your game is live at: `https://viloria-checkers-ai.vercel.app`

Share this URL with anyone - they can play instantly!

## Configuration Files

Already created for you:

- ✅ [vercel.json](vercel.json) - Vercel configuration
- ✅ [api/move.py](api/move.py) - AI move endpoint
- ✅ [api/stats.py](api/stats.py) - Statistics endpoint
- ✅ [api/result.py](api/result.py) - Game result endpoint

## API Endpoints

After deployment:

- `https://YOUR-APP.vercel.app/` - Game frontend
- `https://YOUR-APP.vercel.app/api/move` - POST AI move
- `https://YOUR-APP.vercel.app/api/stats` - GET statistics
- `https://YOUR-APP.vercel.app/api/result` - POST game result

## Custom Domain (Optional)

1. Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `checkers.yoursite.com`)
3. Update DNS records as shown
4. HTTPS automatic!

## Environment Variables (Optional)

If you need to store secrets:

1. Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add variables (e.g., API keys)
3. Access in code: `os.environ.get('VAR_NAME')`

## Automatic Deployments

Every git push triggers a new deployment:

```bash
git add .
git commit -m "Update game"
git push
```

Vercel automatically:

- Builds the project
- Deploys to production
- Updates your live site

**Preview deployments** for branches/PRs too!

## Monitoring

Vercel Dashboard shows:

- **Analytics** - Page views, visitors
- **Logs** - Function execution logs
- **Performance** - Response times
- **Errors** - Runtime errors

## Free Tier Limits

- ✅ Bandwidth: 100 GB/month
- ✅ Requests: Unlimited
- ✅ Build minutes: 6000/month
- ✅ Function duration: 10s per invocation
- ✅ Projects: Unlimited

**More than enough for this game!**

## Troubleshooting

### Functions not working

Check logs in Vercel Dashboard → Deployments → [Latest] → Functions

### Import errors

Make sure `docs/` folder is in repository with all Python files

### Slow first load

Serverless functions have ~1s cold start (first request)  
Much better than Render's 30s!

### CORS errors

Already handled in `api/*.py` files with:

```python
'Access-Control-Allow-Origin': '*'
```

## Local Testing

Test serverless functions locally:

```bash
vercel dev
```

Game runs at `http://localhost:3000`

## Comparison

| Feature    | Vercel        | Render      | GitHub Pages |
| ---------- | ------------- | ----------- | ------------ |
| Frontend   | ✅ Yes        | ❌ No       | ✅ Yes       |
| Backend    | ✅ Serverless | ✅ Server   | ❌ No        |
| Setup      | 1 platform    | 2 platforms | 2 platforms  |
| Cold start | ~1s           | ~30s        | N/A          |
| Free tier  | Great         | OK          | Great        |
| Deploy     | Auto          | Auto        | Manual       |

**Winner: Vercel** 🏆

## Next Steps

1. Deploy to Vercel (5 minutes)
2. Update API URL in script.js
3. Share the URL!

That's it! Your game is live and playable worldwide. 🎮🌍

# Global AI (Daily Updates) – Simple Setup

This guide lets you host the game as a **static site** (GitHub Pages / Vercel / Supabase Hosting) while maintaining **one shared AI model** that improves **daily**.

## What runs where

- **Static host**: serves `index.html`, `script.js`, `style.css`.
- **Supabase**:
  - Database stores game logs sent from players.
  - Storage hosts the latest model file (and a small `model.json` manifest).
  - Edge Function receives game submissions (so you don’t expose a writeable DB to the public).
- **GitHub Actions (daily)**:
  - downloads recent games from Supabase
  - trains a new model
  - uploads the updated model to Supabase Storage

## Step-by-step (baby steps)

### 1) Create a Supabase project

1. Go to Supabase and create a new project.
2. Copy these values (you will paste them later into GitHub Secrets):
   - Project URL
   - Service Role Key

Important: for the Edge Function, you will store the Service Role Key under the name `SERVICE_ROLE_KEY`.

### 2) Create the database tables

1. Open Supabase → **SQL Editor**.
2. Paste and run the SQL in `supabase/schema.sql`.

### 3) Create a Storage bucket for the model

1. Supabase → **Storage** → create a bucket called `models`.
2. Make it **public** (simplest). If you want it private, we’ll use signed URLs.

### 4) Deploy the Edge Function (submit-game)

1. Install Supabase CLI on your computer.
2. Link the repo to your Supabase project.
3. Set the Edge Function secret:

- `supabase secrets set SERVICE_ROLE_KEY=...`

4. Deploy the function (with JWT verification disabled so a static website can call it):

- `supabase functions deploy submit-game --no-verify-jwt`

3. After deploy, you’ll get a URL like:
   - `https://YOURPROJECT.functions.supabase.co/submit-game`

### 5) Add GitHub Secrets

In your GitHub repo → Settings → Secrets and variables → Actions → add:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (set to `models`)

### 6) Turn on the daily job

The workflow is in `.github/workflows/global_ai_train_daily.yml`.
Once secrets are set, it will run daily and publish a new model.

### 7) Connect the frontend

You will add two things to the frontend:

- On game end: POST the trajectory to the submit-game endpoint.
- On page load: fetch the latest model from Supabase Storage.

This repo now supports TF.js in the browser. Add this snippet before loading `script.js` in `index.html`:

```html
<script>
  // Where the browser reads the latest model info (cache-busted daily)
  window.CHECKERS_AI_TFJS_MANIFEST_URL =
    "https://YOURPROJECT.supabase.co/storage/v1/object/public/models/tfjs/latest.json";

  // Where the browser submits finished games for daily training
  window.CHECKERS_AI_SUBMIT_GAME_URL =
    "https://YOURPROJECT.functions.supabase.co/submit-game";
</script>
```

Note: the repo currently uses a Python backend + PyTorch for inference/training.
To be truly “static hosting only”, the browser must also run inference (TF.js or ONNX Runtime Web).

## Reality check (important)

A static site can’t run PyTorch server inference. For a global model that actually plays better on the site, you must do browser inference.

Two practical choices:

- TF.js model (training/export in GitHub Actions, inference in browser)
- ONNX model (export in GitHub Actions, inference in browser via onnxruntime-web)

If you tell me which one you prefer (TF.js or ONNX), I can wire the browser inference into the current game code.

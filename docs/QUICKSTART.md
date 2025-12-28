# Checkers AI - Quick Start

## Quick Setup (Windows)

1. **Install dependencies:**

   ```bash
   cd docs
   pip install -r requirements.txt
   ```

2. **Start the system:**

   ```bash
   start.bat
   ```

3. **Enable API in frontend:**

   - Open `script.js`
   - Change `API_CONFIG.enabled` to `true`

4. **Play games:**
   - Open `index.html` in browser
   - Games automatically train the AI!

## Quick Setup (Linux/Mac)

1. **Install dependencies:**

   ```bash
   cd docs
   pip install -r requirements.txt
   ```

2. **Start the system:**

   ```bash
   chmod +x start.sh
   ./start.sh
   ```

3. **Enable API in frontend:**

   - Open `script.js`
   - Change `API_CONFIG.enabled` to `true`

4. **Play games:**
   - Open `index.html` in browser
   - Games automatically train the AI!

## Manual Start

### Start API Server

```bash
cd docs
uvicorn api.main:app --reload --port 8000
```

### Start Learning Worker

```bash
cd docs
python -m learning.worker
```

## Check Status

Visit <http://localhost:8000/ai/stats> to see:

- Total games played
- Training progress
- Win statistics

## See Full Documentation

Read `INTEGRATION_GUIDE.md` for complete details.

#!/usr/bin/env python3
"""
Setup script for deploying Checkers AI to cloud
"""
import shutil
import os
from pathlib import Path

def setup_deployment():
    print("=" * 60)
    print("  Checkers AI - Deployment Setup")
    print("=" * 60)
    print()
    
    root = Path(__file__).parent
    
    # Copy requirements.txt to root for easier deployment
    docs_req = root / "docs" / "requirements.txt"
    root_req = root / "requirements.txt"
    
    if docs_req.exists() and not root_req.exists():
        print("[1/4] Copying requirements.txt to root...")
        shutil.copy(docs_req, root_req)
        print("     ✓ requirements.txt copied")
    
    # Create .gitignore if it doesn't exist
    gitignore = root / ".gitignore"
    if not gitignore.exists():
        print("[2/4] Creating .gitignore...")
        gitignore_content = """
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv/
venv/
ENV/
env/

# Data
data/
*.db
*.sqlite

# Model checkpoints
checkpoints/
*.pth

# IDEs
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
        """.strip()
        gitignore.write_text(gitignore_content)
        print("     ✓ .gitignore created")
    
    # Create runtime.txt for Python version
    runtime = root / "runtime.txt"
    if not runtime.exists():
        print("[3/4] Creating runtime.txt...")
        runtime.write_text("python-3.11.0\n")
        print("     ✓ runtime.txt created")
    
    print("[4/4] Checking deployment files...")
    print(f"     ✓ render.yaml: {'exists' if (root / 'render.yaml').exists() else 'MISSING'}")
    print(f"     ✓ Procfile: {'exists' if (root / 'Procfile').exists() else 'MISSING'}")
    print(f"     ✓ DEPLOYMENT.md: {'exists' if (root / 'DEPLOYMENT.md').exists() else 'MISSING'}")
    
    print()
    print("=" * 60)
    print("  Setup Complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print()
    print("1. Create GitHub repository:")
    print("   git init")
    print("   git add .")
    print("   git commit -m 'Initial commit'")
    print("   git remote add origin https://github.com/YOUR_USERNAME/checkers-ai.git")
    print("   git push -u origin main")
    print()
    print("2. Deploy backend:")
    print("   - Go to https://render.com")
    print("   - New → Blueprint")
    print("   - Connect your GitHub repo")
    print("   - Render auto-deploys using render.yaml")
    print()
    print("3. Point the frontend at your deployed API (no code edits needed):")
    print("   - If your frontend and API share the same origin, it auto-detects /api/*.")
    print("   - If you host frontend separately (e.g., GitHub Pages), inject the API base URL:")
    print("       <script>window.CHECKERS_AI_API_BASE_URL = 'https://YOUR-APP.onrender.com';</script>")
    print()
    print("4. Deploy frontend:")
    print("   - GitHub → Settings → Pages")
    print("   - Source: main branch, root directory")
    print("   - Visit: https://YOUR_USERNAME.github.io/checkers-ai/")
    print()
    print("Read README.md for updated deployment notes!")
    print()

if __name__ == "__main__":
    setup_deployment()

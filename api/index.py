import sys
import os

# Add the docs directory to the path so we can import the app
# Current file is in /api/index.py
# Docs is in /docs
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.main import app

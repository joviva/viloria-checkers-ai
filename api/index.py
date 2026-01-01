import os
import sys
import types

# Vercel/Serverless entrypoint.
#
# This repository has two different folders named "api":
# - /api        (this serverless function folder)
# - /docs/api   (the FastAPI application package)
#
# When Python imports "api.index", it creates/uses the top-level "api" package
# from /api first, which prevents "from api.main import app" from resolving to
# /docs/api/main.py.
#
# Fix: add /docs to sys.path and temporarily bind the "api" package to /docs/api.

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_DOCS_DIR = os.path.join(_REPO_ROOT, "docs")
_DOCS_API_DIR = os.path.join(_DOCS_DIR, "api")

if _DOCS_DIR not in sys.path:
	sys.path.insert(0, _DOCS_DIR)

docs_api_pkg = types.ModuleType("api")
docs_api_pkg.__path__ = [_DOCS_API_DIR]
sys.modules["api"] = docs_api_pkg

from api.main import app  # noqa: E402

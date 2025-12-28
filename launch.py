#!/usr/bin/env python3
"""
Single-file launcher for Checkers AI
Run this and everything starts automatically!
"""
import subprocess
import sys
import os
import time
import webbrowser
from pathlib import Path
import threading

def print_banner():
    print("=" * 50)
    print("  Checkers AI - Automatic Launcher")
    print("=" * 50)
    print()

def kill_existing_services():
    """Kill any existing services on port 8000"""
    print("[0/2] Checking for existing services...")
    try:
        if sys.platform == "win32":
            # Windows: Find and kill process on port 8000
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | "
                 "Select-Object -ExpandProperty OwningProcess -Unique | "
                 "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"],
                capture_output=True,
                text=True
            )
            print("     Cleaned up existing services")
            time.sleep(2)
        else:
            # Linux/Mac: lsof and kill
            subprocess.run(["lsof", "-ti:8000", "|", "xargs", "kill", "-9"], 
                         shell=True, stderr=subprocess.DEVNULL)
            time.sleep(1)
    except:
        pass  # No existing services found

def get_python_executable():
    """Get the virtual environment Python executable"""
    venv_path = Path(__file__).parent / ".venv"
    if sys.platform == "win32":
        python_exe = venv_path / "Scripts" / "python.exe"
    else:
        python_exe = venv_path / "bin" / "python"
    
    if not python_exe.exists():
        print(f"ERROR: Virtual environment not found at {venv_path}")
        print("Please create it first:")
        print("  python -m venv .venv")
        print("  .venv\\Scripts\\activate")
        print("  pip install -r docs/requirements.txt")
        sys.exit(1)
    
    return str(python_exe)

def start_api_server(python_exe):
    """Start the FastAPI server in a subprocess"""
    print("[1/2] Starting API server on http://localhost:8000...")
    docs_dir = Path(__file__).parent / "docs"
    
    cmd = [
        python_exe,
        "-m", "uvicorn",
        "api.main:app",
        "--host", "0.0.0.0",
        "--port", "8000"
    ]
    
    process = subprocess.Popen(
        cmd,
        cwd=str(docs_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Wait for server to start
    time.sleep(3)
    
    if process.poll() is not None:
        print("ERROR: API server failed to start")
        return None
    
    print("     API server started successfully!")
    return process

def start_learning_worker(python_exe):
    """Start the learning worker in a subprocess"""
    print("[2/2] Starting learning worker...")
    docs_dir = Path(__file__).parent / "docs"
    
    cmd = [
        python_exe,
        "-m", "learning.worker"
    ]
    
    process = subprocess.Popen(
        cmd,
        cwd=str(docs_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Wait for worker to connect
    time.sleep(2)
    
    if process.poll() is not None:
        print("WARNING: Learning worker may have issues")
    else:
        print("     Learning worker started successfully!")
    
    return process

def monitor_process(process, name):
    """Monitor a subprocess and print its output"""
    try:
        for line in process.stdout:
            print(f"[{name}] {line.strip()}")
    except:
        pass

def open_game():
    """Open the game in the default browser"""
    print()
    print("Opening game in your browser...")
    game_path = Path(__file__).parent / "index.html"
    webbrowser.open(f"file:///{game_path.as_posix()}")
    print()
    print("=" * 50)
    print("  Game is ready!")
    print("=" * 50)
    print()
    print("Press Ctrl+C to stop all services")
    print()

def main():
    print_banner()
    
    # Kill existing services
    kill_existing_services()
    
    # Get Python executable
    python_exe = get_python_executable()
    
    # Start services
    api_process = start_api_server(python_exe)
    if not api_process:
        sys.exit(1)
    
    worker_process = start_learning_worker(python_exe)
    
    # Start monitoring threads
    api_monitor = threading.Thread(target=monitor_process, args=(api_process, "API"), daemon=True)
    api_monitor.start()
    
    if worker_process:
        worker_monitor = threading.Thread(target=monitor_process, args=(worker_process, "WORKER"), daemon=True)
        worker_monitor.start()
    
    # Open the game
    time.sleep(1)
    open_game()
    
    # Keep running and handle shutdown
    try:
        # Wait for processes
        api_process.wait()
    except KeyboardInterrupt:
        print()
        print("Shutting down services...")
        api_process.terminate()
        if worker_process:
            worker_process.terminate()
        
        # Wait for clean shutdown
        time.sleep(2)
        api_process.kill()
        if worker_process:
            worker_process.kill()
        
        print("All services stopped.")

if __name__ == "__main__":
    main()

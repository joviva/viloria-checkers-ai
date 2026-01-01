#!/usr/bin/env python3
"""
Auto-Launcher - Persistent service manager that auto-starts the game backend
Runs as a background service and ensures FastAPI + Learning Worker are always ready
"""
import subprocess
import sys
import os
import time
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import threading

class ServiceManager:
    def __init__(self):
        self.api_process = None
        self.worker_process = None
        self.python_exe = self._get_python_executable()
        self.auto_started = False
        
    def _get_python_executable(self):
        """Get the virtual environment Python executable"""
        venv_path = Path(__file__).parent / ".venv"
        if sys.platform == "win32":
            python_exe = venv_path / "Scripts" / "python.exe"
        else:
            python_exe = venv_path / "bin" / "python"
        
        if not python_exe.exists():
            raise FileNotFoundError(f"Virtual environment not found at {venv_path}")
        return str(python_exe)
    
    def ensure_services_running(self):
        """Auto-start services if they're not already running"""
        if self.are_services_running():
            return True
        
        return self.start_services()
    
    def are_services_running(self):
        """Check if both API and worker are running"""
        if self.api_process is None or self.api_process.poll() is not None:
            return False
        if self.worker_process is None or self.worker_process.poll() is not None:
            return False
        return True
    
    def start_services(self):
        """Start FastAPI server and learning worker"""
        if self.are_services_running():
            return True
        
        try:
            # Start FastAPI server
            docs_dir = Path(__file__).parent / "docs"
            cmd = [
                self.python_exe,
                "-m", "uvicorn",
                "api.main:app",
                "--host", "0.0.0.0",
                "--port", "8000"
            ]
            
            self.api_process = subprocess.Popen(
                cmd,
                cwd=str(docs_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            time.sleep(2)  # Wait for server to start
            
            # Start learning worker
            cmd = [self.python_exe, "-m", "learning.worker"]
            self.worker_process = subprocess.Popen(
                cmd,
                cwd=str(docs_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            self.auto_started = True
            return True
        except Exception as e:
            print(f"Error starting services: {e}")
            return False
    
    def stop_services(self):
        """Stop both services"""
        try:
            if self.api_process:
                self.api_process.terminate()
                time.sleep(1)
                if self.api_process.poll() is None:
                    self.api_process.kill()
                self.api_process = None
            
            if self.worker_process:
                self.worker_process.terminate()
                time.sleep(1)
                if self.worker_process.poll() is None:
                    self.worker_process.kill()
                self.worker_process = None
            
            return True
        except Exception as e:
            print(f"Error stopping services: {e}")
            return False
    
    def get_status(self):
        """Get current status of services"""
        api_running = self.api_process is not None and self.api_process.poll() is None
        worker_running = self.worker_process is not None and self.worker_process.poll() is None
        
        return {
            "api_running": api_running,
            "worker_running": worker_running,
            "both_running": api_running and worker_running,
            "auto_started": self.auto_started
        }

# Global manager
service_manager = ServiceManager()

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        if self.path == "/start":
            # Auto-start services if not running
            if not service_manager.are_services_running():
                service_manager.start_services()
            
            result = service_manager.get_status()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        
        elif self.path == "/stop":
            service_manager.stop_services()
            result = {"status": "stopped"}
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        
        elif self.path == "/status":
            result = service_manager.get_status()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    
    def log_message(self, format, *args):
        """Suppress logging"""
        pass

def run_launcher():
    """Run the auto-launcher HTTP server"""
    try:
        server = HTTPServer(("localhost", 9000), RequestHandler)
        print("=" * 60)
        print("  CHECKERS GAME - AUTO LAUNCHER")
        print("=" * 60)
        print()
        print("✓ Launcher running on http://localhost:9000")
        print("✓ Services will auto-start when needed")
        print()
        print("Endpoints:")
        print("  /start   - Auto-start services if needed")
        print("  /stop    - Stop services")
        print("  /status  - Check service status")
        print()
        print("Press Ctrl+C to stop\n")
        
        # Auto-start services on launch
        print("Initializing services...")
        if service_manager.start_services():
            print("✓ Services started successfully!")
            print()
        else:
            print("✗ Could not start services")
            print()
        
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        service_manager.stop_services()
        print("Services stopped.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_launcher()

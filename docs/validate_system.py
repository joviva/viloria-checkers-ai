"""
Startup validation script for Checkers AI system.
Verifies all components are properly configured before running.
"""

import os
import sys

def check_python_version():
    """Verify Python version is 3.8+"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("ERROR: Python 3.8+ required. Current version: {}.{}.{}".format(
            version.major, version.minor, version.micro))
        return False
    print(f"SUCCESS: Python version: {version.major}.{version.minor}.{version.micro}")
    return True

def check_dependencies():
    """Verify required packages are installed"""
    required_packages = [
        ('fastapi', 'FastAPI'),
        ('uvicorn', 'Uvicorn'),
        ('torch', 'PyTorch'),
        ('numpy', 'NumPy'),
        ('pydantic', 'Pydantic'),
        ('aiosqlite', 'aiosqlite'),
    ]
    
    missing = []
    for package, name in required_packages:
        try:
            __import__(package)
            print(f"SUCCESS: {name} installed")
        except ImportError:
            print(f"ERROR: {name} NOT installed")
            missing.append(package)
    
    if missing:
        print(f"\nERROR: Missing packages: {', '.join(missing)}")
        print("Install with: pip install -r requirements.txt")
        return False
    return True

def check_directories():
    """Verify required directories exist"""
    import config
    
    dirs_to_check = [
        (config.CHECKPOINT_DIR, "Checkpoints"),
        (config.DATA_DIR, "Data"),
    ]
    
    all_ok = True
    for dir_path, name in dirs_to_check:
        if os.path.exists(dir_path):
            print(f"SUCCESS: {name} directory exists: {dir_path}")
        else:
            print(f"WARNING: {name} directory missing: {dir_path}")
            try:
                os.makedirs(dir_path, exist_ok=True)
                print(f"  SUCCESS: Created directory")
            except Exception as e:
                print(f"  ERROR: Could not create directory: {e}")
                all_ok = False
    
    return all_ok

def check_config():
    """Verify configuration is valid"""
    try:
        import config
        print("SUCCESS: Configuration loaded successfully")
        print(f"  Model path: {config.MODEL_PATH}")
        print(f"  Database path: {config.REPLAY_DB_PATH}")
        print(f"  Batch size: {config.BATCH_SIZE}")
        print(f"  Learning rate: {config.LEARNING_RATE}")
        return True
    except Exception as e:
        print(f"ERROR: Configuration error: {e}")
        return False

def check_database():
    """Verify database can be initialized"""
    try:
        from model.replay_buffer import ReplayBuffer
        rb = ReplayBuffer()
        stats = rb.get_stats()
        print(f"SUCCESS: Database operational")
        print(f"  Games: {stats['total_games']}")
        print(f"  Trajectories: {stats['total_trajectories']}")
        return True
    except Exception as e:
        print(f"ERROR: Database error: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_model():
    """Verify model can be loaded"""
    try:
        from model.network import PolicyValueNet
        import torch
        
        model = PolicyValueNet()
        # Test forward pass
        test_input = torch.randn(1, 5, 10, 10)
        with torch.no_grad():
            policy, value = model(test_input)
        
        print(f"SUCCESS: Model architecture valid")
        print(f"  Policy output shape: {policy.shape}")
        print(f"  Value output shape: {value.shape}")
        return True
    except Exception as e:
        print(f"ERROR: Model error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all validation checks"""
    print("[VALIDATION] Checkers AI - Startup Validation")
    print("=" * 50)
    
    checks = [
        ("Python Version", check_python_version),
        ("Dependencies", check_dependencies),
        ("Directories", check_directories),
        ("Configuration", check_config),
        ("Database", check_database),
        ("Model", check_model),
    ]
    
    results = []
    for name, check_func in checks:
        print(f"\n[CHECK] Checking {name}...")
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"ERROR: Unexpected error in {name}: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 50)
    print("[SUMMARY] Validation Summary")
    print("=" * 50)
    
    all_passed = True
    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status} - {name}")
        if not result:
            all_passed = False
    
    print("=" * 50)
    if all_passed:
        print("[SUCCESS] All checks passed! System ready to run.")
        print("\nTo start the system:")
        print("  1. Start API: uvicorn api.main:app --host 0.0.0.0 --port 8000")
        print("  2. Start worker: python -m learning.worker")
        print("  3. Open game in browser and enable API mode")
        return 0
    else:
        print("[FAIL] Some checks failed. Please fix the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

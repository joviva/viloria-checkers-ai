import os
import sys

# Add docs directory to path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), "docs")))

from learning.selfplay import SelfPlayGenerator
from model.replay_buffer import ReplayBuffer

def test_selfplay_upgrade():
    print("Testing Upgraded SelfPlayGenerator...")
    
    # Initialize replay buffer (mock/in-memory if possible, but standard is fine for dry run)
    rb = ReplayBuffer()
    
    # Initialize generator
    # It should look for checkpoints/model.pth by default
    generator = SelfPlayGenerator(replay_buffer=rb)
    
    # Generate 1 game
    print("\nStarting game generation...")
    results = generator.generate_games(num_games=1, max_moves=50, exploration_epsilon=0.1)
    
    if results and len(results) > 0:
        game = results[0]
        print(f"SUCCESS: Generated game {game['game_id']}")
        print(f"Winner: {game['winner']}")
        print(f"Moves recorded for Black: {game['moves']}")
        
        # Verify network was used (implicit if no error and it printed 'SelfPlayGenerator loaded model')
        return True
    else:
        print("FAIL: No games generated")
        return False

if __name__ == "__main__":
    success = test_selfplay_upgrade()
    sys.exit(0 if success else 1)

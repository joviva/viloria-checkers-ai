import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from model.network import PolicyValueNet
from model.encoder import encode_state, encode_move
from model.replay_buffer import ReplayBuffer
import time
import os

class A2CLearner:
    """
    Advantage Actor-Critic (A2C) learning algorithm for checkers AI.
    Implements online reinforcement learning from real games.
    
    Uses separate models for inference and training to prevent race conditions.
    """
    
    def __init__(self, 
                 model_path: str = "checkpoints/model.pth",
                 learning_rate: float = 1e-4,
                 gamma: float = 0.99,
                 value_loss_coef: float = 0.5,
                 entropy_coef: float = 0.01,
                 max_grad_norm: float = 0.5,
                 max_loss_threshold: float = 10.0):
        
        self.model_path = model_path
        self.gamma = gamma
        self.value_loss_coef = value_loss_coef
        self.entropy_coef = entropy_coef
        self.max_grad_norm = max_grad_norm
        self.max_loss_threshold = max_loss_threshold
        
        # CRITICAL: Separate models to prevent race conditions
        # model_training: Only used for learning (backprop)
        # model_live: Only used for inference (no gradients)
        self.model_training = PolicyValueNet()
        self.model_live = PolicyValueNet()  # Will be synced from training
        self.optimizer = optim.Adam(self.model_training.parameters(), lr=learning_rate)
        
        # Learning control
        self.learning_enabled = True
        self.learning_paused = False
        
        # Load existing model if available
        self._load_model()
        
        # Initialize replay buffer
        self.replay_buffer = ReplayBuffer()
        
        # Training statistics
        self.training_steps = 0
        self.total_loss_history = []
        self.policy_loss_history = []
        self.value_loss_history = []
        self.avg_loss_window = []
        
    def _load_model(self):
        """Load model from checkpoint if it exists."""
        if os.path.exists(self.model_path):
            try:
                checkpoint = torch.load(self.model_path, weights_only=False)
                # Load into both training and live models
                self.model_training.load_state_dict(checkpoint['model_state_dict'])
                self.model_live.load_state_dict(checkpoint['model_state_dict'])
                self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
                self.training_steps = checkpoint.get('training_steps', 0)
                
                # Set models to appropriate modes
                self.model_training.train()
                self.model_live.eval()
                
                print(f"Loaded model from {self.model_path} (step {self.training_steps})")
            except Exception as e:
                print(f"Error loading model: {e}")
                print("Starting with fresh model")
        else:
            print("No existing model found. Starting fresh.")
            self.model_training.train()
            self.model_live.eval()
    
    def save_model(self):
        """Save model checkpoint (saves the training model)."""
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        torch.save({
            'model_state_dict': self.model_training.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'training_steps': self.training_steps,
            'policy_loss': np.mean(self.policy_loss_history[-100:]) if self.policy_loss_history else 0,
            'value_loss': np.mean(self.value_loss_history[-100:]) if self.value_loss_history else 0,
        }, self.model_path)
        print(f"Model saved to {self.model_path}")
    
    def _check_model_health(self) -> bool:
        """
        HARDENING: Check if the training model is healthy before syncing.
        Prevents corrupted models from affecting inference.
        
        Returns:
            True if model passes health checks, False otherwise
        """
        try:
            self.model_training.eval()
            
            # Create test input (dummy 10x10 board)
            test_input = torch.randn(1, 5, 10, 10)
            
            with torch.no_grad():
                policy, value = self.model_training(test_input)
                
                # Check for NaNs
                if torch.isnan(policy).any() or torch.isnan(value).any():
                    print("WARNING: Model health check FAILED: NaN detected")
                    return False
                
                # Check if policy sums to ~1
                policy_sum = policy.sum().item()
                if not (0.99 < policy_sum < 1.01):
                    print(f"WARNING: Model health check FAILED: Policy sum = {policy_sum}")
                    return False
                
                # Check if value is in valid range
                if not (-1.1 < value.item() < 1.1):
                    print(f"WARNING: Model health check FAILED: Value = {value.item()}")
                    return False
            
            self.model_training.train()
            return True
            
        except Exception as e:
            print(f"WARNING: Model health check FAILED: {e}")
            return False
    
    def sync_models(self):
        """
        CRITICAL: Sync training model weights to live model.
        Only call this after successful training and health checks.
        """
        # Health check before syncing
        if not self._check_model_health():
            print("ERROR: Skipping model sync due to failed health check")
            return False
        
        # Sync weights
        self.model_live.load_state_dict(self.model_training.state_dict())
        self.model_live.eval()
        print("SUCCESS: Models synced successfully")
        return True
    
    def get_live_model(self):
        """Get the model that should be used for inference."""
        return self.model_live
    
    def pause_learning(self):
        """HARDENING: Pause learning without stopping gameplay."""
        self.learning_paused = True
        print("[PAUSED] Learning paused")
    
    def resume_learning(self):
        """Resume learning."""
        self.learning_paused = False
        print("[RESUMED] Learning resumed")
    
    def compute_returns(self, rewards, dones, values, next_values):
        """
        Compute n-step returns and advantages using GAE (Generalized Advantage Estimation).
        
        Args:
            rewards: List of rewards
            dones: List of done flags
            values: List of state values
            next_values: List of next state values
            
        Returns:
            returns: Discounted returns
            advantages: Advantages for policy gradient
        """
        returns = []
        advantages = []
        
        # Calculate returns and advantages
        for i in range(len(rewards)):
            if dones[i]:
                # Terminal state
                ret = rewards[i]
                adv = rewards[i] - values[i]
            else:
                # Non-terminal state
                ret = rewards[i] + self.gamma * next_values[i]
                adv = rewards[i] + self.gamma * next_values[i] - values[i]
            
            returns.append(ret)
            advantages.append(adv)
        
        return torch.tensor(returns, dtype=torch.float32), \
               torch.tensor(advantages, dtype=torch.float32)
    
    def train_on_trajectories(self, batch_size: int = 32):
        """
        Train the model on a batch of trajectories from the replay buffer.
        
        Uses mixed sampling (80% recent, 20% historical) to prevent catastrophic forgetting.
        
        Args:
            batch_size: Number of trajectories to sample for training
            
        Returns:
            Training statistics
        """
        # CRITICAL: Use mixed sampling for stability
        # 80% recent games (learn from current strategy)
        # 20% historical games (prevent forgetting good behaviors)
        trajectories = self.replay_buffer.get_mixed_trajectories(
            batch_size=batch_size,
            recent_ratio=0.8,
            player="black"
        )
        
        if len(trajectories) < batch_size:
            print(f"Not enough trajectories for training ({len(trajectories)}/{batch_size})")
            return None
        
        # Prepare batch data
        states = []
        actions = []
        rewards = []
        next_states = []
        dones = []
        
        for traj in trajectories:
            states.append(encode_state(traj['board_state']))
            
            # Encode action
            action_dict = traj['action']
            action_idx = encode_move(
                action_dict['from'][0], action_dict['from'][1],
                action_dict['to'][0], action_dict['to'][1]
            )
            actions.append(action_idx)
            
            rewards.append(traj['reward'])
            next_states.append(encode_state(traj['next_state']))
            dones.append(traj['done'])
        
        # Convert to tensors
        states_tensor = torch.tensor(np.array(states), dtype=torch.float32)
        actions_tensor = torch.tensor(actions, dtype=torch.long)
        rewards_tensor = torch.tensor(rewards, dtype=torch.float32)
        next_states_tensor = torch.tensor(np.array(next_states), dtype=torch.float32)
        dones_tensor = torch.tensor(dones, dtype=torch.bool)
        
        # CRITICAL: Use training model only (never the live model)
        self.model_training.train()
        policy_logits, values = self.model_training(states_tensor)
        _, next_values = self.model_training(next_states_tensor)
        
        # Compute returns and advantages
        returns, advantages = self.compute_returns(
            rewards_tensor.tolist(),
            dones_tensor.tolist(),
            values.squeeze().tolist(),
            next_values.squeeze().tolist()
        )
        
        # Normalize advantages
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
        
        # Policy loss (negative log probability weighted by advantage)
        log_probs = torch.log(policy_logits + 1e-8)
        selected_log_probs = log_probs[range(len(actions)), actions_tensor]
        policy_loss = -(selected_log_probs * advantages).mean()
        
        # Value loss (MSE between predicted value and return)
        value_loss = nn.MSELoss()(values.squeeze(), returns)
        
        # Entropy bonus (encourage exploration)
        entropy = -(policy_logits * log_probs).sum(dim=1).mean()
        
        # Total loss
        total_loss = policy_loss + self.value_loss_coef * value_loss - self.entropy_coef * entropy
        
        # Backward pass
        self.optimizer.zero_grad()
        total_loss.backward()
        
        # Gradient clipping
        nn.utils.clip_grad_norm_(self.model_training.parameters(), self.max_grad_norm)
        
        self.optimizer.step()
        
        # Update statistics
        self.training_steps += 1
        self.total_loss_history.append(total_loss.item())
        self.policy_loss_history.append(policy_loss.item())
        self.value_loss_history.append(value_loss.item())
        self.avg_loss_window.append(total_loss.item())
        
        # Keep only last 100 losses for averaging
        if len(self.avg_loss_window) > 100:
            self.avg_loss_window.pop(0)
        
        # HARDENING: Kill switch - pause learning if loss explodes
        avg_recent_loss = np.mean(self.avg_loss_window)
        if avg_recent_loss > self.max_loss_threshold:
            print(f"WARNING: Average loss ({avg_recent_loss:.2f}) exceeds threshold ({self.max_loss_threshold})")
            self.pause_learning()
        
        return {
            'total_loss': total_loss.item(),
            'policy_loss': policy_loss.item(),
            'value_loss': value_loss.item(),
            'entropy': entropy.item(),
            'training_steps': self.training_steps,
            'avg_recent_loss': avg_recent_loss
        }
    
    def train_loop(self, training_interval: int = 60, batch_size: int = 32, 
                   save_interval: int = 10):
        """
        Continuous training loop that runs in the background.
        
        Args:
            training_interval: Seconds between training iterations
            batch_size: Batch size for training
            save_interval: Save model every N training iterations
        """
        import signal
        
        # Handle graceful shutdown
        def signal_handler(sig, frame):
            print("\n[SHUTDOWN] Received shutdown signal. Saving model...")
            self.save_model()
            raise SystemExit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        print("Starting A2C training loop...")
        print(f"Training interval: {training_interval}s, Batch size: {batch_size}")
        iteration = 0
        consecutive_errors = 0
        max_consecutive_errors = 5
        
        while True:
            try:
                # Check if learning is paused
                if self.learning_paused:
                    print("[PAUSED] Learning paused. Waiting...")
                    time.sleep(training_interval)
                    continue
                
                # Check if we have enough data
                stats = self.replay_buffer.get_stats()
                print(f"\nReplay buffer stats: {stats}")
                
                if stats['total_trajectories'] >= batch_size:
                    # Train on batch
                    train_stats = self.train_on_trajectories(batch_size)
                    
                    if train_stats:
                        iteration += 1
                        consecutive_errors = 0  # Reset error counter on success
                        print(f"Training iteration {iteration}:")
                        print(f"  Total loss: {train_stats['total_loss']:.4f}")
                        print(f"  Policy loss: {train_stats['policy_loss']:.4f}")
                        print(f"  Value loss: {train_stats['value_loss']:.4f}")
                        print(f"  Entropy: {train_stats['entropy']:.4f}")
                        print(f"  Avg recent loss: {train_stats.get('avg_recent_loss', 0):.4f}")
                        
                        # CRITICAL: Sync models after successful training
                        if self.sync_models():
                            # Save model periodically (only after successful sync)
                            if iteration % save_interval == 0:
                                self.save_model()
                        else:
                            print("WARNING: Model sync failed, not saving checkpoint")
                else:
                    print(f"Waiting for more data... ({stats['total_trajectories']}/{batch_size} trajectories)")
                
                # Wait before next iteration
                time.sleep(training_interval)
                
            except KeyboardInterrupt:
                print("\nTraining interrupted by user. Saving model...")
                self.save_model()
                break
            except SystemExit:
                # Graceful shutdown from signal handler
                break
            except Exception as e:
                consecutive_errors += 1
                print(f"WARNING: Error in training loop ({consecutive_errors}/{max_consecutive_errors}): {e}")
                import traceback
                traceback.print_exc()
                
                if consecutive_errors >= max_consecutive_errors:
                    print(f"ERROR: Too many consecutive errors ({max_consecutive_errors}). Stopping training loop.")
                    print("Saving current model state before exit...")
                    try:
                        self.save_model()
                    except:
                        print("WARNING: Could not save model")
                    break
                
                # Wait before retrying
                time.sleep(training_interval)


def process_finished_games():
    """
    Main worker function for processing finished games and training the model.
    This runs as a background service.
    """
    learner = A2CLearner()
    
    # CRITICAL: Connect learner to AI module so it uses the live model
    # Import here to avoid circular import issues
    try:
        import sys
        import os
        # Add parent directory to path if needed
        parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)
        
        from api import ai
        ai.set_learner(learner)
        print("[OK] Learner connected to API module")
    except ImportError as e:
        print(f"WARNING: Could not import AI module - running in standalone mode: {e}")
    
    learner.train_loop(training_interval=60, batch_size=32, save_interval=10)


if __name__ == "__main__":
    process_finished_games()

import torch
import torch.nn as nn
import torch.nn.functional as F

class PolicyValueNet(nn.Module):
    """
    Policy-Value Network for 10x10 Checkers AI using A2C.
    
    Architecture:
    - Input: (batch, 5, 10, 10) - 5 channels for piece representation
    - Shared convolutional layers for feature extraction
    - Policy head: outputs action probabilities
    - Value head: outputs state value estimation
    """
    
    def __init__(self, board_size=10, num_actions=400):
        super().__init__()
        
        self.board_size = board_size
        self.num_actions = num_actions  # 50 playable squares * 8 directions
        
        # Shared convolutional layers
        self.conv1 = nn.Conv2d(5, 64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(64)
        
        self.conv2 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(128)
        
        self.conv3 = nn.Conv2d(128, 128, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm2d(128)
        
        # Residual blocks
        self.res1 = ResidualBlock(128)
        self.res2 = ResidualBlock(128)
        
        # Policy head
        self.policy_conv = nn.Conv2d(128, 32, kernel_size=1)
        self.policy_bn = nn.BatchNorm2d(32)
        self.policy_fc = nn.Linear(32 * board_size * board_size, num_actions)
        
        # Value head
        self.value_conv = nn.Conv2d(128, 16, kernel_size=1)
        self.value_bn = nn.BatchNorm2d(16)
        self.value_fc1 = nn.Linear(16 * board_size * board_size, 256)
        self.value_fc2 = nn.Linear(256, 1)
        
    def forward(self, x):
        """
        Forward pass through the network.
        
        Args:
            x: Input tensor of shape (batch, 5, 10, 10)
            
        Returns:
            policy: Action probabilities of shape (batch, num_actions)
            value: State value estimation of shape (batch, 1)
        """
        # Shared layers
        x = F.relu(self.bn1(self.conv1(x)))
        x = F.relu(self.bn2(self.conv2(x)))
        x = F.relu(self.bn3(self.conv3(x)))
        
        # Residual blocks
        x = self.res1(x)
        x = self.res2(x)
        
        # Policy head
        policy = F.relu(self.policy_bn(self.policy_conv(x)))
        policy = policy.view(policy.size(0), -1)
        policy = self.policy_fc(policy)
        policy = F.softmax(policy, dim=1)
        
        # Value head
        value = F.relu(self.value_bn(self.value_conv(x)))
        value = value.view(value.size(0), -1)
        value = F.relu(self.value_fc1(value))
        value = torch.tanh(self.value_fc2(value))
        
        return policy, value
    
    def get_action_probs(self, state, legal_moves=None, temperature=1.0):
        """
        Get action probabilities for a given state.
        
        Args:
            state: Board state tensor
            legal_moves: List of legal move indices (optional)
            temperature: Sampling temperature for exploration
            
        Returns:
            Action probabilities
        """
        with torch.no_grad():
            policy, _ = self.forward(state)
            
            if legal_moves is not None:
                # Mask illegal moves
                mask = torch.zeros_like(policy)
                mask[:, legal_moves] = 1.0
                policy = policy * mask
                
                # Renormalize
                policy = policy / (policy.sum(dim=1, keepdim=True) + 1e-8)
            
            # Apply temperature
            if temperature != 1.0:
                policy = torch.pow(policy, 1.0 / temperature)
                policy = policy / (policy.sum(dim=1, keepdim=True) + 1e-8)
            
            return policy
    
    def get_value(self, state):
        """
        Get state value estimation.
        
        Args:
            state: Board state tensor
            
        Returns:
            State value
        """
        with torch.no_grad():
            _, value = self.forward(state)
            return value


class ResidualBlock(nn.Module):
    """Residual block for deeper feature extraction."""
    
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(channels)
        
    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += residual
        out = F.relu(out)
        return out

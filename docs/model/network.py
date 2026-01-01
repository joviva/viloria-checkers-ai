import torch
import torch.nn as nn
import torch.nn.functional as F

class SpatialAttention(nn.Module):
    """
    Spatial attention mechanism for highlighting important board regions.
    Helps the network focus on critical squares (threats, capture opportunities).
    """
    def __init__(self, channels):
        super().__init__()
        self.conv = nn.Conv2d(channels, 1, kernel_size=1)
        
    def forward(self, x):
        attention_map = torch.sigmoid(self.conv(x))
        return x * attention_map


class ResidualBlock(nn.Module):
    """Enhanced residual block with batch normalization."""
    
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


class AdvancedPolicyValueNet(nn.Module):
    """
    ENHANCED Architecture for 10x10 Checkers AI.
    
    Improvements over base network:
    - Deeper feature extraction (5 ResBlocks instead of 2)
    - Spatial attention for king movement patterns
    - Auxiliary prediction heads for structured learning
    - Better capacity for complex tactical patterns
    
    Architecture:
    - Input: (batch, 5, 10, 10) - 5 channels for piece representation
    - Deep residual tower with attention
    - Policy head: outputs action probabilities (2500 actions)
    - Value head: outputs state value estimation
    - Material head: predicts material balance (auxiliary)
    - Threat head: predicts threat map (auxiliary)
    """
    
    def __init__(self, board_size=10, num_actions=2500):
        super().__init__()
        
        self.board_size = board_size
        self.num_actions = num_actions
        
        # Input projection (5 -> 128 channels)
        self.input_conv = nn.Conv2d(5, 128, kernel_size=3, padding=1)
        self.input_bn = nn.BatchNorm2d(128)
        
        # Deep residual tower (5 blocks for better depth)
        self.res_tower = nn.Sequential(*[
            ResidualBlock(128) for _ in range(5)
        ])
        
        # Spatial attention module (for long-range king patterns)
        self.attention = SpatialAttention(128)
        
        # Policy head (action selection)
        self.policy_conv = nn.Conv2d(128, 32, kernel_size=1)
        self.policy_bn = nn.BatchNorm2d(32)
        self.policy_fc = nn.Linear(32 * board_size * board_size, num_actions)
        
        # Value head (position evaluation)
        self.value_conv = nn.Conv2d(128, 16, kernel_size=1)
        self.value_bn = nn.BatchNorm2d(16)
        self.value_fc1 = nn.Linear(16 * board_size * board_size, 256)
        self.value_fc2 = nn.Linear(256, 1)
        
        # === AUXILIARY HEADS for Structured Learning ===
        
        # Material prediction head (helps value estimation)
        # Predicts: [behind, even, ahead] in material
        self.material_head = nn.Linear(256, 3)
        
        # Threat detection head (helps policy prioritize defense)
        # Outputs: (batch, 1, 10, 10) threat map
        self.threat_head = nn.Conv2d(128, 1, kernel_size=1)
        
    def forward(self, x, return_aux=False):
        """
        Forward pass through the network.
        
        Args:
            x: Input tensor of shape (batch, 5, 10, 10)
            return_aux: If True, also return auxiliary predictions
            
        Returns:
            If return_aux=False:
                policy: Action probabilities (batch, num_actions)
                value: State value estimation (batch, 1)
            If return_aux=True:
                policy, value, material_pred, threat_map
        """
        # Feature extraction
        x = F.relu(self.input_bn(self.input_conv(x)))
        
        # Deep residual tower
        x = self.res_tower(x)
        
        # Apply spatial attention
        x = self.attention(x)
        
        # Policy head
        policy = F.relu(self.policy_bn(self.policy_conv(x)))
        policy = policy.view(policy.size(0), -1)
        policy = self.policy_fc(policy)
        policy = F.softmax(policy, dim=1)
        
        # Value head
        value = F.relu(self.value_bn(self.value_conv(x)))
        value_flat = value.view(value.size(0), -1)
        value_features = F.relu(self.value_fc1(value_flat))
        value = torch.tanh(self.value_fc2(value_features))
        
        if not return_aux:
            return policy, value
        
        # Auxiliary predictions (used during training)
        material_pred = F.softmax(self.material_head(value_features), dim=1)
        threat_map = torch.sigmoid(self.threat_head(x))
        
        return policy, value, material_pred, threat_map
    
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
        """Get state value estimation."""
        with torch.no_grad():
            _, value = self.forward(state)
            return value


# Keep old network for backwards compatibility
class PolicyValueNet(nn.Module):
    """
    Original Policy-Value Network (kept for compatibility).
    Use AdvancedPolicyValueNet for new training.
    """
    
    def __init__(self, board_size=10, num_actions=2500):
        super().__init__()
        
        self.board_size = board_size
        self.num_actions = num_actions
        
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
        """Forward pass through the network."""
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
        """Get action probabilities for a given state."""
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
        """Get state value estimation."""
        with torch.no_grad():
            _, value = self.forward(state)
            return value

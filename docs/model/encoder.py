import numpy as np
import json

def encode_state(board_state: str):
    """
    Encode the 10x10 checkers board state into a tensor format for the neural network.
    
    Board state is expected to be a JSON string representing the board.
    Each square can be:
    - null (empty)
    - {"color": "red"/"black", "king": true/false}
    
    Output shape: (5, 10, 10) representing:
    - Channel 0: Red pieces
    - Channel 1: Red kings
    - Channel 2: Black pieces
    - Channel 3: Black kings
    - Channel 4: Valid play squares (dark squares on checkerboard)
    """
    try:
        board = json.loads(board_state)
    except:
        # If board_state is already a list/dict, use it directly
        board = board_state
    
    # Initialize tensor with 5 channels for 10x10 board
    state_tensor = np.zeros((5, 10, 10), dtype=np.float32)
    
    for row in range(10):
        for col in range(10):
            # Mark valid play squares (dark squares)
            if (row + col) % 2 == 1:
                state_tensor[4, row, col] = 1.0
                
            # Encode pieces
            if board[row][col] is not None:
                piece = board[row][col]
                color = piece.get('color')
                is_king = piece.get('king', False)
                
                if color == 'red':
                    if is_king:
                        state_tensor[1, row, col] = 1.0  # Red king
                    else:
                        state_tensor[0, row, col] = 1.0  # Red piece
                elif color == 'black':
                    if is_king:
                        state_tensor[3, row, col] = 1.0  # Black king
                    else:
                        state_tensor[2, row, col] = 1.0  # Black piece
    
    return state_tensor


def decode_move(move_index: int, board_size: int = 10):
    """
    Decode a move index into from/to coordinates.
    
    For a 10x10 board, we have 50 playable squares.
    Each square can make moves to up to 4 directions (8 for kings).
    This gives us approximately 200-400 possible moves.
    
    We'll use a simplified encoding: move_index encodes both the from_square and direction.
    """
    # Get playable squares (dark squares only)
    playable_squares = []
    for row in range(board_size):
        for col in range(board_size):
            if (row + col) % 2 == 1:
                playable_squares.append((row, col))
    
    # Each square has up to 8 possible moves (4 directions * variable distance for kings)
    # Simplified: just encode as from_square * 8 + direction
    from_square_idx = move_index // 8
    direction_idx = move_index % 8
    
    if from_square_idx >= len(playable_squares):
        return None
    
    from_row, from_col = playable_squares[from_square_idx]
    
    # Direction mapping (forward-left, forward-right, back-left, back-right for both colors)
    directions = [
        (-1, -1), (-1, 1), (1, -1), (1, 1),  # Single moves
        (-2, -2), (-2, 2), (2, -2), (2, 2)   # Capture moves
    ]
    
    if direction_idx >= len(directions):
        return None
    
    dr, dc = directions[direction_idx]
    to_row, to_col = from_row + dr, from_col + dc
    
    if 0 <= to_row < board_size and 0 <= to_col < board_size:
        return {
            'from': (from_row, from_col),
            'to': (to_row, to_col)
        }
    
    return None


def encode_move(from_row: int, from_col: int, to_row: int, to_col: int, board_size: int = 10):
    """
    Encode a move into a single index for the policy network output.
    """
    # Get playable squares
    playable_squares = []
    for row in range(board_size):
        for col in range(board_size):
            if (row + col) % 2 == 1:
                playable_squares.append((row, col))
    
    # Find from_square index
    try:
        from_square_idx = playable_squares.index((from_row, from_col))
    except ValueError:
        return -1
    
    # Calculate direction
    dr = to_row - from_row
    dc = to_col - from_col
    
    # Map direction to index
    directions = [
        (-1, -1), (-1, 1), (1, -1), (1, 1),
        (-2, -2), (-2, 2), (2, -2), (2, 2)
    ]
    
    try:
        direction_idx = directions.index((dr, dc))
    except ValueError:
        # For longer king moves, normalize to single step
        normalized_dr = dr // abs(dr) if dr != 0 else 0
        normalized_dc = dc // abs(dc) if dc != 0 else 0
        try:
            direction_idx = directions.index((normalized_dr, normalized_dc))
        except ValueError:
            return -1
    
    return from_square_idx * 8 + direction_idx

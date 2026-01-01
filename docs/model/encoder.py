import numpy as np
import json


def _get_playable_squares(board_size: int = 10):
    playable_squares = []
    for row in range(board_size):
        for col in range(board_size):
            if (row + col) % 2 == 1:
                playable_squares.append((row, col))
    return playable_squares

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

    Updated encoding (v2): action index encodes (from_playable_square, to_playable_square).
    This supports flying kings because different landing squares map to different indices.
    """
    playable_squares = _get_playable_squares(board_size)
    squares_count = len(playable_squares)
    if squares_count == 0:
        return None

    from_square_idx = move_index // squares_count
    to_square_idx = move_index % squares_count

    if from_square_idx < 0 or from_square_idx >= squares_count:
        return None
    if to_square_idx < 0 or to_square_idx >= squares_count:
        return None

    from_row, from_col = playable_squares[from_square_idx]
    to_row, to_col = playable_squares[to_square_idx]

    return {
        'from': (from_row, from_col),
        'to': (to_row, to_col)
    }


def encode_move(from_row: int, from_col: int, to_row: int, to_col: int, board_size: int = 10):
    """
    Encode a move into a single index for the policy network output.
    """
    playable_squares = _get_playable_squares(board_size)
    squares_count = len(playable_squares)
    if squares_count == 0:
        return -1

    try:
        from_square_idx = playable_squares.index((from_row, from_col))
        to_square_idx = playable_squares.index((to_row, to_col))
    except ValueError:
        return -1

    return from_square_idx * squares_count + to_square_idx

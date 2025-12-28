from flask import Flask, request, jsonify
import sys
import os

# Add docs to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.ai import infer_move

app = Flask(__name__)

@app.route('/api/move', methods=['POST', 'OPTIONS'])
def handler():
    # CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    
    # Handle OPTIONS for CORS
    if request.method == 'OPTIONS':
        return ('', 200, headers)
    
    # Handle POST request
    try:
        data = request.get_json()
        board_state = data.get('board_state')
        
        if not board_state:
            return jsonify({'error': 'board_state is required'}), 400, headers
        
        # Get AI move
        result = infer_move(board_state)
        return jsonify(result), 200, headers
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers

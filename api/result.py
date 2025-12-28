from flask import Flask, request, jsonify
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.ai import record_game

app = Flask(__name__)

@app.route('/api/result', methods=['POST', 'OPTIONS'])
def handler():
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    
    if request.method == 'OPTIONS':
        return ('', 200, headers)
    
    try:
        data = request.get_json()
        result = record_game(
            data.get('winner'),
            data.get('move_count', 0),
            data.get('trajectory', [])
        )
        return jsonify(result), 200, headers
    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers

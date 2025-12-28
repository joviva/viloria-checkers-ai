from flask import Flask, jsonify
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.ai import get_stats

app = Flask(__name__)

@app.route('/', methods=['GET', 'OPTIONS'])
@app.route('/api/stats', methods=['GET', 'OPTIONS'])
def index():
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    
    try:
        stats = get_stats()
        return jsonify(stats), 200, headers
    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers

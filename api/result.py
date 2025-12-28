# Vercel Serverless Function for Game Results
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.ai import record_game

def handler(request):
    """Vercel serverless function handler"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }
    
    # Handle OPTIONS for CORS
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    # Handle POST request
    if request.method == 'POST':
        try:
            # Parse request body
            body = json.loads(request.body) if isinstance(request.body, str) else request.body
            
            result = record_game(
                body.get('winner'),
                body.get('move_count', 0),
                body.get('trajectory', [])
            )
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(result)
            }
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': str(e)})
            }
    
    return {
        'statusCode': 405,
        'headers': headers,
        'body': json.dumps({'error': 'Method not allowed'})
    }

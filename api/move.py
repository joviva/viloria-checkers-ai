# Vercel Serverless Function for AI Move
import json
import sys
import os

# Add docs to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.ai import infer_move

def handler(request):
    """Vercel serverless function handler"""
    # CORS headers
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
            board_state = body.get('board_state')
            
            if not board_state:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'error': 'board_state is required'})
                }
            
            # Get AI move
            result = infer_move(board_state)
            
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

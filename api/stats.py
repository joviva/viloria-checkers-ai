# Vercel Serverless Function for Stats
import json
import sys
import os

# Add docs to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'docs'))

from api.ai import get_stats

def handler(request):
    """Vercel serverless function handler"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    
    # Handle GET request
    if request.method == 'GET':
        try:
            stats = get_stats()
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(stats)
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

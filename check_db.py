import sqlite3

conn = sqlite3.connect('data/replay_buffer.db')
cursor = conn.cursor()

# Count unique games
cursor.execute('SELECT COUNT(DISTINCT game_id) FROM games')
unique_games = cursor.fetchone()[0]
print(f'Unique games: {unique_games}')

# Count total records
cursor.execute('SELECT COUNT(*) FROM games')
total_records = cursor.fetchone()[0]
print(f'Total game records: {total_records}')

if unique_games != total_records:
    print(f'\nWARNING: DUPLICATE DETECTED! {total_records - unique_games} duplicate records!')

# Get column names
cursor.execute('PRAGMA table_info(games)')
columns = [col[1] for col in cursor.fetchall()]
print(f'\nTable columns: {columns}')

# Show last 10 games
cursor.execute('SELECT game_id, winner, total_moves FROM games ORDER BY rowid DESC LIMIT 10')
print('\nLast 10 games:')
for row in cursor.fetchall():
    print(f'  {row}')

# Check for actual duplicates
cursor.execute('''
    SELECT game_id, COUNT(*) as count 
    FROM games 
    GROUP BY game_id 
    HAVING count > 1
''')
duplicates = cursor.fetchall()
if duplicates:
    print('\n[ERROR] Duplicate game_ids found:')
    for game_id, count in duplicates:
        print(f'  {game_id}: {count} times')
        cursor.execute('SELECT winner, total_moves FROM games WHERE game_id = ?', (game_id,))
        for row in cursor.fetchall():
            print(f'    -> {row}')

conn.close()

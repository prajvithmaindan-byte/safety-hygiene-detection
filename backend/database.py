import sqlite3
import datetime
import os

# Always resolve database path relative to database.py directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "violations.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        image_path TEXT,
        confidence REAL
    )''')
    conn.commit()
    conn.close()

def insert_violation(vtype, image_path, confidence):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # Store standard forward-slash web-friendly path if image_path is provided
    web_image_path = image_path.replace("\\", "/") if image_path else None
    c.execute("INSERT INTO violations (type, timestamp, image_path, confidence) VALUES (?,?,?,?)",
              (vtype, ts, web_image_path, confidence))
    conn.commit()
    conn.close()

def get_all_violations():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM violations ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    return rows

def get_hourly_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # strftime expects '%H:00' format and handles standard timestamp format
    c.execute("""SELECT strftime('%H:00', timestamp) as hour, type, COUNT(*) as count
                 FROM violations GROUP BY hour, type ORDER BY hour""")
    rows = c.fetchall()
    conn.close()
    return rows

def get_violation_type_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT type, COUNT(*) FROM violations GROUP BY type")
    rows = c.fetchall()
    conn.close()
    return rows

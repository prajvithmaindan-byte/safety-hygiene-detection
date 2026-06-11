import sqlite3
import datetime
import os

# Always resolve database path relative to database.py directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "violations.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    return conn


def init_db():
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER DEFAULT 0,
            type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            image_path TEXT,
            confidence REAL
        )''')

        # Try to add person_id column if it doesn't exist (for existing DBs)
        try:
            c.execute("ALTER TABLE violations ADD COLUMN person_id INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass  # Column already exists

        conn.commit()
        conn.close()
        print("Database initialised successfully")
    except Exception as e:
        print(f"Database init error: {e}")


def insert_violation(person_id, vtype, image_path, confidence):
    try:
        conn = get_connection()
        c = conn.cursor()
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # Store standard forward-slash web-friendly path if image_path is provided
        web_image_path = image_path.replace("\\", "/") if image_path else None
        c.execute(
            "INSERT INTO violations (person_id, type, timestamp, image_path, confidence) VALUES (?,?,?,?,?)",
            (person_id, vtype, ts, web_image_path, confidence)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Insert violation error: {e}")


def get_all_violations():
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT id, person_id, type, timestamp, image_path, confidence FROM violations ORDER BY id DESC")
        rows = c.fetchall()
        conn.close()
        return rows
    except Exception as e:
        print(f"Get violations error: {e}")
        return []


def get_hourly_stats():
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("""
            SELECT strftime('%H:00', timestamp) as hour,
                   type, COUNT(*) as count
            FROM violations
            GROUP BY hour, type
            ORDER BY hour
        """)
        rows = c.fetchall()
        conn.close()
        return rows
    except Exception as e:
        print(f"Hourly stats error: {e}")
        return []


def get_violation_type_stats():
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT type, COUNT(*) FROM violations GROUP BY type")
        rows = c.fetchall()
        conn.close()
        return rows
    except Exception as e:
        print(f"Type stats error: {e}")
        return []


def delete_violation(violation_id):
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("DELETE FROM violations WHERE id = ?", (violation_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Delete violation error: {e}")


def delete_all_violations():
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("DELETE FROM violations")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Delete all error: {e}")

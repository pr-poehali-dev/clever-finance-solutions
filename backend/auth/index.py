import json
import os
import hashlib
import secrets
import psycopg2

COLORS = ["#4a7c4a","#7c4a4a","#4a4a7c","#7c7c4a","#4a7c7c","#7c4a7c","#6a5a3a","#3a5a6a"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def handler(event: dict, context) -> dict:
    """Регистрация, вход, профиль пользователей Link"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id"}, "body": ""}

    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    path = event.get("path", "")
    method = event.get("httpMethod", "")
    body = json.loads(event.get("body") or "{}")
    params = event.get("queryStringParameters") or {}

    conn = get_conn()
    cur = conn.cursor()

    if path.endswith("/register") and method == "POST":
        username = body.get("username", "").strip().lower()
        display_name = body.get("display_name", "").strip()
        password = body.get("password", "")
        if not username or not password or not display_name:
            conn.close()
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Заполните все поля"})}
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            conn.close()
            return {"statusCode": 409, "headers": headers, "body": json.dumps({"error": "Никнейм уже занят"})}
        color = COLORS[hash(username) % len(COLORS)]
        cur.execute(
            "INSERT INTO users (username, display_name, password_hash, avatar_color, status) VALUES (%s, %s, %s, %s, 'online') RETURNING id",
            (username, display_name, hash_password(password), color)
        )
        user_id = cur.fetchone()[0]
        token = secrets.token_hex(32)
        cur.execute("INSERT INTO user_sessions (user_id, token) VALUES (%s, %s)", (user_id, token))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"user_id": user_id, "token": token, "username": username, "display_name": display_name, "avatar_color": color, "status": "online"})}

    if path.endswith("/login") and method == "POST":
        username = body.get("username", "").strip().lower()
        password = body.get("password", "")
        cur.execute("SELECT id, display_name, avatar_color, bio FROM users WHERE username = %s AND password_hash = %s", (username, hash_password(password)))
        row = cur.fetchone()
        if not row:
            conn.close()
            return {"statusCode": 401, "headers": headers, "body": json.dumps({"error": "Неверный логин или пароль"})}
        token = secrets.token_hex(32)
        cur.execute("INSERT INTO user_sessions (user_id, token) VALUES (%s, %s)", (row[0], token))
        cur.execute("UPDATE users SET status='online' WHERE id=%s", (row[0],))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"user_id": row[0], "token": token, "username": username, "display_name": row[1], "avatar_color": row[2] or "#4a7c4a", "bio": row[3] or "", "status": "online"})}

    if path.endswith("/profile") and method == "POST":
        user_id = body.get("user_id")
        status = body.get("status")
        bio = body.get("bio")
        if status:
            cur.execute("UPDATE users SET status=%s WHERE id=%s", (status, user_id))
        if bio is not None:
            cur.execute("UPDATE users SET bio=%s WHERE id=%s", (bio, user_id))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    if path.endswith("/logout") and method == "POST":
        user_id = body.get("user_id")
        cur.execute("UPDATE users SET status='offline' WHERE id=%s", (user_id,))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    conn.close()
    return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Not found"})}

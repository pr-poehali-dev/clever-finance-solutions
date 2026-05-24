import json
import os
import hashlib
import secrets
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def handler(event: dict, context) -> dict:
    """Регистрация и вход пользователей"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id"}, "body": ""}

    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    path = event.get("path", "")
    method = event.get("httpMethod", "")
    body = json.loads(event.get("body") or "{}")

    conn = get_conn()
    cur = conn.cursor()

    if path.endswith("/register") and method == "POST":
        username = body.get("username", "").strip().lower()
        display_name = body.get("display_name", "").strip()
        password = body.get("password", "")

        if not username or not password or not display_name:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Заполните все поля"})}

        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cur.fetchone():
            conn.close()
            return {"statusCode": 409, "headers": headers, "body": json.dumps({"error": "Никнейм уже занят"})}

        cur.execute(
            "INSERT INTO users (username, display_name, password_hash) VALUES (%s, %s, %s) RETURNING id",
            (username, display_name, hash_password(password))
        )
        user_id = cur.fetchone()[0]
        token = secrets.token_hex(32)
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"user_id": user_id, "token": token, "username": username, "display_name": display_name})}

    if path.endswith("/login") and method == "POST":
        username = body.get("username", "").strip().lower()
        password = body.get("password", "")

        cur.execute("SELECT id, display_name FROM users WHERE username = %s AND password_hash = %s", (username, hash_password(password)))
        row = cur.fetchone()
        conn.close()
        if not row:
            return {"statusCode": 401, "headers": headers, "body": json.dumps({"error": "Неверный логин или пароль"})}

        token = secrets.token_hex(32)
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"user_id": row[0], "token": token, "username": username, "display_name": row[1]})}

    conn.close()
    return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Not found"})}

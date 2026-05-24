import json
import os
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """Управление друзьями: поиск, добавление, принятие, список"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id"}, "body": ""}

    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    path = event.get("path", "")
    method = event.get("httpMethod", "")
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    user_id = int(params.get("user_id") or body.get("user_id") or 0)

    conn = get_conn()
    cur = conn.cursor()

    # Поиск пользователя по никнейму
    if path.endswith("/search") and method == "GET":
        q = params.get("q", "").strip().lower()
        cur.execute("SELECT id, username, display_name FROM users WHERE username LIKE %s AND id != %s LIMIT 10", (f"%{q}%", user_id))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps([{"id": r[0], "username": r[1], "display_name": r[2]} for r in rows])}

    # Отправить запрос в друзья
    if path.endswith("/request") and method == "POST":
        target_id = body.get("target_id")
        cur.execute("SELECT id FROM friendships WHERE (requester_id=%s AND receiver_id=%s) OR (requester_id=%s AND receiver_id=%s)", (user_id, target_id, target_id, user_id))
        if cur.fetchone():
            conn.close()
            return {"statusCode": 409, "headers": headers, "body": json.dumps({"error": "Запрос уже существует"})}
        cur.execute("INSERT INTO friendships (requester_id, receiver_id, status) VALUES (%s, %s, 'pending')", (user_id, target_id))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    # Принять запрос
    if path.endswith("/accept") and method == "POST":
        friendship_id = body.get("friendship_id")
        cur.execute("UPDATE friendships SET status='accepted' WHERE id=%s AND receiver_id=%s", (friendship_id, user_id))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    # Список друзей
    if path.endswith("/list") and method == "GET":
        cur.execute("""
            SELECT f.id, f.status,
                CASE WHEN f.requester_id = %s THEN f.receiver_id ELSE f.requester_id END as friend_id,
                CASE WHEN f.requester_id = %s THEN 'sent' ELSE 'received' END as direction
            FROM friendships f
            WHERE f.requester_id = %s OR f.receiver_id = %s
        """, (user_id, user_id, user_id, user_id))
        rows = cur.fetchall()
        friend_ids = [r[2] for r in rows]
        users = {}
        if friend_ids:
            cur.execute("SELECT id, username, display_name FROM users WHERE id = ANY(%s)", (friend_ids,))
            for u in cur.fetchall():
                users[u[0]] = {"username": u[1], "display_name": u[2]}
        conn.close()
        result = [{"friendship_id": r[0], "status": r[1], "direction": r[3], "user": users.get(r[2], {})} for r in rows]
        return {"statusCode": 200, "headers": headers, "body": json.dumps(result)}

    conn.close()
    return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Not found"})}

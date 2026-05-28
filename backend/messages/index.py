import json
import os
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """Личные сообщения: history и send через action в query/body."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id"}, "body": ""}

    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    method = event.get("httpMethod", "")
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    action = params.get("action") or body.get("action", "")

    conn = get_conn()
    cur = conn.cursor()

    if action == "history":
        user_id = int(params.get("user_id") or body.get("user_id") or 0)
        friend_id = int(params.get("friend_id") or body.get("friend_id") or 0)
        cur.execute("""
            SELECT m.id, m.sender_id, m.content, m.created_at, u.display_name
            FROM messages m JOIN users u ON u.id = m.sender_id
            WHERE (m.sender_id=%s AND m.receiver_id=%s) OR (m.sender_id=%s AND m.receiver_id=%s)
            ORDER BY m.created_at ASC LIMIT 100
        """, (user_id, friend_id, friend_id, user_id))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps([
            {"id": r[0], "sender_id": r[1], "content": r[2], "created_at": r[3].isoformat(), "display_name": r[4]}
            for r in rows
        ])}

    if action == "send" and method == "POST":
        sender_id = body.get("sender_id")
        receiver_id = body.get("receiver_id")
        content = body.get("content", "").strip()
        if not content:
            conn.close()
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Пустое сообщение"})}
        cur.execute("INSERT INTO messages (sender_id, receiver_id, content) VALUES (%s, %s, %s) RETURNING id, created_at", (sender_id, receiver_id, content))
        row = cur.fetchone()
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"id": row[0], "created_at": row[1].isoformat()})}

    conn.close()
    return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Неизвестное действие"})}

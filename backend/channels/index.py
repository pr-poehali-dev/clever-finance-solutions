import json
import os
import secrets
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """Каналы: create, join, list, members, history, send через action."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id"}, "body": ""}

    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    method = event.get("httpMethod", "")
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    action = params.get("action") or body.get("action", "")

    conn = get_conn()
    cur = conn.cursor()

    if action == "create" and method == "POST":
        user_id = body.get("user_id")
        name = body.get("name", "").strip()
        description = body.get("description", "").strip()
        ch_type = body.get("type", "text")
        if not name:
            conn.close()
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Укажите название"})}
        invite_code = secrets.token_hex(8)
        cur.execute(
            "INSERT INTO channels (name, description, owner_id, invite_code, type) VALUES (%s, %s, %s, %s, %s) RETURNING id, invite_code",
            (name, description, user_id, invite_code, ch_type)
        )
        row = cur.fetchone()
        cur.execute("INSERT INTO channel_members (channel_id, user_id) VALUES (%s, %s)", (row[0], user_id))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"id": row[0], "invite_code": row[1], "name": name})}

    if action == "join" and method == "POST":
        user_id = body.get("user_id")
        invite_code = body.get("invite_code", "").strip()
        cur.execute("SELECT id, name FROM channels WHERE invite_code = %s", (invite_code,))
        ch = cur.fetchone()
        if not ch:
            conn.close()
            return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Канал не найден"})}
        cur.execute("INSERT INTO channel_members (channel_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (ch[0], user_id))
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"id": ch[0], "name": ch[1]})}

    if action == "list":
        user_id = int(params.get("user_id") or body.get("user_id") or 0)
        cur.execute("""
            SELECT c.id, c.name, c.description, c.invite_code, c.owner_id,
                (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) as member_count,
                COALESCE(c.type, 'text') as type,
                COALESCE(c.category, 'Основное') as category
            FROM channels c JOIN channel_members cm ON cm.channel_id = c.id
            WHERE cm.user_id = %s ORDER BY c.created_at DESC
        """, (user_id,))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps([
            {"id": r[0], "name": r[1], "description": r[2], "invite_code": r[3],
             "owner_id": r[4], "member_count": r[5], "type": r[6], "category": r[7]}
            for r in rows
        ])}

    if action == "history":
        channel_id = int(params.get("channel_id") or body.get("channel_id") or 0)
        cur.execute("""
            SELECT m.id, m.sender_id, m.content, m.created_at, u.display_name
            FROM channel_messages m JOIN users u ON u.id = m.sender_id
            WHERE m.channel_id = %s ORDER BY m.created_at ASC LIMIT 100
        """, (channel_id,))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps([
            {"id": r[0], "sender_id": r[1], "content": r[2], "created_at": r[3].isoformat(), "display_name": r[4]}
            for r in rows
        ])}

    if action == "send" and method == "POST":
        channel_id = body.get("channel_id")
        sender_id = body.get("sender_id")
        content = body.get("content", "").strip()
        if not content:
            conn.close()
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Пустое сообщение"})}
        cur.execute("INSERT INTO channel_messages (channel_id, sender_id, content) VALUES (%s, %s, %s) RETURNING id, created_at", (channel_id, sender_id, content))
        row = cur.fetchone()
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"id": row[0], "created_at": row[1].isoformat()})}

    if action == "members":
        channel_id = int(params.get("channel_id") or body.get("channel_id") or 0)
        cur.execute("""
            SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
            FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = %s
        """, (channel_id,))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps([
            {"id": r[0], "username": r[1], "display_name": r[2], "avatar_color": r[3], "status": r[4]} for r in rows
        ])}

    conn.close()
    return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Неизвестное действие"})}

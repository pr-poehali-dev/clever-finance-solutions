import json
import os
import psycopg2

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    """WebRTC сигнальный сервер: обмен offer/answer/ice между участниками"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Auth-Token, X-Session-Id"}, "body": ""}

    headers = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    path = event.get("path", "")
    method = event.get("httpMethod", "")
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")

    conn = get_conn()
    cur = conn.cursor()

    # Отправить сигнал (offer / answer / ice-candidate)
    if path.endswith("/send") and method == "POST":
        room_id = body.get("room_id")
        sender_id = body.get("sender_id")
        target_id = body.get("target_id")
        signal_type = body.get("signal_type")
        payload = json.dumps(body.get("payload", {}))
        cur.execute(
            "INSERT INTO webrtc_signals (room_id, sender_id, target_id, signal_type, payload) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (room_id, sender_id, target_id, signal_type, payload)
        )
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    # Получить сигналы для меня (polling)
    if path.endswith("/poll") and method == "GET":
        room_id = params.get("room_id")
        user_id = int(params.get("user_id", 0))
        since_id = int(params.get("since_id", 0))
        cur.execute("""
            SELECT id, sender_id, target_id, signal_type, payload, created_at
            FROM webrtc_signals
            WHERE room_id = %s AND (target_id = %s OR target_id IS NULL) AND sender_id != %s AND id > %s
            ORDER BY id ASC LIMIT 50
        """, (room_id, user_id, user_id, since_id))
        rows = cur.fetchall()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps([
            {"id": r[0], "sender_id": r[1], "target_id": r[2], "signal_type": r[3],
             "payload": json.loads(r[4]), "created_at": r[5].isoformat()}
            for r in rows
        ])}

    # Участники комнаты (heartbeat)
    if path.endswith("/join") and method == "POST":
        room_id = body.get("room_id")
        sender_id = body.get("sender_id")
        payload = json.dumps({"action": "join"})
        cur.execute(
            "INSERT INTO webrtc_signals (room_id, sender_id, target_id, signal_type, payload) VALUES (%s, %s, NULL, 'join', %s)",
            (room_id, sender_id, payload)
        )
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    if path.endswith("/leave") and method == "POST":
        room_id = body.get("room_id")
        sender_id = body.get("sender_id")
        payload = json.dumps({"action": "leave"})
        cur.execute(
            "INSERT INTO webrtc_signals (room_id, sender_id, target_id, signal_type, payload) VALUES (%s, %s, NULL, 'leave', %s)",
            (room_id, sender_id, payload)
        )
        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"ok": True})}

    conn.close()
    return {"statusCode": 404, "headers": headers, "body": json.dumps({"error": "Not found"})}

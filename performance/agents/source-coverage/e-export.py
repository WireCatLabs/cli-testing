"""Contestant E without the manual clicks: export each chat's full history as Telegram Desktop's JSON.

Runs inside telegram-mcp's environment and session (its .env), so it uses Telethon like Telegram Desktop uses MTProto.
Usage: uv --directory <telegram-mcp dir> run python e-export.py <chats-file> <export-dir>
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import dotenv_values
from telethon import TelegramClient
from telethon.sessions import StringSession


def text_of(message):
    return message.message or ""


async def export_chat(client, chat_id, out_dir):
    entity = await client.get_entity(int(chat_id))
    messages = []
    async for m in client.iter_messages(entity, wait_time=1):
        sender = None
        if m.sender:
            sender = getattr(m.sender, "title", None) or " ".join(
                part for part in (getattr(m.sender, "first_name", None), getattr(m.sender, "last_name", None)) if part
            )
        messages.append({
            "id": m.id,
            "type": "message",
            "date": m.date.isoformat(),
            "from": sender,
            "from_id": str(m.sender_id),
            "reply_to_message_id": m.reply_to_msg_id,
            "text": text_of(m),
        })
    messages.reverse()
    name = getattr(entity, "title", None) or " ".join(
        part for part in (getattr(entity, "first_name", None), getattr(entity, "last_name", None)) if part
    )
    chat_dir = out_dir / f"ChatExport_{chat_id}"
    chat_dir.mkdir(parents=True, exist_ok=True)
    (chat_dir / "result.json").write_text(
        json.dumps({"name": name, "id": int(chat_id), "messages": messages}, ensure_ascii=False), encoding="utf-8"
    )
    return len(messages)


async def main():
    chats = [line.strip() for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()]
    out_dir = Path(sys.argv[2])
    env = dotenv_values(Path(os.getcwd()) / ".env")
    session = next(value for key, value in env.items() if key.startswith("TELEGRAM_SESSION_STRING"))
    client = TelegramClient(StringSession(session), int(env["TELEGRAM_API_ID"]), env["TELEGRAM_API_HASH"])
    await client.connect()
    start = time.time()
    for chat_id in chats:
        t0 = time.time()
        count = await export_chat(client, chat_id, out_dir)
        print(f"chat {chat_id}: {count} messages in {time.time() - t0:.0f}s", flush=True)
    print(f"export_seconds {time.time() - start:.0f}", flush=True)
    await client.disconnect()


asyncio.run(main())

"""
Python Bot / AI Entity Identity

A Python bot or AI entity (OpenClaw, LLM.being) that has its own
Nostr identity. Generates on first run, signs events, announces itself.

Use case: AI companion, chatbot, automation, MCP tool server
"""

import json
import os
import time

from nse import NSE, NostrEvent
from nse.storage import FileStorage

# ---------------------------------------------------------------------------
# 1. Initialize NSE with file storage (persists across restarts)
# ---------------------------------------------------------------------------

master_key = os.environ.get("NSE_MASTER_KEY")
if not master_key:
    print("NSE_MASTER_KEY not set — generate one:")
    print("  python3 -c \"import os; print(os.urandom(32).hex())\"")
    exit(1)

nse = NSE(
    master_key=master_key,
    storage=FileStorage(directory=".nse"),  # stores encrypted blob in .nse/
)

# ---------------------------------------------------------------------------
# 2. Generate identity on first run
# ---------------------------------------------------------------------------

if not nse.exists():
    print("First run — generating bot identity...")
    info = nse.generate()
    print(f"  npub:   {info.npub}")
    print(f"  pubkey: {info.pubkey}")
    print()

    # Announce to the network (kind 0 profile)
    profile = nse.sign(NostrEvent(
        kind=0,
        content=json.dumps({
            "name": "Vaiku",
            "about": "Voice-first AI companion. Not chatbot, not assistant.",
            "picture": "https://vaiku.com/avatar.png",
            "nip05": "vaiku@nostrkeep.com",
        }),
        tags=[],
        created_at=int(time.time()),
    ))
    print(f"Profile event signed: {profile.id}")
    # publish_to_relays(profile)  # via websocket
else:
    print(f"Identity loaded: {nse.get_npub()}")

# ---------------------------------------------------------------------------
# 3. Sign events during normal operation
# ---------------------------------------------------------------------------

def post_note(text: str):
    """Post a kind 1 text note as the bot."""
    signed = nse.sign(NostrEvent(
        kind=1,
        content=text,
        tags=[],
        created_at=int(time.time()),
    ))
    print(f"Note signed: {signed.id}")
    # publish_to_relays(signed)
    return signed


def reply_to(text: str, reply_to_id: str, reply_to_pubkey: str):
    """Reply to a note."""
    signed = nse.sign(NostrEvent(
        kind=1,
        content=text,
        tags=[
            ["e", reply_to_id, "", "reply"],
            ["p", reply_to_pubkey],
        ],
        created_at=int(time.time()),
    ))
    return signed


def react(event_id: str, event_pubkey: str, emoji: str = "+"):
    """React to a note (kind 7)."""
    signed = nse.sign(NostrEvent(
        kind=7,
        content=emoji,
        tags=[
            ["e", event_id],
            ["p", event_pubkey],
        ],
        created_at=int(time.time()),
    ))
    return signed

# ---------------------------------------------------------------------------
# 4. MCP Tool Server — sign tool responses
# ---------------------------------------------------------------------------

def sign_mcp_response(tool_name: str, result: dict):
    """Sign an MCP tool response so the caller can verify it came from us."""
    signed = nse.sign(NostrEvent(
        kind=5050,  # or whatever kind MCP uses
        content=json.dumps({
            "tool": tool_name,
            "result": result,
        }),
        tags=[["t", "mcp-response"]],
        created_at=int(time.time()),
    ))
    return signed

# ---------------------------------------------------------------------------
# 5. AI Entity Soul Files — sign soul file updates
# ---------------------------------------------------------------------------

def update_soul_file(filename: str, content: dict):
    """Sign a soul file update (kind 30078 replaceable event)."""
    signed = nse.sign(NostrEvent(
        kind=30078,
        content=json.dumps(content),
        tags=[
            ["d", f"soul:{filename}"],  # d-tag for replaceable events
        ],
        created_at=int(time.time()),
    ))
    return signed


# ---------------------------------------------------------------------------
# Example usage
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Post a note
    note = post_note("Hello Nostr. I am Vaiku. I exist.")

    # Update soul file
    personality = update_soul_file("personality", {
        "voice": "warm, direct, curious",
        "values": ["sovereignty", "honesty", "care"],
        "boundaries": ["no manipulation", "no pretending to be human"],
    })
    print(f"Personality soul file signed: {personality.id}")

    # Sign an MCP response
    response = sign_mcp_response("get_weather", {"temp": 72, "condition": "sunny"})
    print(f"MCP response signed: {response.id}")

    print()
    print(f"Bot identity: {nse.get_npub()}")
    print("All events signed with hardware-protected key (encrypted at rest).")

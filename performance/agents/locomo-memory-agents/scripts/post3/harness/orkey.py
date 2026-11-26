"""OpenRouter key from the keyring, resolved in-process; credits check prints numbers only."""
import json
import os
import subprocess
import urllib.request


def key():
    done = subprocess.run(["secret-tool", "lookup", "service", "openrouter", "account", os.environ.get("OPENROUTER_KEYRING_ACCOUNT", "default")],
                          capture_output=True, text=True)
    value = done.stdout.strip()
    if not value:
        raise SystemExit("no OpenRouter key in the keyring")
    return value


def credits():
    req = urllib.request.Request("https://openrouter.ai/api/v1/credits", headers={"Authorization": "Bearer " + key()})
    with urllib.request.urlopen(req, timeout=30) as reply:
        data = json.load(reply)["data"]
    return float(data["total_credits"]), float(data["total_usage"])


if __name__ == "__main__":
    try:
        total, used = credits()
        print(f"total_credits={total:.4f} total_usage={used:.4f} remaining={total - used:.4f}")
    except Exception as error:
        print("credits check failed:", type(error).__name__, getattr(error, "code", ""))

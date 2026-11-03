"""Loaded by the benchmark's Hermes runs only (hermes_env puts this folder on PYTHONPATH); ~/.hermes is not changed.

Hermes 0.21.0 treats every sk-ant- key that is not sk-ant-api as a Claude subscription token. An sk-ant-usr Console
key then goes out as Claude Code (the claude-code-20250219 beta and a "You are Claude Code" system block), and the
API answers HTTP 400 "credit balance is too low": the owner's promotional credit does not pay for that traffic.
"""

from agent import anthropic_credentials


def _is_oauth_token(key):
    if not key:
        return False
    if key.startswith(("sk-ant-api", "sk-ant-usr")):
        return False
    return key.startswith(("sk-ant-", "eyJ", "cc-"))


# Swapping the code object reaches the copies other modules bound with `from ... import _is_oauth_token`.
anthropic_credentials._is_oauth_token.__code__ = _is_oauth_token.__code__

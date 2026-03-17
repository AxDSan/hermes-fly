import builtins
import os
import sys
from pathlib import Path

_ORIGINAL_IMPORT = builtins.__import__
_PATCH_SENTINEL = "_hermes_fly_zai_patch_applied"


def _read_env_file_value(name: str) -> str:
    hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")).expanduser()
    env_path = hermes_home / ".env"
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == name:
                return value.strip()
    except Exception:
        return ""
    return ""


def _zai_thinking_disabled() -> bool:
    value = os.environ.get("HERMES_ZAI_THINKING", "").strip()
    if not value:
        value = _read_env_file_value("HERMES_ZAI_THINKING")
    return value.lower() == "disabled"


def _looks_like_zai(agent: object) -> bool:
    provider = str(getattr(agent, "provider", "") or "").strip().lower()
    base_url = str(getattr(agent, "base_url", "") or "").strip().lower()
    model = str(getattr(agent, "model", "") or "").strip().lower()
    return (
        provider == "zai"
        or "api.z.ai" in base_url
        or "bigmodel.cn" in base_url
        or model.startswith("glm-")
    )


def _inject_disabled_thinking(kwargs: dict) -> None:
    extra_body = kwargs.get("extra_body")
    if not isinstance(extra_body, dict):
        extra_body = {}
        kwargs["extra_body"] = extra_body
    thinking = extra_body.get("thinking")
    if not isinstance(thinking, dict):
        extra_body["thinking"] = {"type": "disabled"}
        return
    thinking["type"] = "disabled"


def _patch_run_agent() -> None:
    module = sys.modules.get("run_agent")
    if module is None:
        return

    agent_cls = getattr(module, "AIAgent", None)
    if agent_cls is None or getattr(agent_cls, _PATCH_SENTINEL, False):
        return

    original = getattr(agent_cls, "_build_api_kwargs", None)
    if original is None:
        return

    def patched(self, api_messages):
        kwargs = original(self, api_messages)
        if _zai_thinking_disabled() and _looks_like_zai(self):
            kwargs = dict(kwargs)
            _inject_disabled_thinking(kwargs)
        return kwargs

    setattr(agent_cls, "_build_api_kwargs", patched)
    setattr(agent_cls, _PATCH_SENTINEL, True)


def _patched_import(name, globals=None, locals=None, fromlist=(), level=0):
    module = _ORIGINAL_IMPORT(name, globals, locals, fromlist, level)
    if name == "run_agent" or "run_agent" in sys.modules:
        _patch_run_agent()
    return module


if _zai_thinking_disabled():
    builtins.__import__ = _patched_import
    _patch_run_agent()

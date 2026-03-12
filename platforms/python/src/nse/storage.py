"""
Storage backends for NSE Python
"""

from typing import Optional


class MemoryStorage:
    """In-memory storage — for testing and ephemeral processes."""

    def __init__(self):
        self._store: dict[str, str] = {}

    def get(self, key: str) -> Optional[str]:
        return self._store.get(key)

    def put(self, key: str, value: str) -> None:
        self._store[key] = value

    def delete(self, key: str) -> None:
        self._store.pop(key, None)


class FileStorage:
    """File-based storage — simple persistence for server processes."""

    def __init__(self, directory: str = ".nse"):
        import os
        self._dir = directory
        os.makedirs(directory, exist_ok=True)

    def _path(self, key: str) -> str:
        import os
        # Sanitize key for filesystem
        safe_key = key.replace(":", "_").replace("/", "_")
        return os.path.join(self._dir, safe_key)

    def get(self, key: str) -> Optional[str]:
        import os
        path = self._path(key)
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            return f.read()

    def put(self, key: str, value: str) -> None:
        import os
        import stat
        path = self._path(key)
        # Write with restrictive permissions (owner-only) — key material
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, stat.S_IRUSR | stat.S_IWUSR)
        try:
            os.write(fd, value.encode("utf-8"))
        finally:
            os.close(fd)

    def delete(self, key: str) -> None:
        import os
        path = self._path(key)
        if os.path.exists(path):
            os.remove(path)

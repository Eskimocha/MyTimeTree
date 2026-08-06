"""Close-guard contract for portal UI (beforeunload / route leave).

Frontend should call ``GET /api/persistence/status`` and block close when
``can_close`` is false; offer flush via ``POST /api/persistence/flush``.
"""

from __future__ import annotations

from mytimetree.services.persistence import PersistenceGuard


def should_prompt_before_close(guard: PersistenceGuard) -> bool:
    """Return True when the UI must warn about unsaved drafts."""
    return not guard.can_close()

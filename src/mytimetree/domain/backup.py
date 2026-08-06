"""Backup artifact metadata."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

BackupKind = Literal["daily", "monthly_reconcile"]


@dataclass(frozen=True, slots=True)
class BackupArtifact:
    path: Path
    kind: BackupKind
    created_at: datetime | None = None
    filename: str = ""

    def __post_init__(self) -> None:
        if not self.filename:
            object.__setattr__(self, "filename", self.path.name)

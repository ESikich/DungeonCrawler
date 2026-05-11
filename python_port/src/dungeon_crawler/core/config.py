"""Configuration for the Python dungeon crawler core."""

from dataclasses import dataclass


@dataclass(slots=True)
class GameConfig:
    """Core gameplay configuration."""

    dungeon_width: int = 25
    dungeon_height: int = 17
    memory_reveal: float = 0.7

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.dungeon_width and 0 <= y < self.dungeon_height


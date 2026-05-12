"""Configuration for the Python dungeon crawler core."""

from dataclasses import dataclass


@dataclass(slots=True)
class GameConfig:
    """Core gameplay configuration."""

    dungeon_width: int = 25
    dungeon_height: int = 17
    memory_reveal: float = 0.7
    minutes_per_turn: int = 15
    day_start_minute: int = 6 * 60
    night_start_minute: int = 18 * 60

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.dungeon_width and 0 <= y < self.dungeon_height

"""Deterministic RNG wrapper for the Python core."""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any, TypeVar


T = TypeVar("T")


class Rng:
    """Injectable randomness source."""

    def __init__(self, seed: int | None = None) -> None:
        self.seed = seed
        self._random = random.Random(seed)

    def randint(self, min_value: int, max_value: int) -> int:
        return self._random.randint(min_value, max_value)

    def chance(self, probability: float) -> bool:
        return self._random.random() < probability

    def choice(self, values: Sequence[T]) -> T:
        if not values:
            raise IndexError("Cannot choose from an empty sequence")
        return self._random.choice(values)

    def get_state(self) -> object:
        return self._random.getstate()

    def set_state(self, state: object) -> None:
        self._random.setstate(_tuplify(state))


def _tuplify(value: Any) -> Any:
    if isinstance(value, list):
        return tuple(_tuplify(item) for item in value)
    return value

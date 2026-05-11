"""A small entity-component store for the Python port."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from .models import Position


@dataclass(slots=True)
class ECS:
    """Entity/component storage with a simple event queue."""

    _next_entity_id: int = 1
    _entities: set[int] = field(default_factory=set)
    _components: dict[str, dict[int, object]] = field(default_factory=dict)
    _event_queue: list[object] = field(default_factory=list)

    def create_entity(self) -> int:
        entity_id = self._next_entity_id
        self._next_entity_id += 1
        self._entities.add(entity_id)
        return entity_id

    def destroy_entity(self, entity_id: int) -> None:
        self._entities.discard(entity_id)
        for component_map in self._components.values():
            component_map.pop(entity_id, None)

    def add_component(self, entity_id: int, component_type: str, data: object) -> None:
        if entity_id not in self._entities:
            raise KeyError(f"Unknown entity {entity_id}")
        self._components.setdefault(component_type, {})[entity_id] = data

    def get_component(self, entity_id: int, component_type: str) -> object | None:
        return self._components.get(component_type, {}).get(entity_id)

    def has_component(self, entity_id: int, component_type: str) -> bool:
        return entity_id in self._components.get(component_type, {})

    def entities_with(self, component_types: Iterable[str]) -> list[int]:
        required = tuple(component_types)
        return [
            entity_id
            for entity_id in sorted(self._entities)
            if all(self.has_component(entity_id, component_type) for component_type in required)
        ]

    def entities_at(self, x: int, y: int) -> list[int]:
        matches: list[int] = []
        for entity_id in self.entities_with(["position"]):
            position = self.get_component(entity_id, "position")
            if isinstance(position, Position) and position.x == x and position.y == y:
                matches.append(entity_id)
        return matches

    def all_entities(self) -> list[int]:
        return sorted(self._entities)

    def next_entity_id(self) -> int:
        return self._next_entity_id

    def component_types(self) -> list[str]:
        return sorted(self._components)

    def components_for(self, component_type: str) -> dict[int, object]:
        return dict(self._components.get(component_type, {}))

    def restore(self, *, next_entity_id: int, entities: set[int], components: dict[str, dict[int, object]]) -> None:
        self._next_entity_id = next_entity_id
        self._entities = set(entities)
        self._components = {component_type: dict(values) for component_type, values in components.items()}
        self._event_queue.clear()

    def post_event(self, event: object) -> None:
        self._event_queue.append(event)

    def drain_events(self) -> list[object]:
        events = list(self._event_queue)
        self._event_queue.clear()
        return events

    def reset(self) -> None:
        self._next_entity_id = 1
        self._entities.clear()
        self._components.clear()
        self._event_queue.clear()

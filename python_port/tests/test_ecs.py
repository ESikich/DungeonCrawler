from dungeon_crawler.core.ecs import ECS
from dungeon_crawler.core.models import Position


def test_ecs_entity_component_queries_and_reset() -> None:
    ecs = ECS()
    entity_a = ecs.create_entity()
    entity_b = ecs.create_entity()

    ecs.add_component(entity_a, "position", Position(2, 3))
    ecs.add_component(entity_a, "name", "hero")
    ecs.add_component(entity_b, "position", Position(2, 3))

    assert ecs.get_component(entity_a, "name") == "hero"
    assert ecs.has_component(entity_a, "position") is True
    assert ecs.has_component(entity_b, "name") is False
    assert ecs.entities_with(["position"]) == [entity_a, entity_b]
    assert ecs.entities_at(2, 3) == [entity_a, entity_b]

    ecs.post_event({"type": "move"})
    assert ecs.drain_events() == [{"type": "move"}]
    assert ecs.drain_events() == []

    ecs.destroy_entity(entity_a)
    assert ecs.get_component(entity_a, "position") is None
    assert ecs.entities_with(["position"]) == [entity_b]

    ecs.reset()
    assert ecs.entities_with(["position"]) == []


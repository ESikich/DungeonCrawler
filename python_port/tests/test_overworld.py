from dungeon_crawler.core import tiles
from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import ForestReturnContext, Position, Progress, Vision


def test_new_game_starts_in_overworld_with_dungeon_entrance() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    vision = game.ecs.get_component(player_id, "vision")
    assert isinstance(vision, Vision)
    assert game.state.area == "overworld"
    assert game.state.floor == 0
    assert game.world.overworld_section == (0, 0)
    assert game.world.dungeon_entrance_position is not None
    assert vision.radius == 8
    assert len(vision.visible) == game.config.dungeon_width * game.config.dungeon_height
    assert vision.seen == vision.visible


def test_stepping_on_dungeon_entrance_enters_first_floor() -> None:
    game = Game()
    game.new_game(seed=6)
    _move_player_next_to_entrance(game)

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.state.area == "dungeon"
    assert game.state.floor == -1
    assert game.state.dungeon_max_depth == 1
    assert game.world.dungeon_grid[_player_position(game).y][_player_position(game).x].glyph == "<"
    assert game.world.messages[-1].text == "You enter the dungeon..."


def test_first_floor_up_stairs_returns_to_overworld() -> None:
    game = Game()
    game.new_game(seed=7)
    _move_player_next_to_entrance(game)
    game.dispatch(Action.move(1, 0))
    assert game.state.area == "dungeon"

    up_stairs = Position(_player_position(game).x, _player_position(game).y)
    _move_player_next_to(game, up_stairs)
    game.dispatch(Action.move(1, 0))

    assert game.state.area == "overworld"
    assert game.state.floor == 0
    assert game.world.dungeon_entrance_position is not None
    assert _visible_tile_count(game) == game.config.dungeon_width * game.config.dungeon_height
    assert game.world.messages[-1].text == "You climb back into the overworld."


def test_reentering_old_dungeon_keeps_original_max_depth() -> None:
    game = Game()
    game.new_game(seed=9)
    _move_player_next_to_entrance(game)
    game.dispatch(Action.move(1, 0))
    assert game.state.dungeon_max_depth == 1

    up_stairs = Position(_player_position(game).x, _player_position(game).y)
    _move_player_next_to(game, up_stairs)
    game.dispatch(Action.move(1, 0))
    assert game.state.area == "overworld"

    player_id = game.world.player_eid
    assert player_id is not None
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(progress, Progress)
    progress.level = 3
    _move_player_next_to_entrance(game)
    game.dispatch(Action.move(1, 0))

    assert game.state.area == "dungeon"
    assert game.state.dungeon_max_depth == 1
    assert game.world.stairs_position is None


def test_overworld_edge_movement_changes_and_caches_sections() -> None:
    game = Game()
    game.new_game(seed=8)
    player_position = _player_position(game)
    player_position.x = game.config.dungeon_width - 1
    player_position.y = game.config.dungeon_height // 2
    game.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.state.area == "overworld"
    assert game.world.overworld_section == (1, 0)
    assert _player_position(game).x == 0
    assert (0, 0) in game.world.overworld_sections
    assert (1, 0) in game.world.overworld_sections
    assert game.world.overworld_transition is not None
    assert game.world.overworld_transition.direction == (1, 0)
    assert game.world.overworld_transition.from_grid is not game.world.overworld_transition.to_grid
    assert _visible_tile_count(game) == game.config.dungeon_width * game.config.dungeon_height
    assert game.world.messages[-1].text == "You travel to another part of the overworld."


def test_crossing_chunk_border_into_tree_enters_tree_chunk() -> None:
    game = Game()
    game.new_game(seed=14)
    player_position = _player_position(game)
    y = game.config.dungeon_height // 2
    player_position.x = game.config.dungeon_width - 1
    player_position.y = y
    game.world.dungeon_grid[y][player_position.x] = tiles.grass()
    next_grid = [[tile for tile in row] for row in game.world.dungeon_grid]
    next_grid[y][0] = tiles.tree()
    game.world.overworld_sections[(1, 0)] = next_grid

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.forest_return_section == (1, 0)
    assert game.world.forest_tree_position == Position(0, y)
    assert _player_position(game) == Position(0, y)
    assert game.world.messages[-1].text == "You push into the trees..."

    consumed = game.dispatch(Action.move(-1, 0))

    assert consumed is True
    assert game.world.overworld_section == (0, 0)
    assert _player_position(game) == Position(game.config.dungeon_width - 1, y)
    assert game.world.messages[-1].text == "You emerge from the forest."


def test_crossing_chunk_border_into_water_preserves_water_and_blocks() -> None:
    game = Game()
    game.new_game(seed=17)
    player_position = _player_position(game)
    y = game.config.dungeon_height // 2
    player_position.x = game.config.dungeon_width - 1
    player_position.y = y
    game.world.dungeon_grid[y][player_position.x] = tiles.grass()
    next_grid = [[tile for tile in row] for row in game.world.dungeon_grid]
    next_grid[y][0] = tiles.water()
    game.world.overworld_sections[(1, 0)] = next_grid

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.overworld_section == (0, 0)
    assert _player_position(game) == Position(game.config.dungeon_width - 1, y)
    assert game.world.overworld_sections[(1, 0)][y][0].special == "water"
    assert game.world.messages[-1].text == "That space is blocked."


def test_tree_movement_enters_and_exits_forest_chunk() -> None:
    game = Game()
    game.new_game(seed=10)
    player_position = _player_position(game)
    parent_section = game.world.overworld_section
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.state.area == "overworld"
    assert game.world.overworld_section != parent_section
    assert game.world.forest_return_section == parent_section
    assert game.world.forest_return_position == Position(5, 5)
    assert game.world.forest_tree_position == Position(6, 5)
    assert len(game.world.dungeon_grid) == game.config.dungeon_height
    assert len(game.world.dungeon_grid[0]) == game.config.dungeon_width
    assert _player_position(game).x == 0
    assert _player_position(game).y == 5
    assert game.world.overworld_transition is not None
    assert game.world.overworld_transition.direction == (1, 0)
    assert game.world.messages[-1].text == "You push into the trees..."

    consumed = game.dispatch(Action.move(-1, 0))

    assert consumed is True
    assert game.world.overworld_section == parent_section
    assert game.world.forest_return_section is None
    assert game.world.forest_return_position is None
    assert game.world.forest_tree_position is None
    assert _player_position(game) == Position(5, 5)
    assert game.world.messages[-1].text == "You emerge from the forest."


def test_forest_exit_uses_side_of_original_tree() -> None:
    game = Game()
    game.new_game(seed=12)
    player_position = _player_position(game)
    parent_section = game.world.overworld_section
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()
    game.world.dungeon_grid[5][7] = tiles.grass()

    game.dispatch(Action.move(1, 0))
    player_position = _player_position(game)
    player_position.x = len(game.world.dungeon_grid[0]) - 1
    player_position.y = 5
    game.world.dungeon_grid[5][player_position.x] = tiles.dark_grass()

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.overworld_section == parent_section
    assert _player_position(game) == Position(7, 5)
    assert game.world.messages[-1].text == "You emerge from the forest."


def test_forest_exit_into_water_preserves_water_and_blocks() -> None:
    game = Game()
    game.new_game(seed=18)
    player_position = _player_position(game)
    parent_section = game.world.overworld_section
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()
    game.world.dungeon_grid[5][7] = tiles.water()

    game.dispatch(Action.move(1, 0))
    forest_section = game.world.overworld_section
    player_position = _player_position(game)
    player_position.x = len(game.world.dungeon_grid[0]) - 1
    player_position.y = 5
    game.world.dungeon_grid[5][player_position.x] = tiles.dark_grass()

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.overworld_section == forest_section
    assert _player_position(game) == Position(len(game.world.dungeon_grid[0]) - 1, 5)
    assert game.world.overworld_sections[parent_section][5][7].special == "water"
    assert game.world.messages[-1].text == "That space is blocked."


def test_forest_chunk_edge_preserves_blocked_parent_neighbor() -> None:
    game = Game()
    game.new_game(seed=19)
    player_position = _player_position(game)
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()
    game.world.dungeon_grid[5][7] = tiles.water()

    game.dispatch(Action.move(1, 0))

    right_edge = [row[-1] for row in game.world.dungeon_grid]
    assert all(tile.special == "water" for tile in right_edge)
    assert all(not tile.walkable for tile in right_edge)
    assert all(tile.color == tiles.water().color for tile in right_edge)


def test_forest_chunk_converts_ocean_neighbor_to_local_water() -> None:
    game = Game()
    game.new_game(seed=21)
    player_position = _player_position(game)
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()
    game.world.dungeon_grid[5][7] = tiles.ocean()

    game.dispatch(Action.move(1, 0))

    right_edge = [row[-1] for row in game.world.dungeon_grid]
    assert all(tile.special == "water" for tile in right_edge[:-1])
    assert all(tile.special != "ocean" for row in game.world.dungeon_grid for tile in row)


def test_nested_forest_generation_uses_parent_grid_boundary() -> None:
    game = Game()
    game.new_game(seed=22)
    parent_section = (1_000_000, 1_000_000)
    parent_grid = [[tiles.dark_grass() for _x in range(9)] for _y in range(7)]
    parent_grid[0][0] = tiles.tree()
    parent_grid[0][1] = tiles.tree()
    parent_grid[1][0] = tiles.tree()
    game.world.overworld_sections[parent_section] = parent_grid

    forest = game._generate_forest_grid(parent_section, 0, 0)

    assert all(tile.special != "ocean" for row in forest for tile in row)
    assert forest[1][0].walkable is True
    assert forest[0][1].walkable is True
    assert not all(row[0].special == "tree" for row in forest)
    assert not all(tile.special == "tree" for tile in forest[0])


def test_forest_exit_into_another_tree_enters_that_tree_chunk() -> None:
    game = Game()
    game.new_game(seed=13)
    player_position = _player_position(game)
    parent_section = game.world.overworld_section
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()
    game.world.dungeon_grid[5][7] = tiles.tree()

    game.dispatch(Action.move(1, 0))
    first_forest_section = game.world.overworld_section
    player_position = _player_position(game)
    right_edge = [row[-1] for row in game.world.dungeon_grid]
    assert not all(tile.special == "tree" for tile in right_edge)
    assert game.world.dungeon_grid[5][-1].walkable is True
    player_position.x = len(game.world.dungeon_grid[0]) - 1
    player_position.y = 5

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.overworld_section != parent_section
    assert game.world.overworld_section != first_forest_section
    assert game.world.forest_return_section == parent_section
    assert game.world.forest_tree_position == Position(7, 5)
    assert game.world.forest_return_position == Position(6, 5)
    assert _player_position(game).x == 0
    assert _player_position(game).y == 5
    assert game.world.messages[-1].text == "You push into the trees..."


def test_forest_depth_four_blocks_deeper_tree_entry() -> None:
    game = Game()
    game.new_game(seed=16)
    game.world.forest_return_section = (0, 0)
    game.world.forest_return_position = Position(4, 5)
    game.world.forest_tree_position = Position(5, 5)
    game.world.forest_return_stack = [
        ForestReturnContext(section=(index, 0), position=Position(4, 5), tree_position=Position(5, 5))
        for index in range(3)
    ]
    player_position = _player_position(game)
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.dark_grass()
    game.world.dungeon_grid[5][6] = tiles.tree()
    current_section = game.world.overworld_section

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.overworld_section == current_section
    assert _player_position(game) == Position(5, 5)
    assert game.world.messages[-1].text == "The trees are too dense to enter."


def test_forest_grid_halves_until_depth_four() -> None:
    game = Game()
    game.new_game(seed=23)

    assert game._forest_grid_size() == (25, 17)
    game.world.forest_return_stack = [
        ForestReturnContext(section=(index, 0), position=Position(4, 5), tree_position=Position(5, 5))
        for index in range(1)
    ]
    assert game._forest_grid_size() == (13, 9)
    game.world.forest_return_stack = [
        ForestReturnContext(section=(index, 0), position=Position(4, 5), tree_position=Position(5, 5))
        for index in range(2)
    ]
    assert game._forest_grid_size() == (7, 5)
    game.world.forest_return_stack = [
        ForestReturnContext(section=(index, 0), position=Position(4, 5), tree_position=Position(5, 5))
        for index in range(3)
    ]
    assert game._forest_grid_size() == (5, 3)


def test_forest_entry_coordinates_scale_to_smaller_child_edges() -> None:
    game = Game()
    game.new_game(seed=24)

    assert game._scale_grid_coordinate(0, 17, 9) == 0
    assert game._scale_grid_coordinate(8, 17, 9) == 4
    assert game._scale_grid_coordinate(16, 17, 9) == 8
    assert game._scale_grid_coordinate(24, 25, 13) == 12


def test_forest_chunk_reflects_neighboring_tile_ratios() -> None:
    water_game = Game()
    water_game.new_game(seed=15)
    _surround_tree_with(water_game, 6, 5, tiles.water())

    rock_game = Game()
    rock_game.new_game(seed=15)
    _surround_tree_with(rock_game, 6, 5, tiles.rock())

    water_forest = water_game._generate_forest_grid((0, 0), 6, 5)
    rock_forest = rock_game._generate_forest_grid((0, 0), 6, 5)

    assert _tile_special_count(water_forest, "water") > _tile_special_count(rock_forest, "water")
    assert _tile_special_count(rock_forest, "rock") > _tile_special_count(water_forest, "rock")
    assert any(tile.special == "water" and tile.color == tiles.shallow_water().color for row in water_forest for tile in row)
    assert _tile_special_count(water_forest, "sand") > 0


def test_trees_inside_forest_chunk_open_nested_tree_chunks() -> None:
    game = Game()
    game.new_game(seed=11)
    player_position = _player_position(game)
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.grass()
    game.world.dungeon_grid[5][6] = tiles.tree()

    game.dispatch(Action.move(1, 0))
    forest_section = game.world.overworld_section
    player_position = _player_position(game)
    player_position.x = 5
    player_position.y = 5
    game.world.dungeon_grid[5][5] = tiles.dark_grass()
    game.world.dungeon_grid[5][6] = tiles.tree()

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.world.overworld_section != forest_section
    assert game.world.forest_return_section is not None
    assert game.world.forest_return_stack
    assert game.world.forest_return_section == forest_section
    assert game.world.forest_tree_position == Position(6, 5)
    assert len(game.world.dungeon_grid) == 9
    assert len(game.world.dungeon_grid[0]) == 13
    assert _player_position(game) == Position(0, 2)
    assert game.world.messages[-1].text == "You push into the trees..."

    consumed = game.dispatch(Action.move(-1, 0))

    assert consumed is True
    assert game.world.overworld_section == forest_section
    assert not game.world.forest_return_stack
    assert game.world.forest_return_section is not None
    assert _player_position(game) == Position(5, 5)


def _move_player_next_to_entrance(game: Game) -> None:
    entrance = game.world.dungeon_entrance_position
    assert entrance is not None
    _move_player_next_to(game, entrance)


def _move_player_next_to(game: Game, target: Position) -> None:
    player_position = _player_position(game)
    assert target.x > 0
    player_position.x = target.x - 1
    player_position.y = target.y
    game.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()


def _surround_tree_with(game: Game, tree_x: int, tree_y: int, tile: object) -> None:
    game.world.dungeon_grid[tree_y][tree_x] = tiles.tree()
    for y in range(tree_y - 1, tree_y + 2):
        for x in range(tree_x - 1, tree_x + 2):
            if x == tree_x and y == tree_y:
                continue
            game.world.dungeon_grid[y][x] = tile
    game.world.overworld_sections[game.world.overworld_section] = [
        [cell for cell in row] for row in game.world.dungeon_grid
    ]


def _tile_special_count(grid: list[list[object]], special: str) -> int:
    return sum(1 for row in grid for tile in row if getattr(tile, "special", None) == special)


def _player_position(game: Game) -> Position:
    player_id = game.world.player_eid
    assert player_id is not None
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(progress, Progress)
    position = game.ecs.get_component(player_id, "position")
    assert isinstance(position, Position)
    return position


def _visible_tile_count(game: Game) -> int:
    player_id = game.world.player_eid
    assert player_id is not None
    vision = game.ecs.get_component(player_id, "vision")
    assert isinstance(vision, Vision)
    return len(vision.visible)

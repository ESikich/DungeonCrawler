"""Tile constructors mirroring the JS game's basic dungeon tiles."""

from .models import Tile


def wall() -> Tile:
    return Tile(walkable=False, opaque=True, color=(100, 100, 100), glyph="#")


def floor() -> Tile:
    return Tile(walkable=True, opaque=False, color=(50, 50, 50), glyph=".")


def special_floor(color: tuple[int, int, int]) -> Tile:
    return Tile(walkable=True, opaque=False, color=color, glyph=".", special="specialFloor")


def pillar() -> Tile:
    return Tile(walkable=False, opaque=True, color=(120, 120, 120), glyph="O", special="pillar")


def door() -> Tile:
    return Tile(walkable=True, opaque=False, color=(139, 69, 19), glyph="+", special="door")


def lava() -> Tile:
    return Tile(walkable=False, opaque=False, color=(255, 80, 0), glyph="~", special="lava")


def stairs() -> Tile:
    return Tile(walkable=True, opaque=False, color=(50, 50, 50), glyph=">", special="downStairs")


def up_stairs() -> Tile:
    return Tile(walkable=True, opaque=False, color=(50, 50, 50), glyph="<", special="dungeonExit")


def grass() -> Tile:
    return Tile(walkable=True, opaque=False, color=(38, 130, 55), glyph="")


def light_grass() -> Tile:
    return Tile(walkable=True, opaque=False, color=(52, 155, 68), glyph="", special="grass")


def dark_grass() -> Tile:
    return Tile(walkable=True, opaque=False, color=(28, 105, 45), glyph="", special="grass")


def tree() -> Tile:
    return Tile(walkable=False, opaque=True, color=(18, 82, 35), glyph="T", special="tree")


def rock() -> Tile:
    return Tile(walkable=False, opaque=True, color=(105, 105, 95), glyph="o", special="rock")


def sand() -> Tile:
    return Tile(walkable=True, opaque=False, color=(194, 178, 128), glyph="", special="sand")


def bridge() -> Tile:
    return Tile(walkable=True, opaque=False, color=(126, 82, 42), glyph="=", special="bridge")


def water() -> Tile:
    return Tile(walkable=False, opaque=False, color=(30, 100, 200), glyph="~", special="water")


def shallow_water() -> Tile:
    return Tile(walkable=True, opaque=False, color=(62, 156, 224), glyph="~", special="water")


def mid_deep_water() -> Tile:
    return Tile(walkable=False, opaque=False, color=(12, 56, 140), glyph="~", special="water")


def very_deep_water() -> Tile:
    return Tile(walkable=False, opaque=False, color=(6, 34, 105), glyph="~", special="water")


def ocean() -> Tile:
    return Tile(walkable=False, opaque=False, color=(26, 108, 184), glyph="~", special="ocean")


def shallow_ocean() -> Tile:
    return Tile(walkable=True, opaque=False, color=(56, 162, 210), glyph="~", special="ocean")


def mid_deep_ocean() -> Tile:
    return Tile(walkable=False, opaque=False, color=(10, 64, 128), glyph="~", special="ocean")


def very_deep_ocean() -> Tile:
    return Tile(walkable=False, opaque=False, color=(4, 42, 96), glyph="~", special="ocean")


def dungeon_entrance() -> Tile:
    return Tile(walkable=True, opaque=False, color=(0, 0, 0), glyph="", special="dungeonEntrance")

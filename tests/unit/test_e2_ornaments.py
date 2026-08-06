"""Unit tests for ornament conversion pure functions."""

import pytest

from mytimetree.domain.ornaments import Ornaments, add_fruit, add_pest, add_woodpecker


@pytest.mark.unit
def test_add_fruit_converts_at_100():
    orn = Ornaments()
    for _ in range(99):
        orn = add_fruit(orn)
    assert orn.fruit_count == 99
    assert orn.golden_fruit_count == 0
    orn = add_fruit(orn)
    assert orn.fruit_count == 0
    assert orn.golden_fruit_count == 1


@pytest.mark.unit
def test_add_pest_and_woodpecker():
    orn = add_pest(Ornaments())
    orn = add_woodpecker(orn)
    assert orn.pest_count == 1
    assert orn.woodpecker_count == 1

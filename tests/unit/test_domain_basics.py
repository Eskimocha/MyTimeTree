import pytest

from mytimetree.domain.money_time import Balance, Minutes
from mytimetree.domain.tree import TreeStage, stage_for_net_minutes


@pytest.mark.unit
def test_minutes_add_sub():
    assert (Minutes(10) + Minutes(5)).value == 15
    assert (Minutes(10) - Minutes(3)).value == 7


@pytest.mark.unit
def test_balance_net():
    b = Balance(asset=Minutes(100), liability=Minutes(30))
    assert b.net.value == 70


@pytest.mark.unit
@pytest.mark.parametrize(
    "net,expected",
    [
        (0, TreeStage.SEED),
        (19, TreeStage.SEED),
        (20, TreeStage.SPROUT),
        (49, TreeStage.SPROUT),
        (50, TreeStage.BREAK_SOIL),
        (499, TreeStage.GIANT),
        (500, TreeStage.FRUITING),
        (900, TreeStage.FRUITING),
        (-10, TreeStage.SEED),
    ],
)
def test_tree_stage_from_net(net, expected):
    assert stage_for_net_minutes(net) == expected


@pytest.mark.unit
def test_tree_stage_uses_net_not_gross_asset():
    b = Balance(asset=Minutes(200), liability=Minutes(160))
    assert stage_for_net_minutes(b.net.value) == TreeStage.SPROUT

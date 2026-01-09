from .crossplay import (
    CrossPlayMethod as _m,
    send_and_wait as _wait,
)
from .classes import *

class RobotController:
    @staticmethod
    def get_round_num():
        return _wait(_m.RC_GET_ROUND_NUM)

    @staticmethod
    def get_map_width():
        return _wait(_m.RC_GET_MAP_WIDTH)

    @staticmethod
    def get_map_height():
        return _wait(_m.RC_GET_MAP_HEIGHT)
    
    # TODO add more methods


class Helpers:
    pass # todo add helper methods


rc = RobotController


def log(message):
    return _wait(_m.LOG, [message])


_GAME_METHODS = {
    "Direction": Direction,
    "Team": Team,
    "MapLocation": MapLocation,
    "UnitType": UnitType,
    "TrapType": TrapType,
    "RobotInfo": RobotInfo,
    "MapInfo": MapInfo,
    "rc": rc,
    "Helpers": Helpers,
    "log": (log, 1),
}

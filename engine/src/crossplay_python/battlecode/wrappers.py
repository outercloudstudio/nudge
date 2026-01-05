from .crossplay import (
    CrossPlayMethod as _m,
    send_and_wait as _wait,
)
from .enums import *

class RobotController:
    def get_round_num():
        return _wait(_m.RC_GET_ROUND_NUM)

    def get_map_width():
        return _wait(_m.RC_GET_MAP_WIDTH)

    def get_map_height():
        return _wait(_m.RC_GET_MAP_HEIGHT)


rc = RobotController


def log(message):
    return _wait(_m.LOG, [message])


_GAME_METHODS = {
    "Direction": Direction,
    "Team": Team,
    "rc": rc,
    "log": (log, 1),
}

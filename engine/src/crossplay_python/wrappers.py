import sys as _sys
_sys.path.append("engine/src")

from crossplay_python.crossplay import CrossPlayMessage as _mess, CrossPlayLiteral as _lit, \
    CrossPlayMethod as _m, CrossPlayObjectType as _ot, CrossPlayReference as _ref, wait as _wait
from crossplay_python.enums import *

class RobotController:
    def get_round_num():
        return _wait(_mess(_m.RC_GET_ROUND_NUM, [_ref(_ot.ROBOT_CONTROLLER, 0)]))
    
    def get_map_width():
        return _wait(_mess(_m.RC_GET_MAP_WIDTH, [_ref(_ot.ROBOT_CONTROLLER, 0)]))
    
    def get_map_height():
        return _wait(_mess(_m.RC_GET_MAP_HEIGHT, [_ref(_ot.ROBOT_CONTROLLER, 0)]))

rc = RobotController

def log(message):
    return _wait(_mess(_m.LOG, [_lit(_ot.STRING, message)]))

_GAME_METHODS = {'Direction': Direction,
                'Team': Team,
                'RobotController': RobotController,
                'log': (log, 1)}

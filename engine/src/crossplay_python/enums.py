from enum import Enum as _Enum

class Team(_Enum):
    A = 0
    B = 1
    NEUTRAL = 2

    def opposite(self):
        match self:
            case Team.A:
                return Team.B
            case Team.B:
                return Team.A
            case Team.NEUTRAL:
                return Team.NEUTRAL

# TODO make sure this matches the Java Direction enum, this could cause bugs
class Direction(_Enum):
    NORTH = (0, 1)
    NORTHEAST = (1, 1)
    EAST = (1, 0)
    SOUTHEAST = (1, -1)
    SOUTH = (0, -1)
    SOUTHWEST = (-1, -1)
    WEST = (-1, 0)
    NORTHWEST = (-1, 1)
    CENTER = (0, 0)

    def __init__(self, dx, dy):
        super().__init__()
        self.dx = dx
        self.dy = dy

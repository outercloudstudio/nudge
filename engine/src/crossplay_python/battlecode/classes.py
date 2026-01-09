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


dir_to_index = {
    (0, 1): 0,
    (1, 1): 1,
    (1, 0): 2,
    (1, -1): 3,
    (0, -1): 4,
    (-1, -1): 5,
    (-1, 0): 6,
    (-1, 1): 7,
    (0, 0): 8
}


# make sure this matches the Java Direction enum, this could cause bugs
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

    def __init__(self, dx: int, dy: int):
        self.dx = dx
        self.dy = dy

    def opposite(self) -> 'Direction':
        if self == Direction.CENTER:
            return self
        return dir_order[(dir_to_index[self.value] + 4) % 8]

    def rotate_left(self) -> 'Direction':
        if self == Direction.CENTER:
            return self
        return dir_order[(dir_to_index[self.value] - 1) % 8]
    
    def rotate_right(self) -> 'Direction':
        if self == Direction.CENTER:
            return self
        return dir_order[(dir_to_index[self.value] + 1) % 8]
    
    def all_directions():
        return Direction.__members__.values()
    
    def cardinal_directions():
        return [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST]
    
    def get_delta_x(self):
        return self.dx
    
    def get_delta_y(self):
        return self.dy


dir_order = [Direction.NORTH, Direction.NORTHEAST, Direction.EAST, Direction.SOUTHEAST, Direction.SOUTH, Direction.SOUTHWEST, Direction.WEST, Direction.NORTHWEST, Direction.CENTER]


class MapLocation:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y

    def add(self, dir: Direction) -> 'MapLocation':
        return MapLocation(self.x + dir.dx, self.y + dir.dy)
    
    def subtract(self, dir: Direction) -> 'MapLocation':
        return MapLocation(self.x - dir.dx, self.y - dir.dy)
    
    def translate(self, dx: int, dy: int) -> 'MapLocation':
        return MapLocation(self.x + dx, self.y + dy)
    
    def __eq__(self, other):
        if not isinstance(other, MapLocation):
            return False
        return self.x == other.x and self.y == other.y
    
    def __str__(self):
        return f"[{self.x}, {self.y}]"
    
    def __repr__(self):
        return f"MapLocation({self.x}, {self.y})"


class UnitType(_Enum):
    BABY_RAT = (100, 1, 20, 90, 10, 10, 17500)
    RAT_KING = (500, 3, 25, 360, 10, 40, 20000)
    CAT = (10_000, 2, 17, 180, 15, 20, 17500)

    def __init__(self, health: int, size: int, vision_cone_radius_squared: int, vision_cone_angle: int,
                 action_cooldown: int, movement_cooldown: int, bytecode_limit: int):
        self.health = health
        self.size = size
        self.vision_cone_radius_squared = vision_cone_radius_squared
        self.vision_cone_angle = vision_cone_angle
        self.action_cooldown = action_cooldown
        self.movement_cooldown = movement_cooldown
        self.bytecode_limit = bytecode_limit
    
    def uses_bottom_left_location_for_distance(self) -> bool:
        return self == UnitType.CAT
    
    def is_robot_type(self) -> bool:
        return self in {UnitType.BABY_RAT, UnitType.RAT_KING, UnitType.CAT}
    
    def is_throwable_type(self) -> bool:
        return self == UnitType.BABY_RAT
    
    def is_throwing_type(self) -> bool:
        return self == UnitType.BABY_RAT
    
    def is_baby_rat_type(self) -> bool:
        return self == UnitType.BABY_RAT
    
    def is_rat_king_type(self) -> bool:
        return self == UnitType.RAT_KING
    
    def is_cat_type(self) -> bool:
        return self == UnitType.CAT
    

class TrapType(_Enum):
    RAT_TRAP = (30, 50, 20, 25, 15, 0, 25, 2)
    CAT_TRAP = (10, 100, 20, 5, 10, 0, 10, 2)
    NONE = (0, 0, 0, 0, 0, 0, 0, 0)

    def __init__(self, build_cost: int, damage: int, stun_time: int, trap_limit: int,
                 action_cooldown: int, spawn_cheese_amount: int, max_count: int, trigger_radius_squared: int):
        self.build_cost = build_cost
        self.damage = damage
        self.stun_time = stun_time
        self.trap_limit = trap_limit
        self.action_cooldown = action_cooldown
        self.spawn_cheese_amount = spawn_cheese_amount
        self.max_count = max_count
        self.trigger_radius_squared = trigger_radius_squared


class MapInfo:
    def __init__(self, loc: MapLocation, is_passable: bool, is_wall: bool, is_dirt: bool,
                 cheese_amount: int, trap: TrapType, has_cheese_mine: bool):
        self.loc = loc
        self.is_passable = is_passable
        self.is_wall = is_wall
        self.is_dirt = is_dirt
        self.cheese_amount = cheese_amount
        self.trap = trap
        self.has_cheese_mine = has_cheese_mine


class RobotInfo:
    def __init__(self, id: int, team: Team, unit_type: UnitType, health: int,
                 location: MapLocation, direction: Direction,
                 chirality: int, cheese_amount: int, carrying_robot: 'RobotInfo'):
        self.id = id
        self.team = team
        self.type = unit_type
        self.health = health
        self.location = location
        self.direction = direction
        self.chirality = chirality
        self.cheese_amount = cheese_amount
        self.carrying_robot = carrying_robot

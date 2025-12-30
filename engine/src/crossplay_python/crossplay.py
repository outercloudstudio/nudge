import os
import json
import time
from typing import override

from crossplay_python.enums import Team

from enum import Enum

BYTECODE_LIMIT = 5800
MESSAGE_DIR = "crossplay_temp"
MESSAGE_FILE_JAVA = "messages_java.json"
MESSAGE_FILE_OTHER = "messages_other.json"
LOCK_FILE_JAVA = "lock_java.txt"
LOCK_FILE_OTHER = "lock_other.txt"

class CrossPlayException(Exception):
    def __init__(self, message):
        super().__init__(message + " (If you are a competitor, please report this to the Battlecode staff."
                         " This is not an error in your code.)")

class CrossPlayObjectType(Enum):
    INVALID = 0
    CALL = 1
    NULL = 2
    INTEGER = 3
    STRING = 4
    BOOLEAN = 5
    DOUBLE = 6
    ARRAY = 7
    DIRECTION = 8
    MAP_LOCATION = 9
    MESSAGE = 10
    ROBOT_CONTROLLER = 11
    ROBOT_INFO = 12
    TEAM = 13
    # TODO add more types

class CrossPlayMethod(Enum):
    INVALID = 0
    TERMINATE = 1
    START_TURN = 2 # returns [rc, round, team, id, end]
    RC_GET_ROUND_NUM = 3
    RC_GET_MAP_WIDTH = 4
    RC_GET_MAP_HEIGHT = 5
    LOG = 6
    # TODO add more methods

class CrossPlayObject:
    def __init__(self, object_type):
        self.object_type = object_type

    def __str__(self):
        return f"CrossPlayObject(type={self.object_type})"
    
    def to_json(self):
        return {"type": self.object_type.value}
    
    @classmethod
    def from_json(cls, json_data):
        if "value" in json_data:
            return CrossPlayLiteral.from_json(json_data)
        elif "oid" in json_data:
            return CrossPlayReference.from_json(json_data)
        elif json_data["type"] == CrossPlayObjectType.CALL.value:
            return CrossPlayMessage.from_json(json_data)
        else:
            raise CrossPlayException(f"Cannot decode CrossPlayObject from json: {json_data}")

class CrossPlayReference(CrossPlayObject):
    def __init__(self, object_type, object_id):
        super().__init__(object_type)
        self.object_id = object_id

    @override
    def __str__(self):
        return f"CrossPlayReference(type={self.object_type}, oid={self.object_id})"
    
    def to_json(self):
        json_data = super().to_json()
        json_data["oid"] = self.object_id
        return json_data
    
    @classmethod
    def from_json(cls, json_data):
        object_type = CrossPlayObjectType(json_data["type"])
        object_id = json_data["oid"]
        return CrossPlayReference(object_type, object_id)
    
class CrossPlayLiteral(CrossPlayObject):
    def __init__(self, object_type, value):
        super().__init__(object_type)
        self.value = value
    
    @override
    def __str__(self):
        return f"CrossPlayLiteral(type={self.object_type}, value={self.value})"
    
    def reduce_literal(self):
        match self.object_type:
            case CrossPlayObjectType.INTEGER:
                return int(self.value)
            case CrossPlayObjectType.STRING:
                return str(self.value)
            case CrossPlayObjectType.BOOLEAN:
                return bool(self.value)
            case CrossPlayObjectType.DOUBLE:
                return float(self.value)
            case CrossPlayObjectType.NULL:
                return None
            case CrossPlayObjectType.ARRAY:
                arr = []

                for item in self.value:
                    if isinstance(item, CrossPlayLiteral):
                        arr.append(item.reduce_literal())
                    elif isinstance(item, CrossPlayReference):
                        arr.append(item.object_id)
                    else:
                        raise CrossPlayException(f"Cannot reduce item of type {type(item)} in CrossPlayLiteral array.")

                return arr
            case CrossPlayObjectType.TEAM:
                return Team(self.value)
            case _:
                raise CrossPlayException(f"Cannot reduce CrossPlayLiteral of type {self.object_type} to primitive.")

    def to_json(self):
        json_data = super().to_json()
        
        match self.object_type:
            case CrossPlayObjectType.INTEGER:
                json_data["value"] = int(self.value)
            case CrossPlayObjectType.STRING:
                json_data["value"] = str(self.value)
            case CrossPlayObjectType.BOOLEAN:
                json_data["value"] = bool(self.value)
            case CrossPlayObjectType.DOUBLE:
                json_data["value"] = float(self.value)
            case CrossPlayObjectType.NULL:
                json_data["value"] = 0
            case CrossPlayObjectType.ARRAY:
                json_data["value"] = [item.to_json() for item in self.value]
            case CrossPlayObjectType.TEAM:
                json_data["value"] = self.value.value
            case _:
                raise CrossPlayException(f"Cannot encode CrossPlayLiteral of type {self.object_type} to json.")

        return json_data
    
    @classmethod
    def from_json(cls, json_data):
        # print(f"Parsing CrossPlayLiteral from json: {json_data}")
        object_type = CrossPlayObjectType(json_data["type"])
        
        match object_type:
            case CrossPlayObjectType.INTEGER:
                value = int(json_data["value"])
            case CrossPlayObjectType.STRING:
                value = str(json_data["value"])
            case CrossPlayObjectType.BOOLEAN:
                value = bool(json_data["value"])
            case CrossPlayObjectType.DOUBLE:
                value = float(json_data["value"])
            case CrossPlayObjectType.NULL:
                value = None
            case CrossPlayObjectType.ARRAY:
                value = [CrossPlayObject.from_json(item) for item in json_data["value"]]
            case CrossPlayObjectType.TEAM:
                value = Team(json_data["value"])
            case _:
                raise CrossPlayException(f"Cannot decode CrossPlayObject of type {object_type} as a literal.")

        return CrossPlayLiteral(object_type, value)

class CrossPlayMessage(CrossPlayObject):
    def __init__(self, method, params):
        super().__init__(CrossPlayObjectType.CALL)
        self.method = method
        self.params = params

    @override
    def __str__(self):
        return f"CrossPlayMessage(method={self.method}, params={self.params})"
    
    def to_json(self):
        json_data = super().to_json()
        json_data["method"] = self.method.value
        json_data["params"] = [param.to_json() for param in self.params]
        return json_data
    
    @classmethod
    def from_json(cls, json_data):
        if json_data["type"] != CrossPlayObjectType.CALL.value:
            raise CrossPlayException("Tried to parse non-call as CrossPlayMessage!")

        method = json_data["method"]
        params = [CrossPlayObject.from_json(param) for param in json_data["params"]]
        return CrossPlayMessage(method, params)

def wait(message: CrossPlayMessage, timeout=1000, timestep=0.1, message_dir=MESSAGE_DIR):
    read_file = os.path.join(message_dir, MESSAGE_FILE_JAVA)
    write_file = os.path.join(message_dir, MESSAGE_FILE_OTHER)
    java_lock_file = os.path.join(message_dir, LOCK_FILE_JAVA)
    other_lock_file = os.path.join(message_dir, LOCK_FILE_OTHER)

    json_message = message.to_json()
    time_limit = time.time() + timeout

    # print(f"Waiting to send message Python -> Java: {json_message}")

    while os.path.exists(read_file) or os.path.exists(write_file) or os.path.exists(java_lock_file):
        time.sleep(timestep)

        if time.time() > time_limit:
            raise CrossPlayException("Cross-play message passing timed out (Python waiting, Java busy).")

    if not os.path.exists(other_lock_file):
        with open(other_lock_file, 'x') as f:
            f.write('')

        # print("Created other lock file")

    with open(write_file, 'w') as f:
        json.dump(json_message, f)

    if os.path.exists(other_lock_file):
        os.remove(other_lock_file)

    # print(f"Sent message Python -> Java: {json_message}")
    # print("Waiting for response Java -> Python...")
    time_limit = time.time() + timeout
    
    while not os.path.exists(read_file) or os.path.exists(write_file) or os.path.exists(java_lock_file):
        time.sleep(timestep)

        if time.time() > time_limit:
            raise CrossPlayException("Cross-play message passing timed out (Python waiting, Java not responding).")

    if not os.path.exists(other_lock_file):
        with open(other_lock_file, 'x') as f:
            f.write('')

    with open(read_file, 'r') as f:
        json_data = json.load(f)
        result = CrossPlayObject.from_json(json_data)
    
    os.remove(read_file)
    
    if os.path.exists(other_lock_file):
        os.remove(other_lock_file)

    # print(f"Received message Java -> Python: {result}")

    if isinstance(result, CrossPlayLiteral):
        return result.reduce_literal()
    else:
        return result

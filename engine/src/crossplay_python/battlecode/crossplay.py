import socket
import struct
import json
import time
from enum import Enum

# Connection constants
IPC_HOST = "127.0.0.1"
IPC_PORT = 27185
BYTECODE_LIMIT = 20000  # Default, updated by game


class CrossPlayException(Exception):
    def __init__(self, message):
        super().__init__(
            message
            + " (If you are a competitor, please report this to the Battlecode staff.)"
        )


class CrossPlayMethod(Enum):
    INVALID = 0
    START_TURN = 1
    END_TURN = 2
    RC_GET_ROUND_NUM = 3
    RC_GET_MAP_WIDTH = 4
    RC_GET_MAP_HEIGHT = 5
    LOG = 6


class CrossPlayClient:
    def __init__(self):
        self.sock = None

    def connect(self):
        while True:
            try:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.connect((IPC_HOST, IPC_PORT))
                break
            except ConnectionRefusedError:
                time.sleep(0.1)
            except Exception as e:
                raise CrossPlayException(f"Failed to connect to Java server: {e}")

    def send_json(self, data):
        if self.sock is None:
            raise CrossPlayException("Socket not connected")

        json_bytes = json.dumps(data).encode("utf-8")
        length = len(json_bytes)
        try:
            self.sock.sendall(struct.pack(">I", length))
            self.sock.sendall(json_bytes)
        except Exception as e:
            raise CrossPlayException(f"Failed to send data: {e}")

    def receive_json(self):
        if self.sock is None:
            raise CrossPlayException("Socket not connected")

        try:
            length_bytes = self.recv_exactly(4)
            length = struct.unpack(">I", length_bytes)[0]
            data_bytes = self.recv_exactly(length)
            return json.loads(data_bytes.decode("utf-8"))
        except Exception as e:
            raise CrossPlayException(f"Failed to receive data: {e}")

    def recv_exactly(self, n):
        if self.sock is None:
            raise CrossPlayException("Socket not connected")

        data = b""
        while len(data) < n:
            packet = self.sock.recv(n - len(data))
            if not packet:
                raise CrossPlayException("Socket connection closed unexpectedly")
            data += packet
        return data

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None


# Global client instance
_client = CrossPlayClient()


def connect():
    _client.connect()


def close():
    _client.close()


def send(method: CrossPlayMethod, params=None):
    if params is None:
        params = []

    message = {"method": method.value, "params": params}

    _client.send_json(message)


def send_and_wait(method: CrossPlayMethod, params=None):
    send(method, params)
    return _client.receive_json()


def receive():
    return _client.receive_json()


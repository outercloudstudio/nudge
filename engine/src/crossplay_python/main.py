import os
from argparse import ArgumentParser
from subprocess import Popen
import time
import sys

from battlecode.runner import RobotRunner
from battlecode.crossplay import (
    BYTECODE_LIMIT,
    receive,
    connect,
    close,
    send,
    send_and_wait,
    CrossPlayMethod,
)
from battlecode.wrappers import _GAME_METHODS, Team

DETACHED_PROCESS = 0x00000008
CROSSPLAY_PYTHON_DIR = "example-bots/src/crossplay_python"  # TODO change for scaffold

TEAM_NAMES = {Team.A: "A", Team.B: "B", Team.NEUTRAL: "N"}


def get_code(bot_name):
    if bot_name is None:
        return None

    path = f"{CROSSPLAY_PYTHON_DIR}/{bot_name}"

    # read all files in this directory into a dictionary
    code = {}

    if not os.path.exists(path):
        raise ValueError(f"Bot directory '{path}' not found!")

    for filename in os.listdir(path):
        if filename.endswith(".py"):
            with open(os.path.join(path, filename), "r") as f:
                code[filename[:-3]] = f.read()

    return code


def get_error_printer(team=None, id=None, round_provider=None):
    def format_print(*args):
        team_name = "?"
        if team in TEAM_NAMES:
            team_name = TEAM_NAMES[team]
        r = round_provider() if round_provider else "?"
        print(f"[{team_name}: #{id}@{r}] ERROR: ", end="")
        print(*args)

    return format_print


def play(team_a=None, team_b=None, debug=False):
    if team_a == "/":
        team_a = None
    if team_b == "/":
        team_b = None

    code = {Team.A: get_code(team_a), Team.B: get_code(team_b), Team.NEUTRAL: None}
    active_bots = {}
    current_round = 0

    def get_round():
        return current_round

    # Connect to the crossplay server
    connect()

    try:
        while True:
            # wait for server message
            response = receive()

            if not response:
                # For null responses
                continue

            msg_type = response.get("type")
            if msg_type == "end_game":
                break

            elif msg_type == "spawn_bot":
                team_ordinal = response["team"]
                robot_id = response["id"]

                print(f"Spawning bot {robot_id} for team {team_ordinal}")
                team = Team(team_ordinal)
                runner = RobotRunner(
                    code=code[team],
                    game_methods=_GAME_METHODS,
                    error_method=get_error_printer(
                        team=team, id=robot_id, round_provider=get_round
                    ),
                    bytecode_limit=BYTECODE_LIMIT,
                    debug=debug,
                )
                runner.init_robot()
                active_bots[robot_id] = runner

            elif msg_type == "destroy_bot":
                robot_id = response["id"]
                print(f"Destroying bot {robot_id}")
                if robot_id in active_bots:
                    runner = active_bots.pop(robot_id)
                    runner.kill()

            elif msg_type == "start_turn":
                current_round = response["round"]
                robot_id = response["id"]

                print(f"Running turn {current_round} for id {robot_id}")
                if robot_id in active_bots:
                    runner = active_bots[robot_id]
                    runner.run()
                    bytecode_used = runner.bytecode_limit - runner.bytecode

                    # Send END_TURN with bytecode used
                    send(CrossPlayMethod.END_TURN, [bytecode_used])
                else:
                    print(
                        f"Error: Unknown bot {robot_id} and no team info to spawn it."
                    )

            else:
                print(f"Unknown message type: {msg_type}")

    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"CrossPlay runner error: {e}")
        import traceback

        traceback.print_exc()
    finally:
        for runner in active_bots.values():
            runner.kill()
        close()


def main():
    if sys.version_info.major != 3 or sys.version_info.minor != 12:
        print(
            f"Error: The Battlecode Python runner requires Python 3.12. Found version {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}."
        )
        sys.exit(1)

    parser = ArgumentParser()
    parser.add_argument("--teamA", help="Path to team A code file")
    parser.add_argument("--teamB", help="Path to team B code file")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument(
        "--new-process",
        action="store_true",
        help="Start the Python runner in a new process",
    )
    args = parser.parse_args()

    if args.new_process:
        new_args = [
            sys.executable,
            __file__,
            "--teamA",
            args.teamA if args.teamA else "/",
            "--teamB",
            args.teamB if args.teamB else "/",
        ]

        if args.debug:
            new_args.append("--debug")

        Popen(
            new_args,
            shell=False,
            stdin=None,
            stdout=None,
            stderr=None,
            close_fds=True,
            creationflags=DETACHED_PROCESS,
        )
    else:
        play(team_a=args.teamA, team_b=args.teamB, debug=args.debug)


if __name__ == "__main__":
    main()

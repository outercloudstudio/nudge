import sys
sys.path.append("engine/src")

import os
from argparse import ArgumentParser
from collections import OrderedDict

from crossplay_python.runner import RobotRunner
from crossplay_python.crossplay import BYTECODE_LIMIT, CrossPlayMessage, CrossPlayMethod, wait
from crossplay_python.wrappers import _GAME_METHODS, Team

CROSSPLAY_PYTHON_DIR = "example-bots/src/crossplay_python"

TEAM_NAMES = {
    Team.A: "A",
    Team.B: "B",
    Team.NEUTRAL: "N"
}

def get_code(bot_name):
    path = f"{CROSSPLAY_PYTHON_DIR}/{bot_name}"

    # read all files in this directory into a dictionary
    code = {}

    for filename in os.listdir(path):
        if filename.endswith(".py"):
            with open(os.path.join(path, filename), "r") as f:
                code[filename[:-3]] = f.read()
    
    return code

def get_error_printer(team=None, id=None, round=None):
    def format_print(*args):
        print(f"[{TEAM_NAMES[team]}: #{id}@{round}] ERROR: ", end="")
        print(*args)

    return format_print

def play(team_a=None, team_b=None, debug=False):
    print(f"Starting cross-play Python runner with teams {team_a} and {team_b}")

    # TODO comment out these lines when done testing
    if team_a is None:
        team_a = "pytest"
    
    if team_b is None:
        team_b = "pytest"

    code = {
        Team.A: get_code(team_a),
        Team.B: get_code(team_b),
        Team.NEUTRAL: None
    }
    
    while True:
        rc, round, team, id, end = wait(CrossPlayMessage(CrossPlayMethod.START_TURN, []))
        print(f"Starting turn for RobotController: {rc}, round: {round}, team: {TEAM_NAMES[team]}, ID: {id}, end: {end}")

        runner = RobotRunner(
            code=code[team],
            game_methods=_GAME_METHODS,
            error_method=get_error_printer(team=team, id=id, round=round),
            bytecode_limit=BYTECODE_LIMIT,
            debug=debug)
        
        runner.run()

        if end:
            print("Game ended")
            break

if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--teamA", help="Path to team A code file")
    parser.add_argument("--teamB", help="Path to team B code file")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    args = parser.parse_args()

    play(team_a=args.teamA, team_b=args.teamB, debug=args.debug)

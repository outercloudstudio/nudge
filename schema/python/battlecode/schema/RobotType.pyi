from __future__ import annotations

import flatbuffers
import numpy as np

import flatbuffers
import typing

uoffset: typing.TypeAlias = flatbuffers.number_types.UOffsetTFlags.py_type

class RobotType(object):
  NONE: int
  RAT: int
  RAT_KING: int
  CAT: int


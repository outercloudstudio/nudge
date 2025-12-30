from __future__ import annotations

import flatbuffers
import numpy as np

import typing
from typing import cast

uoffset: typing.TypeAlias = flatbuffers.number_types.UOffsetTFlags.py_type

class RobotType(object):
  NONE = cast(int, ...)
  RAT = cast(int, ...)
  RAT_KING = cast(int, ...)
  CAT = cast(int, ...)


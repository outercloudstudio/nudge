from __future__ import annotations

import flatbuffers
import numpy as np

import typing
from typing import cast

uoffset: typing.TypeAlias = flatbuffers.number_types.UOffsetTFlags.py_type

class WinType(object):
  RESIGNATION = cast(int, ...)
  RATKING_DESTROYED = cast(int, ...)
  BACKSTAB_RATKING_DESTROYED = cast(int, ...)
  MORE_POINTS = cast(int, ...)
  MORE_ROBOTS = cast(int, ...)
  MORE_CHEESE = cast(int, ...)
  TIE = cast(int, ...)
  COIN_FLIP = cast(int, ...)


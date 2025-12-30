from __future__ import annotations

import flatbuffers
import numpy as np

import typing
from typing import cast

uoffset: typing.TypeAlias = flatbuffers.number_types.UOffsetTFlags.py_type

class Event(object):
  NONE = cast(int, ...)
  GameHeader = cast(int, ...)
  MatchHeader = cast(int, ...)
  Round = cast(int, ...)
  MatchFooter = cast(int, ...)
  GameFooter = cast(int, ...)


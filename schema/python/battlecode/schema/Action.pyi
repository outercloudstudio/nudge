from __future__ import annotations

import flatbuffers
import numpy as np

import typing
from typing import cast

uoffset: typing.TypeAlias = flatbuffers.number_types.UOffsetTFlags.py_type

class Action(object):
  NONE = cast(int, ...)
  CatFeed = cast(int, ...)
  RatAttack = cast(int, ...)
  RatNap = cast(int, ...)
  RatCollision = cast(int, ...)
  PlaceDirt = cast(int, ...)
  BreakDirt = cast(int, ...)
  CheesePickup = cast(int, ...)
  CheeseSpawn = cast(int, ...)
  CheeseTransfer = cast(int, ...)
  CatScratch = cast(int, ...)
  CatPounce = cast(int, ...)
  PlaceTrap = cast(int, ...)
  TriggerTrap = cast(int, ...)
  ThrowRat = cast(int, ...)
  UpgradeToRatKing = cast(int, ...)
  RatSqueak = cast(int, ...)
  DamageAction = cast(int, ...)
  StunAction = cast(int, ...)
  SpawnAction = cast(int, ...)
  DieAction = cast(int, ...)
  IndicatorStringAction = cast(int, ...)
  IndicatorDotAction = cast(int, ...)
  IndicatorLineAction = cast(int, ...)


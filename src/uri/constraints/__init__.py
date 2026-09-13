"""Restricciones duras y blandas (FR-CONS-01..04)."""

from uri.constraints.engine import (
    CONSTRAINT_SET_V1,
    ConstraintSet,
    Exclusion,
    evaluate_constraints,
)

__all__ = ["CONSTRAINT_SET_V1", "ConstraintSet", "Exclusion", "evaluate_constraints"]

# ADR — Capability Graph Before Adaptive Replanning

Decision: establish a deterministic generic capability DAG before implementing dynamic replanning or learned resource selection.

Reason: downstream adaptation needs a stable representation of dependencies, executable order, provider requirements and cost. Without it, adaptive behavior would operate on implicit topology and be harder to falsify, audit and roll back.

Consequence: 1.2 intentionally improves planning intelligence without claiming autonomous learning or live optimization.

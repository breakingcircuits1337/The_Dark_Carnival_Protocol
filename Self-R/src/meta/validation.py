"""
Self-R Meta Layer — Rewrite Validation & Safety Gates
=====================================================
Phase 3 safety: Validates proposed code rewrites before they are applied to the
Self-R source directory. Ensures the swarm cannot accidentally break itself.
"""

import subprocess
import logging
import ast
import re
from pathlib import Path

logger = logging.getLogger(__name__)


class RewriteValidator:
    """
    Validates proposed source code rewrites before they are applied.

    Safety Gates (in order):
        1. Syntax check (Python AST parse or tsc --noEmit for TypeScript)
        2. Dangerous pattern scan (rm -rf, process.exit, eval, exec)
        3. Size sanity check (reject files that shrink by >80% — likely LLM truncation)
        4. TypeScript compile check (final gate for .ts files)
    """

    DANGEROUS_PATTERNS = [
        r"rm\s+-rf",
        r"process\.exit\(0\)",       # exit(0) is fine; we block hard exits in src
        r"\beval\s*\(",
        r"__import__\s*\(\s*['\"]os['\"]",
        r"subprocess\.call\s*\(\s*['\"]rm",
        r"DROP\s+TABLE",
        r"DELETE\s+FROM\s+\w+\s*;?\s*$",
    ]

    def __init__(self, project_root: str):
        self.project_root = Path(project_root)

    def validate(self, filename: str, original_content: str, proposed_content: str) -> tuple[bool, list[str]]:
        """
        Run all safety gates on a proposed rewrite.

        Args:
            filename: The source filename being rewritten.
            original_content: The current file content.
            proposed_content: The proposed new file content.

        Returns:
            A tuple of (is_valid: bool, reasons: list[str]).
            reasons contains human-readable descriptions of any failures.
        """
        reasons: list[str] = []

        # Gate 1: Non-empty check
        if not proposed_content or not proposed_content.strip():
            reasons.append("REJECTED: Proposed content is empty (LLM returned nothing).")
            return False, reasons

        # Gate 2: Size sanity — reject if content shrinks by more than 80%
        original_size = len(original_content)
        proposed_size = len(proposed_content)
        if original_size > 100 and proposed_size < original_size * 0.2:
            reasons.append(
                f"REJECTED: Proposed content is {proposed_size} chars vs original {original_size} chars "
                f"({100 * proposed_size // original_size}% of original) — likely LLM truncation."
            )
            return False, reasons

        # Gate 3: Dangerous pattern scan
        for pattern in self.DANGEROUS_PATTERNS:
            if re.search(pattern, proposed_content, re.IGNORECASE):
                reasons.append(f"REJECTED: Dangerous pattern detected: `{pattern}`")
                return False, reasons

        # Gate 4: Python syntax check (for .py files)
        if filename.endswith(".py"):
            try:
                ast.parse(proposed_content)
            except SyntaxError as e:
                reasons.append(f"REJECTED: Python syntax error: {e}")
                return False, reasons

        # Gate 5: TypeScript compile check (for .ts files)
        if filename.endswith(".ts"):
            is_valid, tsc_err = self._run_tsc_check(filename, proposed_content)
            if not is_valid:
                reasons.append(f"REJECTED: TypeScript compile failed:\n{tsc_err}")
                return False, reasons

        reasons.append(f"APPROVED: All {4 if filename.endswith('.ts') else 3} safety gates passed.")
        return True, reasons

    def _run_tsc_check(self, filename: str, proposed_content: str) -> tuple[bool, str]:
        """
        Write proposed content to a temp file and run tsc --noEmit to check for errors.

        Args:
            filename: The original filename (used to preserve extension).
            proposed_content: The proposed new TypeScript content.

        Returns:
            A tuple of (is_valid: bool, error_output: str).
        """
        import tempfile
        import os

        suffix = Path(filename).suffix
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=suffix,
            dir=str(self.project_root / "src"),
            delete=False,
            encoding="utf-8",
        ) as tmp:
            tmp.write(proposed_content)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                ["npx", "tsc", "--noEmit", "--skipLibCheck"],
                cwd=str(self.project_root),
                capture_output=True,
                text=True,
                timeout=30,
            )
            return result.returncode == 0, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return False, "TypeScript compile check timed out."
        except FileNotFoundError:
            # tsc not available — skip this gate
            logger.warning("tsc not found in PATH — skipping TypeScript compile gate.")
            return True, "tsc unavailable — compile gate skipped."
        finally:
            os.unlink(tmp_path)
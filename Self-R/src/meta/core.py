"""
Self-R Meta Layer — Core Self-Replication Engine
=================================================
Phase 3 component: Analyzes the swarm's own TypeScript source files,
identifies performance and correctness improvements, and emits patch recommendations.
Integrates with the SwarmBuilder via the /api/self-rewrite REST endpoint.
"""

import os
import json
import re
import hashlib
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Generator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [META] %(levelname)s — %(message)s"
)
logger = logging.getLogger(__name__)


# ─── Data Structures ──────────────────────────────────────────────────────────

@dataclass
class SourceModule:
    """Represents a scanned source file from Self-R's own codebase."""
    path: str
    filename: str
    content: str
    checksum: str
    line_count: int
    language: str = "typescript"


@dataclass
class RewriteProposal:
    """A structured rewrite recommendation for a source module."""
    target_file: str
    issue_description: str
    proposed_change: str
    priority: str  # "critical" | "high" | "medium" | "low"
    provider: str  # Which LLM generated the proposal
    confidence: float = 0.0
    accepted: bool = False


@dataclass
class ReplicationSession:
    """Tracks a full self-analysis and rewrite cycle."""
    session_id: str
    objective: str
    scanned_files: list[SourceModule] = field(default_factory=list)
    proposals: list[RewriteProposal] = field(default_factory=list)
    applied: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# ─── Source Scanner ────────────────────────────────────────────────────────────

class SourceScanner:
    """Scans Self-R's own TypeScript source files for analysis."""

    EXCLUDED_DIRS = {"node_modules", "dist", "completions", ".git", "skills"}
    ALLOWED_EXTENSIONS = {".ts", ".js", ".py"}

    def __init__(self, src_root: str):
        self.src_root = Path(src_root)

    def scan(self) -> Generator[SourceModule, None, None]:
        """Yield all non-excluded source modules from the src directory."""
        for file_path in self.src_root.rglob("*"):
            if not file_path.is_file():
                continue
            if any(part in self.EXCLUDED_DIRS for part in file_path.parts):
                continue
            if file_path.suffix not in self.ALLOWED_EXTENSIONS:
                continue

            try:
                content = file_path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(content.encode()).hexdigest()[:12]
                lang = "python" if file_path.suffix == ".py" else "typescript"

                yield SourceModule(
                    path=str(file_path),
                    filename=file_path.name,
                    content=content,
                    checksum=checksum,
                    line_count=len(content.splitlines()),
                    language=lang,
                )
            except Exception as e:
                logger.warning(f"Could not read {file_path}: {e}")

    def get_module(self, filename: str) -> SourceModule | None:
        """Retrieve a specific module by filename."""
        for module in self.scan():
            if module.filename == filename:
                return module
        return None


# ─── Static Analyzer ──────────────────────────────────────────────────────────

class StaticAnalyzer:
    """Runs rule-based static analysis on source modules to find known patterns."""

    RULES = [
        {
            "id": "unhandled-promise",
            "pattern": r"(?<!await\s)\b\w+\.\w+\(.*\)\s*;",
            "description": "Potential unhandled Promise — missing await or .catch()",
            "priority": "high",
        },
        {
            "id": "error-return-string",
            "pattern": r"return\s+chalk\.(red|yellow)\(",
            "description": "Error returned as colored string instead of being thrown — corrupts downstream consumers",
            "priority": "critical",
        },
        {
            "id": "any-type",
            "pattern": r":\s*any\b",
            "description": "Explicit 'any' type — reduces type safety",
            "priority": "medium",
        },
        {
            "id": "console-log-in-prod",
            "pattern": r"console\.log\(",
            "description": "console.log in production code — should use structured logging",
            "priority": "low",
        },
    ]

    def analyze(self, module: SourceModule) -> list[dict]:
        """Return list of rule violations found in a module."""
        findings = []
        for rule in self.RULES:
            matches = list(re.finditer(rule["pattern"], module.content, re.MULTILINE))
            if matches:
                findings.append({
                    "rule_id": rule["id"],
                    "description": rule["description"],
                    "priority": rule["priority"],
                    "match_count": len(matches),
                    "file": module.filename,
                })
        return findings


# ─── Replication Engine ────────────────────────────────────────────────────────

class ReplicationEngine:
    """
    Core Phase 3 engine: analyzes Self-R source files and proposes targeted rewrites.

    Workflow:
        1. Scan source files
        2. Static analysis pass (fast, rule-based)
        3. LLM deep analysis pass (slow, per-file, via HTTP to running Self-R server)
        4. Emit RewriteProposal list
        5. Apply accepted proposals with safety gate (tsc check)
    """

    def __init__(self, project_root: str, api_base: str = "http://localhost:8080"):
        self.project_root = Path(project_root)
        self.src_root = self.project_root / "src"
        self.api_base = api_base
        self.scanner = SourceScanner(str(self.src_root))
        self.static_analyzer = StaticAnalyzer()
        logger.info(f"ReplicationEngine initialized. Project root: {self.project_root}")

    def run_analysis_session(self, objective: str = "Improve overall code quality and correctness") -> ReplicationSession:
        """Execute a full self-analysis cycle and return a ReplicationSession."""
        import uuid
        session = ReplicationSession(
            session_id=uuid.uuid4().hex[:8],
            objective=objective,
        )

        logger.info(f"Starting analysis session [{session.session_id}]: {objective}")

        # Phase 1: Scan
        modules = list(self.scanner.scan())
        session.scanned_files = modules
        logger.info(f"Scanned {len(modules)} source modules.")

        # Phase 2: Static Analysis
        all_findings = []
        for module in modules:
            findings = self.static_analyzer.analyze(module)
            for f in findings:
                all_findings.append(f)
                proposal = RewriteProposal(
                    target_file=f["file"],
                    issue_description=f"[Static][{f['rule_id']}] {f['description']} ({f['match_count']} occurrences)",
                    proposed_change=f"Refactor {f['rule_id']} violations in {f['file']}",
                    priority=f["priority"],
                    provider="StaticAnalyzer",
                    confidence=0.95,
                )
                session.proposals.append(proposal)

        logger.info(f"Static analysis found {len(all_findings)} issues across {len(modules)} files.")
        return session

    def apply_proposal(self, proposal: RewriteProposal, new_content: str) -> bool:
        """
        Apply a rewrite proposal to a source file after running a TypeScript compile check.

        Args:
            proposal: The RewriteProposal to apply.
            new_content: The new file content to write.

        Returns:
            True if the file was successfully written and compiled. False otherwise.
        """
        import subprocess
        target = self.src_root / proposal.target_file

        if not target.exists():
            logger.error(f"Target file does not exist: {target}")
            return False

        # Backup the original
        backup_path = target.with_suffix(target.suffix + ".bak")
        backup_path.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")

        # Write new content
        target.write_text(new_content, encoding="utf-8")
        logger.info(f"Wrote new content to {target}")

        # Safety gate: run TypeScript compile check
        result = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=str(self.project_root),
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            logger.error(f"TypeScript compile check FAILED for {proposal.target_file}. Reverting.")
            logger.error(f"tsc output:\n{result.stdout}\n{result.stderr}")
            # Revert
            target.write_text(backup_path.read_text(encoding="utf-8"), encoding="utf-8")
            backup_path.unlink()
            return False

        # Success — remove backup
        backup_path.unlink()
        proposal.accepted = True
        logger.info(f"✓ Applied and validated rewrite of {proposal.target_file}")
        return True

    def get_session_report(self, session: ReplicationSession) -> str:
        """Generate a human-readable analysis report."""
        lines = [
            f"=== Self-R Replication Session [{session.session_id}] ===",
            f"Objective: {session.objective}",
            f"Files Scanned: {len(session.scanned_files)}",
            f"Proposals Generated: {len(session.proposals)}",
            "",
            "── Proposals by Priority ──",
        ]

        for priority in ["critical", "high", "medium", "low"]:
            group = [p for p in session.proposals if p.priority == priority]
            if group:
                lines.append(f"\n[{priority.upper()}] ({len(group)} issues)")
                for p in group:
                    lines.append(f"  • {p.target_file}: {p.issue_description}")

        return "\n".join(lines)


# ─── CLI Entry Point ───────────────────────────────────────────────────────────

def main():
    """Run a self-analysis pass and print the report."""
    import argparse

    parser = argparse.ArgumentParser(description="Self-R Meta Layer: Self-Analysis Engine")
    parser.add_argument("--root", default=".", help="Self-R project root directory")
    parser.add_argument("--objective", default="Improve code quality and correctness", help="Analysis objective")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of formatted report")
    args = parser.parse_args()

    engine = ReplicationEngine(project_root=args.root)
    session = engine.run_analysis_session(objective=args.objective)
    report = engine.get_session_report(session)

    if args.json:
        output = {
            "session_id": session.session_id,
            "objective": session.objective,
            "files_scanned": len(session.scanned_files),
            "proposals": [
                {
                    "target_file": p.target_file,
                    "issue": p.issue_description,
                    "priority": p.priority,
                    "provider": p.provider,
                }
                for p in session.proposals
            ],
        }
        print(json.dumps(output, indent=2))
    else:
        print(report)


if __name__ == "__main__":
    main()
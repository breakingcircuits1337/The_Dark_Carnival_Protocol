"""
Self-R Meta Layer — LLM-Powered Code Optimizer
===============================================
Phase 3 extension: Uses the configured LLM providers (via the Self-R server API)
to generate deep, context-aware rewrite proposals for source modules identified
by the StaticAnalyzer or submitted manually.
"""

import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)


class LLMOptimizer:
    """
    Generates LLM-powered rewrite proposals by calling the running Self-R server's
    /api/rewrite endpoint, which in turn routes through the TypeScript LLMFactory.
    """

    def __init__(self, server_url: str = "http://localhost:8080"):
        self.server_url = server_url.rstrip("/")

    def propose_rewrite(self, filename: str, content: str, issue: str, provider: str = "Kimi") -> str | None:
        """
        Ask an LLM to propose a rewrite for a source file given a known issue.

        Args:
            filename: The target source filename.
            content: The current source file content.
            issue: Description of the issue to fix.
            provider: LLM provider name to route through.

        Returns:
            The proposed new file content as a string, or None on failure.
        """
        payload = json.dumps({
            "filename": filename,
            "content": content,
            "issue": issue,
            "provider": provider,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.server_url}/api/rewrite",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("proposed_content")
        except urllib.error.URLError as e:
            logger.error(f"LLMOptimizer: Server request failed: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"LLMOptimizer: Invalid JSON response: {e}")
            return None

    def analyze_module_quality(self, filename: str, content: str) -> dict:
        """
        Ask the LLM for a quality assessment of a source module.

        Args:
            filename: The source filename.
            content: The source code content.

        Returns:
            A dict with 'score' (0-10), 'issues' (list[str]), and 'suggestions' (list[str]).
        """
        payload = json.dumps({
            "filename": filename,
            "content": content,
            "mode": "quality_audit",
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.server_url}/api/analyze",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"LLMOptimizer: Quality audit failed: {e}")
            return {"score": 0, "issues": [str(e)], "suggestions": []}
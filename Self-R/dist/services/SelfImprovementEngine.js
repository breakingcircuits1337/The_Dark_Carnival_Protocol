"use strict";
/**
 * SelfImprovementEngine.ts
 * ========================
 * Tier 1 of the Dark Carnival Self-Improvement System.
 *
 * Wraps the Python meta layer (core.py, optimizer.py, validation.py) and
 * orchestrates a full quality-score → propose-rewrite → validate → apply cycle
 * over the Wagon's completions directory.
 *
 * Called by:
 *  - SwarmBuilder.delegateToSwarm() after task completion (auto-trigger)
 *  - POST /api/self-improve endpoint (manual trigger via Ringmaster Hub)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfImprovementEngine = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const WebSocketServer_1 = require("../server/WebSocketServer");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class SelfImprovementEngine {
    projectRoot;
    completionsDir;
    serverUrl;
    constructor(projectRoot = process.cwd(), serverUrl = 'http://localhost:8080') {
        this.projectRoot = projectRoot;
        this.completionsDir = path.join(projectRoot, 'completions');
        this.serverUrl = serverUrl;
    }
    /**
     * Run a full self-improvement cycle over the completions directory.
     *
     * For each completion file:
     *   1. Quality audit via /api/analyze (score 0-10)
     *   2. If score < 7, request rewrite from /api/rewrite
     *   3. Validate via Python validation.py safety gates
     *   4. If valid, apply the patch
     *
     * Returns:
     *   ImprovementReport — structured summary of the cycle.
     */
    async runCycle() {
        const startTime = Date.now();
        const sessionId = Math.random().toString(36).slice(2, 8).toUpperCase();
        (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] Self-improvement cycle started...`);
        if (!fs.existsSync(this.completionsDir)) {
            fs.mkdirSync(this.completionsDir, { recursive: true });
        }
        const files = fs.readdirSync(this.completionsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.py'));
        const results = [];
        let improved = 0;
        let skipped = 0;
        let failed = 0;
        (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] Scanning ${files.length} completion file(s)...`);
        for (const filename of files) {
            const filePath = path.join(this.completionsDir, filename);
            let content;
            try {
                content = fs.readFileSync(filePath, 'utf8');
            }
            catch (e) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ✗ Could not read ${filename}: ${e}`);
                failed++;
                results.push({ filename, originalScore: 0, improved: false, reason: `Read error: ${e}`, proposalGenerated: false, validationPassed: false });
                continue;
            }
            // Step 1: Quality Audit
            let score = 10;
            let issues = [];
            let suggestions = [];
            try {
                const auditRes = await fetch(`${this.serverUrl}/api/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content, mode: 'quality_audit' }),
                });
                const audit = await auditRes.json();
                score = audit.score ?? 10;
                issues = audit.issues ?? [];
                suggestions = audit.suggestions ?? [];
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ${filename} — Quality score: ${score}/10`);
            }
            catch (e) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ⚠ Audit failed for ${filename}, skipping...`);
                skipped++;
                results.push({ filename, originalScore: -1, improved: false, reason: `Audit error: ${e}`, proposalGenerated: false, validationPassed: false });
                continue;
            }
            // Step 2: If score is good enough, skip rewrite
            if (score >= 7) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ${filename} — Score acceptable. No action needed.`);
                skipped++;
                results.push({ filename, originalScore: score, improved: false, reason: 'Score acceptable (≥7)', proposalGenerated: false, validationPassed: false });
                continue;
            }
            // Step 3: Request Rewrite Proposal
            const issueDescription = issues.slice(0, 3).join('; ') || `Score ${score}/10 — general quality improvement`;
            (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ${filename} — Score: ${score}/10. Requesting rewrite...`);
            let proposedContent = null;
            try {
                const rewriteRes = await fetch(`${this.serverUrl}/api/rewrite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content, issue: issueDescription, provider: 'Kimi' }),
                });
                const rewriteData = await rewriteRes.json();
                proposedContent = rewriteData.proposed_content ?? null;
            }
            catch (e) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ✗ Rewrite request failed for ${filename}: ${e}`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: `Rewrite error: ${e}`, proposalGenerated: false, validationPassed: false });
                continue;
            }
            if (!proposedContent) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ✗ Empty rewrite proposal for ${filename}. Skipping.`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: 'Empty rewrite proposal', proposalGenerated: true, validationPassed: false });
                continue;
            }
            // Step 4: Validate via Python validation.py
            const isValid = await this.runPythonValidation(filename, content, proposedContent);
            if (!isValid) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ✗ ${filename} — Validation FAILED. Reverting.`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: 'Safety validation failed', proposalGenerated: true, validationPassed: false });
                continue;
            }
            // Step 5: Apply the patch
            try {
                // Backup original
                fs.writeFileSync(`${filePath}.bak`, content, 'utf8');
                // Write patched version
                fs.writeFileSync(filePath, proposedContent, 'utf8');
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ✓ ${filename} — Patched and validated (score was ${score}/10).`);
                improved++;
                results.push({ filename, originalScore: score, improved: true, reason: `Improved from score ${score}/10`, proposalGenerated: true, validationPassed: true });
            }
            catch (e) {
                (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] ✗ Failed to write patch for ${filename}: ${e}`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: `Write error: ${e}`, proposalGenerated: true, validationPassed: true });
            }
        }
        const report = {
            sessionId,
            filesScanned: files.length,
            improved,
            skipped,
            failed,
            results,
            durationMs: Date.now() - startTime,
        };
        (0, WebSocketServer_1.broadcastLog)('SelfImprove', `[${sessionId}] Cycle complete in ${Math.round(report.durationMs / 1000)}s — ` +
            `${improved} improved, ${skipped} skipped, ${failed} failed.`);
        return report;
    }
    /**
     * Run the Python validation.py safety gates on a proposed rewrite.
     *
     * Args:
     *   filename: Source filename.
     *   original: Original file content.
     *   proposed: Proposed new content.
     *
     * Returns:
     *   True if all safety gates pass, false otherwise.
     */
    async runPythonValidation(filename, original, proposed) {
        const validationScript = path.join(this.projectRoot, 'src/meta/validation.py');
        const tmpOriginal = path.join(this.projectRoot, `_tmp_orig_${Date.now()}.txt`);
        const tmpProposed = path.join(this.projectRoot, `_tmp_prop_${Date.now()}.txt`);
        try {
            fs.writeFileSync(tmpOriginal, original, 'utf8');
            fs.writeFileSync(tmpProposed, proposed, 'utf8');
            const validationRunner = `
import sys
sys.path.insert(0, '${this.projectRoot}/src/meta')
from validation import RewriteValidator
v = RewriteValidator('${this.projectRoot.replace(/\\/g, '/')}')
orig = open('${tmpOriginal.replace(/\\/g, '/')}').read()
prop = open('${tmpProposed.replace(/\\/g, '/')}').read()
ok, reasons = v.validate('${filename}', orig, prop)
print('PASS' if ok else 'FAIL')
for r in reasons: print(r)
`.trim();
            const { stdout } = await execAsync(`python3 -c "${validationRunner.replace(/"/g, '\\"')}"`, {
                cwd: this.projectRoot,
                timeout: 30000,
            });
            return stdout.trim().startsWith('PASS');
        }
        catch (e) {
            // If Python validation unavailable, log and skip (fail-safe)
            (0, WebSocketServer_1.broadcastLog)('SelfImprove', `⚠ Python validation unavailable: ${e}. Skipping patch.`);
            return false;
        }
        finally {
            try {
                fs.unlinkSync(tmpOriginal);
            }
            catch { /* ignore */ }
            try {
                fs.unlinkSync(tmpProposed);
            }
            catch { /* ignore */ }
        }
    }
}
exports.SelfImprovementEngine = SelfImprovementEngine;

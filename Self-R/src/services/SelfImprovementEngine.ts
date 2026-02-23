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

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { broadcastLog } from '../server/WebSocketServer';

const execAsync = promisify(exec);

export interface ImprovementResult {
    filename: string;
    originalScore: number;
    improved: boolean;
    reason: string;
    proposalGenerated: boolean;
    validationPassed: boolean;
}

export interface ImprovementReport {
    sessionId: string;
    filesScanned: number;
    improved: number;
    skipped: number;
    failed: number;
    results: ImprovementResult[];
    durationMs: number;
}

export class SelfImprovementEngine {
    private projectRoot: string;
    private completionsDir: string;
    private serverUrl: string;

    constructor(
        projectRoot: string = process.cwd(),
        serverUrl: string = 'http://localhost:8080'
    ) {
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
    async runCycle(): Promise<ImprovementReport> {
        const startTime = Date.now();
        const sessionId = Math.random().toString(36).slice(2, 8).toUpperCase();

        broadcastLog('SelfImprove', `[${sessionId}] Self-improvement cycle started...`);

        if (!fs.existsSync(this.completionsDir)) {
            fs.mkdirSync(this.completionsDir, { recursive: true });
        }

        const files = fs.readdirSync(this.completionsDir).filter(f =>
            f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.py')
        );

        const results: ImprovementResult[] = [];
        let improved = 0;
        let skipped = 0;
        let failed = 0;

        broadcastLog('SelfImprove', `[${sessionId}] Scanning ${files.length} completion file(s)...`);

        for (const filename of files) {
            const filePath = path.join(this.completionsDir, filename);
            let content: string;

            try {
                content = fs.readFileSync(filePath, 'utf8');
            } catch (e) {
                broadcastLog('SelfImprove', `[${sessionId}] ✗ Could not read ${filename}: ${e}`);
                failed++;
                results.push({ filename, originalScore: 0, improved: false, reason: `Read error: ${e}`, proposalGenerated: false, validationPassed: false });
                continue;
            }

            // Step 1: Quality Audit
            let score = 10;
            let issues: string[] = [];
            let suggestions: string[] = [];

            try {
                const auditRes = await fetch(`${this.serverUrl}/api/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content, mode: 'quality_audit' }),
                });
                const audit = await auditRes.json() as { score: number; issues: string[]; suggestions: string[] };
                score = audit.score ?? 10;
                issues = audit.issues ?? [];
                suggestions = audit.suggestions ?? [];
                broadcastLog('SelfImprove', `[${sessionId}] ${filename} — Quality score: ${score}/10`);
            } catch (e) {
                broadcastLog('SelfImprove', `[${sessionId}] ⚠ Audit failed for ${filename}, skipping...`);
                skipped++;
                results.push({ filename, originalScore: -1, improved: false, reason: `Audit error: ${e}`, proposalGenerated: false, validationPassed: false });
                continue;
            }

            // Step 2: If score is good enough, skip rewrite
            if (score >= 7) {
                broadcastLog('SelfImprove', `[${sessionId}] ${filename} — Score acceptable. No action needed.`);
                skipped++;
                results.push({ filename, originalScore: score, improved: false, reason: 'Score acceptable (≥7)', proposalGenerated: false, validationPassed: false });
                continue;
            }

            // Step 3: Request Rewrite Proposal
            const issueDescription = issues.slice(0, 3).join('; ') || `Score ${score}/10 — general quality improvement`;
            broadcastLog('SelfImprove', `[${sessionId}] ${filename} — Score: ${score}/10. Requesting rewrite...`);

            let proposedContent: string | null = null;
            try {
                const rewriteRes = await fetch(`${this.serverUrl}/api/rewrite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content, issue: issueDescription, provider: 'Kimi' }),
                });
                const rewriteData = await rewriteRes.json() as { proposed_content?: string };
                proposedContent = rewriteData.proposed_content ?? null;
            } catch (e) {
                broadcastLog('SelfImprove', `[${sessionId}] ✗ Rewrite request failed for ${filename}: ${e}`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: `Rewrite error: ${e}`, proposalGenerated: false, validationPassed: false });
                continue;
            }

            if (!proposedContent) {
                broadcastLog('SelfImprove', `[${sessionId}] ✗ Empty rewrite proposal for ${filename}. Skipping.`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: 'Empty rewrite proposal', proposalGenerated: true, validationPassed: false });
                continue;
            }

            // Step 4: Validate via Python validation.py
            const isValid = await this.runPythonValidation(filename, content, proposedContent);

            if (!isValid) {
                broadcastLog('SelfImprove', `[${sessionId}] ✗ ${filename} — Validation FAILED. Reverting.`);
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
                broadcastLog('SelfImprove', `[${sessionId}] ✓ ${filename} — Patched and validated (score was ${score}/10).`);
                improved++;
                results.push({ filename, originalScore: score, improved: true, reason: `Improved from score ${score}/10`, proposalGenerated: true, validationPassed: true });
            } catch (e) {
                broadcastLog('SelfImprove', `[${sessionId}] ✗ Failed to write patch for ${filename}: ${e}`);
                failed++;
                results.push({ filename, originalScore: score, improved: false, reason: `Write error: ${e}`, proposalGenerated: true, validationPassed: true });
            }
        }

        const report: ImprovementReport = {
            sessionId,
            filesScanned: files.length,
            improved,
            skipped,
            failed,
            results,
            durationMs: Date.now() - startTime,
        };

        broadcastLog(
            'SelfImprove',
            `[${sessionId}] Cycle complete in ${Math.round(report.durationMs / 1000)}s — ` +
            `${improved} improved, ${skipped} skipped, ${failed} failed.`
        );

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
    private async runPythonValidation(filename: string, original: string, proposed: string): Promise<boolean> {
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
        } catch (e) {
            // If Python validation unavailable, log and skip (fail-safe)
            broadcastLog('SelfImprove', `⚠ Python validation unavailable: ${e}. Skipping patch.`);
            return false;
        } finally {
            try { fs.unlinkSync(tmpOriginal); } catch { /* ignore */ }
            try { fs.unlinkSync(tmpProposed); } catch { /* ignore */ }
        }
    }
}

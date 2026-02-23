import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export class SkillLoader {
    private skillPath: string;

    constructor() {
        // Point to local directory since Self-R is standalone
        this.skillPath = path.join(process.cwd(), 'skills');
    }

    public getAvailableSkills(): string[] {
        try {
            if (!fs.existsSync(this.skillPath)) {
                console.error(chalk.red(`Skills directory not found: ${this.skillPath}`));
                return [];
            }
            const entries = fs.readdirSync(this.skillPath);
            const skills: string[] = [];
            for (const f of entries) {
                try {
                    const dirPath = path.join(this.skillPath, f);
                    if (fs.statSync(dirPath).isDirectory() && fs.existsSync(path.join(dirPath, 'SKILL.md'))) {
                        skills.push(f);
                    }
                } catch {
                    // Skip broken symlinks, unreadable entries
                }
            }
            console.log(chalk.dim(`Loaded ${skills.length} skills from ${this.skillPath}`));
            return skills;
        } catch (e) {
            console.error(chalk.red(`Failed to load skills from ${this.skillPath}: ${e}`));
            return [];
        }
    }

    public loadSkillContext(skillName: string): string {
        const p = path.join(this.skillPath, skillName, 'SKILL.md');
        if (fs.existsSync(p)) {
            console.log(chalk.dim(`Loading skill context: ${skillName}`));
            return fs.readFileSync(p, 'utf8');
        }
        return '';
    }
}

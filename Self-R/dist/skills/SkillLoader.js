"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillLoader = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
class SkillLoader {
    skillPath;
    constructor() {
        // Point to local directory since Self-R is standalone
        this.skillPath = path_1.default.join(process.cwd(), 'skills');
    }
    getAvailableSkills() {
        try {
            if (!fs_1.default.existsSync(this.skillPath)) {
                return [];
            }
            return fs_1.default.readdirSync(this.skillPath).filter(f => {
                const dirPath = path_1.default.join(this.skillPath, f);
                return fs_1.default.statSync(dirPath).isDirectory() && fs_1.default.existsSync(path_1.default.join(dirPath, 'SKILL.md'));
            });
        }
        catch (e) {
            console.error(chalk_1.default.red('Failed to load skills from ' + this.skillPath));
            return [];
        }
    }
    loadSkillContext(skillName) {
        const p = path_1.default.join(this.skillPath, skillName, 'SKILL.md');
        if (fs_1.default.existsSync(p)) {
            console.log(chalk_1.default.dim(`Loading skill context: ${skillName}`));
            return fs_1.default.readFileSync(p, 'utf8');
        }
        return '';
    }
}
exports.SkillLoader = SkillLoader;

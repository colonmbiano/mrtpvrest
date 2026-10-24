import { execSync } from 'node:child_process';
const cwd = 'C:\\Users\\colon\\AndroidStudioProjects\\mrtpvrest-marketplace';
const out = execSync('git status -s', { cwd, encoding: 'utf8' });
console.log(out || 'CLEAN');

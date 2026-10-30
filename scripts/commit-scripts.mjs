import { execSync } from 'node:child_process';
const cwd = 'C:\\Users\\colon\\AndroidStudioProjects\\mrtpvrest-marketplace';
execSync('git add scripts/*.mjs', { cwd });
execSync('git commit -m "chore(scripts): utilidades de lectura segura y envio de tareas para orca"', { cwd });
console.log('Scripts committed successfully');

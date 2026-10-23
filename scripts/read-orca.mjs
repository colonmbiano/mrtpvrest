import { execFileSync } from 'node:child_process';

const orcaBin = 'C:\\Users\\colon\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca.exe';

function safeRead(handle) {
  try {
    const out = execFileSync(orcaBin, ['terminal', 'read', '--terminal', handle, '--screen'], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    });
    return out;
  } catch (err) {
    return `Error reading ${handle}: ${err.message}`;
  }
}

console.log('=== CLAUDE ===');
console.log(safeRead('term_103f0a57-5bb3-4f13-8e13-5154581113c3'));

console.log('=== CODEX ===');
console.log(safeRead('term_ff82e0bf-4c4e-4fe5-bf61-7c83dfe6a749'));

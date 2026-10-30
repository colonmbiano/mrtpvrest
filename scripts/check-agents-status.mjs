import { readTerminal } from './orca-dispatch.mjs';

const claude = 'term_103f0a57-5bb3-4f13-8e13-5154581113c3';
const codex = 'term_ff82e0bf-4c4e-4fe5-bf61-7c83dfe6a749';

console.log('=== CLAUDE CODE ===');
try {
  console.log(readTerminal(claude));
} catch (e) {
  console.error('Claude read error:', e.message);
}

console.log('=== OPENAI CODEX ===');
try {
  console.log(readTerminal(codex));
} catch (e) {
  console.error('Codex read error:', e.message);
}

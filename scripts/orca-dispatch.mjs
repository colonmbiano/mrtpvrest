import { execFileSync } from 'node:child_process';

const orcaBin = 'C:\\Users\\colon\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca.exe';

export function sendToTerminal(handle, text) {
  console.log(`Sending to ${handle}...`);
  const result = execFileSync(orcaBin, [
    'terminal',
    'send',
    '--terminal',
    handle,
    '--text',
    text,
    '--enter',
  ], { encoding: 'utf8' });
  console.log(`Result: ${result}`);
  return result;
}

export function readTerminal(handle) {
  return execFileSync(orcaBin, [
    'terminal',
    'read',
    '--terminal',
    handle,
    '--screen',
  ], { encoding: 'utf8' });
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'send') {
  const handle = args[1];
  const message = args.slice(2).join(' ');
  sendToTerminal(handle, message);
} else if (command === 'read') {
  const handle = args[1];
  console.log(readTerminal(handle));
} else {
  console.log('Usage: node scripts/orca-dispatch.mjs [send|read] [handle] [message...]');
}

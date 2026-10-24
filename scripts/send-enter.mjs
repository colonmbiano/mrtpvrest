import { sendToTerminal } from './orca-dispatch.mjs';

const terminal = process.argv[2];
if (terminal) {
  sendToTerminal(terminal, '\n');
}

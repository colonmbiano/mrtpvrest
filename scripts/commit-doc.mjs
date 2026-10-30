import { execSync } from 'node:child_process';
const cwd = 'C:\\Users\\colon\\AndroidStudioProjects\\mrtpvrest-marketplace';
execSync('git add docs/marketplace/backend-v1-plan-completado.md', { cwd });
execSync('git commit -m "docs(marketplace): certificar 38 suites y 1071 tests con saas dispatch ops y client coupons"', { cwd });
console.log('Doc commit OK');

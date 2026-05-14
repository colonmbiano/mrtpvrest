const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps/saas/app/(dashboard)/planes/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace --surf with --surface and --surf2 with --surface2
content = content.replace(/var\(--surf,/g, 'var(--surface,');
content = content.replace(/var\(--surf2,/g, 'var(--surface2,');

// Ensure inputs have color: var(--text)
content = content.replace(/style=\{\{ background: "var\(--surface2, #1a1a1a\)", border: "1px solid var\(--border, #333\)" \}\}/g, 'style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}');
content = content.replace(/style=\{\{ background: "var\(--surface2, #1a1a1a\)", border: "1px solid var\(--border, #333\)", color: "var\(--muted, #888\)" \}\}/g, 'style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}');

fs.writeFileSync(filePath, content);
console.log('Fixed planes/page.tsx');

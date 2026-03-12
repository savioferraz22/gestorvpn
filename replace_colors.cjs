const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replacements
const replacements = [
  { regex: /\bbg-white\b/g, replacement: 'bg-bg-surface' },
  { regex: /\btext-zinc-800\b/g, replacement: 'text-text-base' },
  { regex: /\btext-zinc-900\b/g, replacement: 'text-text-base' },
  { regex: /\btext-zinc-700\b/g, replacement: 'text-text-base' },
  { regex: /\btext-zinc-600\b/g, replacement: 'text-text-muted' },
  { regex: /\btext-zinc-500\b/g, replacement: 'text-text-muted' },
  { regex: /\btext-zinc-400\b/g, replacement: 'text-text-muted' },
  { regex: /\btext-zinc-300\b/g, replacement: 'text-text-muted' },
  { regex: /\bbg-zinc-50\b/g, replacement: 'bg-bg-surface-hover' },
  { regex: /\bbg-zinc-100\b/g, replacement: 'bg-bg-surface-hover' },
  { regex: /\bbg-zinc-800\b/g, replacement: 'bg-bg-surface-hover' },
  { regex: /\bbg-zinc-900\b/g, replacement: 'bg-bg-base' },
  { regex: /\bborder-zinc-100\b/g, replacement: 'border-border-base' },
  { regex: /\bborder-zinc-200\b/g, replacement: 'border-border-base' },
  { regex: /\bborder-zinc-800\b/g, replacement: 'border-border-base' },
  { regex: /\btext-zinc-100\b/g, replacement: 'text-text-base' },
];

replacements.forEach(({ regex, replacement }) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content);
console.log('Colors replaced in src/App.tsx');

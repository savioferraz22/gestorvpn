const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  { regex: /\bhover:bg-zinc-200\b/g, replacement: 'hover:bg-bg-surface' },
  { regex: /\bbg-zinc-300\b/g, replacement: 'bg-text-muted' },
  { regex: /\bfocus:ring-zinc-800\b/g, replacement: 'focus:ring-primary-500' },
];

replacements.forEach(({ regex, replacement }) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content);
console.log('More colors replaced in src/App.tsx');

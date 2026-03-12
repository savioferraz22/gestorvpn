const fs = require('fs');

let content = fs.readFileSync('src/index.css', 'utf8');

content = content.replace(':root {', '.dark {');
content = content.replace('.light {', ':root {');

fs.writeFileSync('src/index.css', content);
console.log('CSS updated');

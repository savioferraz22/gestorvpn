const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadHtmlAndExtractImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const match = data.match(/<meta property="og:image" content="([^"]+)"/);
        if (match && match[1]) {
          const imgUrl = match[1];
          console.log(`Found image URL for ${url}: ${imgUrl}`);
          https.get(imgUrl, (imgRes) => {
            const fileStream = fs.createWriteStream(outputPath);
            imgRes.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve(imgUrl);
            });
          }).on('error', reject);
        } else {
          reject(new Error('Image not found in ' + url));
        }
      });
    }).on('error', reject);
  });
}

Promise.all([
  // This seems to be just the icon
  downloadHtmlAndExtractImage('https://ibb.co/hxH6cxDf', path.join(__dirname, 'public/logo-icon.png')),
  // This seems to be the full logo with text
  downloadHtmlAndExtractImage('https://ibb.co/8LPFJn51', path.join(__dirname, 'public/logo.png'))
]).then(() => console.log('Successfully downloaded logos')).catch(console.error);

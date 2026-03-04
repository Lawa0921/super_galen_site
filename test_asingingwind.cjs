const fs = require('fs');

const htmlPath = 'src/content/guild/asingingwind.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// Check that the snap logic is actually removed
if (html.includes('snap: {')) {
    console.error('snap logic is STILL present');
} else {
    console.log('snap logic removed');
}

if (html.includes('oasisGroup')) {
    console.log('oasis group present');
}

if (html.includes('terrain.position.z = (time * 5);')) {
    console.log('jumping terrain fixed');
}

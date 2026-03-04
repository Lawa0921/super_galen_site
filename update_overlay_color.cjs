const fs = require('fs');

const htmlPath = 'src/content/guild/asingingwind.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// The original document.body.style.backgroundColor transition logic in onUpdate was slightly broken and flashing.
// We should properly linearly interpolate it or let CSS handle it.

const onUpdateCode = `          onUpdate: (self) => {
            // Update global state for Three.js render loop
            ThreeSceneState.progress = self.progress;

            // Also fade the HTML overlay gradient to match the night theme
            if(self.progress > 0.5) {
                const darkProgress = (self.progress - 0.5) * 2; // 0 to 1 in second half
                overlay.style.background = \`linear-gradient(to bottom, transparent 40%, rgba(28, 35, 49, \${0.6 + darkProgress * 0.3}) 100%)\`;
                // Linearly interpolate the background color manually to avoid strings
                const r = Math.round(232 - (232-28)*darkProgress);
                const g = Math.round(211 - (211-35)*darkProgress);
                const b = Math.round(162 - (162-49)*darkProgress);
                document.body.style.backgroundColor = \`rgb(\${r}, \${g}, \${b})\`;
            } else {
                overlay.style.background = \`linear-gradient(to bottom, transparent 40%, rgba(232, 211, 162, 0.6) 100%)\`;
                document.body.style.backgroundColor = \`var(--sand-light)\`;
            }
          }`;

html = html.replace(/onUpdate: \(self\) => \{[\s\S]*?\}\n        \}/, onUpdateCode + '\n        }');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Updated overlay color transition');

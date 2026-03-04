const fs = require('fs');

const htmlPath = 'src/content/guild/asingingwind.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Fix Terrain Jumping: Remove modulo loop, make it infinite scroll
html = html.replace(
  'terrain.position.z = (time * 15) % 20;',
  'terrain.position.z = (time * 10); // Smooth continuous scroll instead of jumping'
);

// 2. Add Oasis Elements to Three.js
// Inject Oasis generation before mouse event listener
const oasisGeometryCode = `
      // Distant Oasis Light
      const oasisLight = new THREE.PointLight(0x4A5D23, 2, 100);
      oasisLight.position.set(-40, 5, -80);
      scene.add(oasisLight);

      // --- NEW: Oasis Visuals (Glowing Crystals / Plant representations) ---
      const oasisGroup = new THREE.Group();
      oasisGroup.position.set(0, -10, -150); // Positioned deep in the scene
      scene.add(oasisGroup);

      // Water Surface
      const waterGeo = new THREE.PlaneGeometry(80, 80);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0, // Starts invisible
        roughness: 0.1,
        metalness: 0.8
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.y = 1;
      oasisGroup.add(water);

      // Glowing Oasis Crystals/Trees
      const crystalMats = new THREE.MeshStandardMaterial({
        color: 0x2E472D,
        emissive: 0x4A5D23,
        emissiveIntensity: 0, // Starts dark
        transparent: true,
        opacity: 0.9,
        roughness: 0.2
      });

      const crystals = [];
      for(let i=0; i<15; i++) {
        const h = Math.random() * 15 + 5;
        const geo = new THREE.CylinderGeometry(0, Math.random() * 2 + 1, h, 6);
        const mesh = new THREE.Mesh(geo, crystalMats);
        mesh.position.x = (Math.random() - 0.5) * 60;
        mesh.position.z = (Math.random() - 0.5) * 60;
        mesh.position.y = h/2;

        // Tilt slightly
        mesh.rotation.x = (Math.random() - 0.5) * 0.2;
        mesh.rotation.z = (Math.random() - 0.5) * 0.2;

        oasisGroup.add(mesh);
        crystals.push(mesh);
      }

      const oasisParticles = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
         size: 10, color: 0x86efac, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      oasisParticles.position.copy(oasisGroup.position);
      scene.add(oasisParticles);
      // --- END Oasis Visuals ---

`;

html = html.replace(
  /\/\/ Distant Oasis Light[\s\S]*?scene\.add\(oasisLight\);/,
  oasisGeometryCode
);

// 3. Update the Animate loop to handle Oasis fade-in
const animateUpdateCode = `
        terrain.material.color.lerpColors(ThreeSceneState.sandColor, ThreeSceneState.nightSandColor, p);

        // --- NEW: Fade in Oasis ---
        // As scroll progress increases, make water and crystals visible
        const oasisVisibility = Math.max(0, (p - 0.5) * 2); // 0 to 1 in second half of scroll
        water.material.opacity = oasisVisibility * 0.8;
        crystalMats.emissiveIntensity = oasisVisibility * 1.5;
        oasisParticles.material.opacity = oasisVisibility * 0.6;

        // Animate water
        water.position.y = 1 + Math.sin(time * 3) * 0.5;

        // Move oasis group towards camera based on scroll, instead of static position
        // This gives the feeling of arriving at the oasis
        oasisGroup.position.z = -200 + (p * 150);
        oasisParticles.position.z = oasisGroup.position.z;
        oasisParticles.rotation.y = time * 0.2;
        // --- END Oasis Animation ---

        // Slow down wind at night
`;

html = html.replace(
  /terrain\.material\.color\.lerpColors\(ThreeSceneState\.sandColor, ThreeSceneState\.nightSandColor, p\);[\s\S]*?\/\/ Slow down wind at night/,
  animateUpdateCode
);


// 4. Smooth scrolling: Remove snap from ScrollTrigger
const scrollTriggerCode = `snap: {
            snapTo: 1 / (panels.length - 1),
            duration: {min: 0.2, max: 0.5},
            delay: 0.1,
            ease: "power1.inOut"
          },`;

html = html.replace(scrollTriggerCode, '// Removed snap for smoother continuous scrolling\n');

// 5. Fix Overlay color transition error (document.body wasn't defined correctly in the scope sometimes or threw off the background)
// Replace the onUpdate section to ensure smooth color transitions
const onUpdateCode = `          onUpdate: (self) => {
            // Update global state for Three.js render loop
            ThreeSceneState.progress = self.progress;

            // Also fade the HTML overlay gradient to match the night theme
            if(self.progress > 0.5) {
                const darkProgress = (self.progress - 0.5) * 2; // 0 to 1 in second half
                overlay.style.background = \`linear-gradient(to bottom, transparent 40%, rgba(28, 35, 49, \${0.6 + darkProgress * 0.3}) 100%)\`;
                document.body.style.backgroundColor = \`rgba(\${232 - (232-28)*darkProgress}, \${211 - (211-35)*darkProgress}, \${162 - (162-49)*darkProgress}, 1)\`;
            } else {
                overlay.style.background = \`linear-gradient(to bottom, transparent 40%, rgba(232, 211, 162, 0.6) 100%)\`;
                document.body.style.backgroundColor = \`var(--sand-light)\`;
            }
          }`;

html = html.replace(/onUpdate: \(self\) => \{[\s\S]*?\}\n        \}/, onUpdateCode + '\n        }');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Updated asingingwind.html');

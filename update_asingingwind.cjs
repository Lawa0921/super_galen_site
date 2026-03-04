const fs = require('fs');

const htmlPath = 'src/content/guild/asingingwind.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Fix Terrain Jumping: Remove modulo loop, make it infinite scroll
html = html.replace(
  'terrain.position.z = (time * 15) % 20;',
  'terrain.position.z = (time * 5); // Smooth continuous scroll instead of jumping'
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
        oasisGroup.position.z = -150 + (p * 130);
        oasisParticles.position.z = oasisGroup.position.z;
        oasisParticles.rotation.y = time * 0.2;
        // --- END Oasis Animation ---

        // Slow down wind at night
`;

html = html.replace(
  /terrain\.material\.color\.lerpColors\(ThreeSceneState\.sandColor, ThreeSceneState\.nightSandColor, p\);\s*\/\/ Slow down wind at night/,
  animateUpdateCode
);


// 4. Smooth scrolling: Remove snap from ScrollTrigger
html = html.replace(/snap:\s*\{[\s\S]*?\},/, '// snap removed for smoother scrolling\n          ');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Updated asingingwind.html');

const fs = require('fs');
const filepath = 'src/content/guild/naomiao77.html';
let content = fs.readFileSync(filepath, 'utf8');

// 1. Update Cloud Styles
const oldCloudStyle = `
        /* Background Overlays */
        #webgl-container, .cloud-layer, #p5-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 0;
        }
`;

const newCloudStyle = `
        /* Background Overlays */
        #webgl-container, .cloud-layer, #p5-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 0;
            overflow: hidden;
        }

        /* Book Texture Background */
        body {
            background-color: #F8F6F0; /* Creamy paper */
            background-image:
                url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E"),
                repeating-linear-gradient(0deg, transparent, transparent 39px, #E5E0D5 39px, #E5E0D5 40px); /* Subtle notebook lines */
            background-blend-mode: multiply;
        }

        /* The 'Book' Container for content to give it edges */
        .book-container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255,255,255,0.6);
            backdrop-filter: blur(5px);
            border-left: 2px solid #E5E0D5;
            border-right: 2px solid #E5E0D5;
            box-shadow:
                0 0 40px rgba(0,0,0,0.03),
                inset 10px 0 20px rgba(0,0,0,0.02), /* Spine shadow */
                inset -10px 0 20px rgba(0,0,0,0.02);
            position: relative;
            z-index: 10;
        }

        /* SVG Cloud Absolute Positioning */
        .svg-cloud {
            position: absolute;
            will-change: transform;
            pointer-events: none;
        }

        .cloud-character {
            position: absolute;
            bottom: 60%; /* Sit on top of the cloud */
            left: 40%;
            width: 60px;
            height: auto;
            transform-origin: bottom center;
            animation: bounce 2s infinite ease-in-out;
        }

        @keyframes bounce {
            0%, 100% { transform: translateY(0) scaleY(1); }
            50% { transform: translateY(-15px) scaleY(1.05); }
        }
`;

content = content.replace(oldCloudStyle, newCloudStyle);

// Wrap main content in book-container
content = content.replace('<main class="relative z-10 w-full min-h-screen overflow-hidden pb-32">', '<main class="relative z-10 w-full min-h-screen pb-32 book-container">');

// Update Cloud Generation Script and Characters
const oldCloudScript = `
        // 3. SVG Hand-Drawn Cloud Generator (Replaces WebGL for Pop-up Book feel)
        const createClouds = () => {
            const backLayer = document.getElementById('cloud-layer-back');
            const frontLayer = document.getElementById('cloud-layer-front');

            // Cloud SVG Path - simple, fluffy, hand-drawn look
            const cloudSVG = \`
            <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 80 C20 80 10 50 30 30 C30 10 70 0 90 20 C110 -10 160 -10 180 20 C200 40 190 80 160 80 Z" fill="#ffffff" />
            </svg>
            \`;

            // Function to spawn clouds
            const spawnClouds = (layer, count, scaleRange, opacity, speedRange, parallaxY) => {
                for (let i = 0; i < count; i++) {
                    const cloud = document.createElement('div');
                    cloud.className = 'svg-cloud';
                    cloud.innerHTML = cloudSVG;

                    // Randomize properties
                    const scale = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
                    const startX = Math.random() * 120 - 10; // -10vw to 110vw
                    const startY = Math.random() * 100; // 0vh to 100vh
                    const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);

                    cloud.style.width = \`\${200 * scale}px\`;
                    cloud.style.left = \`\${startX}vw\`;
                    cloud.style.top = \`\${startY}vh\`;
                    cloud.style.opacity = opacity;

                    // Subtle tint for depth
                    if (layer === backLayer) {
                        cloud.style.filter = 'drop-shadow(0 10px 15px rgba(0,0,0,0.05)) brightness(0.95)';
                    }

                    layer.appendChild(cloud);

                    // GSAP Animation for drifting
                    gsap.to(cloud, {
                        x: \`+=\${window.innerWidth * speed}\`,
                        duration: 100 / speed, // Slower speed = longer duration
                        ease: "none",
                        repeat: -1,
                        modifiers: {
                            x: gsap.utils.unitize(x => parseFloat(x) % (window.innerWidth + 400) - 200) // Wrap around
                        }
                    });

                    // GSAP ScrollTrigger for Parallax Y
                    gsap.to(cloud, {
                        yPercent: parallaxY,
                        ease: "none",
                        scrollTrigger: {
                            trigger: "body",
                            start: "top top",
                            end: "bottom bottom",
                            scrub: true
                        }
                    });
                }
            };

            // Back layer (slower, smaller, moving up slightly on scroll)
            spawnClouds(backLayer, 15, [1.0, 2.0], 0.6, [0.05, 0.1], -20);

            // Front layer (faster, larger, moving up more on scroll)
            spawnClouds(frontLayer, 10, [2.0, 4.0], 0.9, [0.1, 0.2], -50);
        };
        createClouds();
`;

const newCloudScript = `
        // 3. SVG Hand-Drawn Cloud Generator (Pop-up Book feel)
        const createClouds = () => {
            const backLayer = document.getElementById('cloud-layer-back');
            const frontLayer = document.getElementById('cloud-layer-front');

            // Multiple Cloud SVG Paths for variety - more fluffy, hand-drawn look with subtle strokes
            const cloudSVGs = [
                // Cloud 1
                \`<svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 85 C20 85 10 55 30 35 C30 15 70 5 90 25 C110 -5 160 -5 180 25 C200 45 190 85 160 85 Z" fill="#ffffff" stroke="#E5E0D5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>\`,
                // Cloud 2
                \`<svg viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M40 90 C10 90 5 60 25 40 C35 20 65 10 85 30 C105 0 155 0 175 30 C195 10 230 40 210 70 C225 90 190 90 170 90 Z" fill="#ffffff" stroke="#E5E0D5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>\`
            ];

            // Character SVG to jump on clouds (Cute Cat / Little Girl representation)
            const characterSVG = \`
                <svg class="cloud-character" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <!-- A simple cute white cat with minimal lines -->
                    <path d="M20 50 L30 20 L50 40 L70 20 L80 50 C90 70 80 90 50 90 C20 90 10 70 20 50 Z" fill="#ffffff" stroke="#A8B4A5" stroke-width="4" stroke-linejoin="round"/>
                    <!-- Eyes -->
                    <circle cx="35" cy="60" r="4" fill="#506055"/>
                    <circle cx="65" cy="60" r="4" fill="#506055"/>
                    <!-- Blush -->
                    <circle cx="25" cy="65" r="5" fill="#FFC0CB" opacity="0.6"/>
                    <circle cx="75" cy="65" r="5" fill="#FFC0CB" opacity="0.6"/>
                    <!-- Nose/Mouth -->
                    <path d="M45 65 Q50 70 55 65" stroke="#506055" stroke-width="3" stroke-linecap="round"/>
                </svg>
            \`;

            // Function to spawn clouds
            const spawnClouds = (layer, count, scaleRange, opacity, speedRange, parallaxY, withCharacters = false) => {
                for (let i = 0; i < count; i++) {
                    const cloudWrapper = document.createElement('div');
                    cloudWrapper.className = 'svg-cloud';

                    // Random cloud type
                    const cloudType = Math.floor(Math.random() * cloudSVGs.length);
                    cloudWrapper.innerHTML = cloudSVGs[cloudType];

                    // Randomize properties
                    const scale = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
                    const startX = Math.random() * 120 - 10; // -10vw to 110vw
                    const startY = Math.random() * 100; // 0vh to 100vh
                    const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);

                    cloudWrapper.style.width = \`\${200 * scale}px\`;
                    cloudWrapper.style.left = \`\${startX}vw\`;
                    cloudWrapper.style.top = \`\${startY}vh\`;
                    cloudWrapper.style.opacity = opacity;

                    // Subtle tint for depth
                    if (layer === backLayer) {
                        cloudWrapper.style.filter = 'drop-shadow(0 15px 25px rgba(0,0,0,0.08)) brightness(0.92)';
                    } else {
                        cloudWrapper.style.filter = 'drop-shadow(0 20px 30px rgba(0,0,0,0.1))';
                    }

                    // Occasionally add a jumping character on front clouds
                    if (withCharacters && Math.random() > 0.6) {
                        const charWrapper = document.createElement('div');
                        charWrapper.innerHTML = characterSVG;
                        // Randomize character position on the cloud slightly
                        const charEl = charWrapper.firstElementChild;
                        charEl.style.left = \`\${30 + Math.random() * 20}%\`;
                        charEl.style.animationDelay = \`\${Math.random() * 2}s\`;
                        cloudWrapper.appendChild(charEl);
                    }

                    layer.appendChild(cloudWrapper);

                    // GSAP Animation for drifting
                    gsap.to(cloudWrapper, {
                        x: \`+=\${window.innerWidth * speed}\`,
                        duration: 100 / speed, // Slower speed = longer duration
                        ease: "none",
                        repeat: -1,
                        modifiers: {
                            x: gsap.utils.unitize(x => parseFloat(x) % (window.innerWidth + 400) - 200) // Wrap around
                        }
                    });

                    // GSAP ScrollTrigger for Parallax Y
                    gsap.to(cloudWrapper, {
                        yPercent: parallaxY,
                        ease: "none",
                        scrollTrigger: {
                            trigger: "body",
                            start: "top top",
                            end: "bottom bottom",
                            scrub: true
                        }
                    });
                }
            };

            // Back layer (slower, smaller, moving up slightly on scroll)
            spawnClouds(backLayer, 18, [1.0, 2.5], 0.7, [0.03, 0.08], -30, false);

            // Front layer (faster, larger, moving up more on scroll, some have jumping cats)
            spawnClouds(frontLayer, 12, [2.0, 4.5], 1.0, [0.08, 0.15], -80, true);
        };
        createClouds();
`;

content = content.replace(oldCloudScript, newCloudScript);
fs.writeFileSync(filepath, content);

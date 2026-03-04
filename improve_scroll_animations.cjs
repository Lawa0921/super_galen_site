const fs = require('fs');
const filepath = 'src/content/guild/naomiao77.html';
let content = fs.readFileSync(filepath, 'utf8');

// Update Lenis for tighter scroll
const oldLenis = `
        // 1. Initialize Lenis for Smooth Scrolling
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            smoothTouch: false,
            touchMultiplier: 2,
        });
`;

const newLenis = `
        // 1. Initialize Lenis for Smooth Scrolling (Tuned for better feel)
        const lenis = new Lenis({
            duration: 0.8, /* Faster, more responsive */
            easing: (t) => 1 - Math.pow(1 - t, 4), /* Snappier ease out */
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            smoothTouch: false,
            touchMultiplier: 1.5,
        });
`;

content = content.replace(oldLenis, newLenis);

// Update GSAP Animations to feel like "Pop-up Book Pages"
const oldGsap = `
        // Reveal animations for polaroids in Chapter 2 & 3
        const revealElements = document.querySelectorAll('.gs-reveal');
        revealElements.forEach((el, i) => {
            gsap.fromTo(el,
                { autoAlpha: 0, y: 100, rotationZ: () => Math.random() * 20 - 10 },
                {
                    duration: 1.5,
                    autoAlpha: 1,
                    y: 0,
                    rotationZ: el.style.transform.match(/rotate\\((.*?)deg\\)/) ? el.style.transform.match(/rotate\\((.*?)deg\\)/)[1] : 0, // Restore original inline rotation
                    ease: "back.out(1.2)",
                    scrollTrigger: {
                        trigger: el,
                        start: "top 85%",
                        toggleActions: "play none none reverse"
                    }
                }
            );
        });
`;

const newGsap = `
        // Reveal animations for polaroids in Chapter 2 & 3 (Pop-up Book Effect)
        const revealElements = document.querySelectorAll('.gs-reveal');
        revealElements.forEach((el, i) => {
            // Apply a 3D perspective to the parent to make the fold-out look good
            gsap.set(el.parentElement, { perspective: 1000 });
            gsap.set(el, { transformOrigin: "bottom center" });

            gsap.fromTo(el,
                {
                    autoAlpha: 0,
                    rotationX: -80, // Folded down flat
                    rotationZ: () => Math.random() * 30 - 15,
                    scale: 0.8,
                    y: 100
                },
                {
                    duration: 1.8,
                    autoAlpha: 1,
                    rotationX: 0, // Stand up
                    scale: 1,
                    y: 0,
                    rotationZ: el.style.transform.match(/rotate\\((.*?)deg\\)/) ? el.style.transform.match(/rotate\\((.*?)deg\\)/)[1] : 0,
                    ease: "elastic.out(1, 0.6)", // Bouncy pop-up
                    scrollTrigger: {
                        trigger: el,
                        start: "top 90%",
                        end: "top 40%",
                        scrub: 1, // Tie it to scroll for a true interactive book feel
                        toggleActions: "play none none reverse"
                    }
                }
            );
        });

        // Add a "page turn" or floating effect to chapter titles
        const sectionTitles = document.querySelectorAll('h2');
        sectionTitles.forEach((title) => {
            gsap.from(title, {
                y: 50,
                opacity: 0,
                duration: 1,
                scrollTrigger: {
                    trigger: title,
                    start: "top 85%",
                    toggleActions: "play none none reverse"
                }
            });
        });
`;

content = content.replace(oldGsap, newGsap);
fs.writeFileSync(filepath, content);

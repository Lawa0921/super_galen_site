import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Guild Mian Page', () => {
  let html: string;

  beforeAll(() => {
    const filePath = path.join(__dirname, 'mian.html');
    html = fs.readFileSync(filePath, 'utf-8');
  });

  describe('Content Expansion', () => {
    it('should have expanded lens section with at least 3 paragraphs', () => {
      // Extract lens section content between id="lens" and next section
      const lensSection = html.match(/id="lens"[\s\S]*?(?=<section|<\/main)/)?.[0] ?? '';
      const paragraphs = lensSection.match(/<p[\s\S]*?<\/p>/g) ?? [];
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    });

    it('should have expanded craft section with at least 3 paragraphs', () => {
      const craftSection = html.match(/id="craft"[\s\S]*?(?=<section|<\/main)/)?.[0] ?? '';
      const paragraphs = craftSection.match(/<p[\s\S]*?<\/p>/g) ?? [];
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    });

    it('should have expanded ride section with at least 3 paragraphs', () => {
      const rideSection = html.match(/id="ride"[\s\S]*?(?=<section|<\/main)/)?.[0] ?? '';
      const paragraphs = rideSection.match(/<p[\s\S]*?<\/p>/g) ?? [];
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    });

    it('should have expanded style section with at least 2 paragraphs', () => {
      const styleSection = html.match(/id="style"[\s\S]*?(?=<\/main)/)?.[0] ?? '';
      const paragraphs = styleSection.match(/<p[\s\S]*?<\/p>/g) ?? [];
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Performance Optimization', () => {
    it('should NOT use Tailwind CDN (cdn.tailwindcss.com)', () => {
      expect(html).not.toContain('cdn.tailwindcss.com');
    });

    it('should use Font Awesome CDN for icons (consistent with other guild pages)', () => {
      expect(html).toContain('cdnjs.cloudflare.com/ajax/libs/font-awesome');
    });

    it('should use fa-brands fa-threads for Threads icon', () => {
      expect(html).toContain('fa-brands fa-threads');
    });

    it('should use fa-brands fa-instagram for Instagram icon', () => {
      expect(html).toContain('fa-brands fa-instagram');
    });

    it('should have width and height on all img tags', () => {
      const imgTags = html.match(/<img[^>]*>/g) ?? [];
      expect(imgTags.length).toBeGreaterThan(0);
      for (const img of imgTags) {
        expect(img).toMatch(/width="/);
        expect(img).toMatch(/height="/);
      }
    });

    it('should defer non-critical scripts (GSAP, Three.js)', () => {
      const gsapScript = html.match(/<script[^>]*gsap\.min\.js[^>]*>/)?.[0] ?? '';
      const threeScript = html.match(/<script[^>]*three\.min\.js[^>]*>/)?.[0] ?? '';
      if (gsapScript) {
        expect(gsapScript).toContain('defer');
      }
      if (threeScript) {
        expect(threeScript).toContain('defer');
      }
    });
  });

  describe('Avatar Display', () => {
    it('should NOT use grayscale filter on avatar', () => {
      // Avatar image line should not contain grayscale class
      const avatarImg = html.match(/<img[^>]*avatar\.webp[^>]*>/)?.[0] ?? '';
      expect(avatarImg).not.toContain('grayscale');
    });

    it('should NOT force a tall aspect ratio that causes excessive height', () => {
      const avatarImg = html.match(/<img[^>]*avatar\.webp[^>]*>/)?.[0] ?? '';
      expect(avatarImg).not.toContain('aspect-4-5');
      expect(avatarImg).not.toContain('object-cover');
    });
  });

  describe('Dead Code Removal', () => {
    it('should NOT have unused colors array declaration', () => {
      // The `colors` array was populated but never read
      expect(html).not.toMatch(/const colors\s*=\s*\[\]/);
    });

    it('should NOT have redundant targetX/targetY assignments', () => {
      // targetX = mouseX and targetY = mouseY were redundant intermediaries
      expect(html).not.toMatch(/targetX\s*=\s*mouseX/);
      expect(html).not.toMatch(/targetY\s*=\s*mouseY/);
    });

    it('should NOT have unused windowHalfX/windowHalfY that never update on resize', () => {
      expect(html).not.toMatch(/const windowHalfX/);
      expect(html).not.toMatch(/const windowHalfY/);
    });
  });

  describe('Structural Integrity', () => {
    it('should have all 4 section IDs', () => {
      expect(html).toContain('id="lens"');
      expect(html).toContain('id="craft"');
      expect(html).toContain('id="ride"');
      expect(html).toContain('id="style"');
    });

    it('should have social links for Instagram and Threads', () => {
      expect(html).toContain('instagram.com/zero_w9453');
      expect(html).toContain('threads.net/@zero_w9453');
    });

    it('should have back to guild link', () => {
      expect(html).toContain('href="/guild/"');
    });

    it('should have Three.js tunnel animation', () => {
      expect(html).toContain('THREE.Scene');
      expect(html).toContain('InstancedMesh');
    });

    it('should have GSAP scroll animations', () => {
      expect(html).toContain('gsap.registerPlugin');
      expect(html).toContain('ScrollTrigger');
    });
  });
});

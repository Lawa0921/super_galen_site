# Guild Page Finalize

When the user says "finalize guild page" or similar, run through this checklist for the specified guild member page.

## Checklist

1. **Performance Audit**
   - Remove unused CSS classes (search for selectors not referenced in HTML)
   - Remove unused CSS variables (search for `--var` definitions not used in any rule)
   - Remove dead JavaScript code (unused variables, unreachable code, redundant ternaries)
   - Consolidate multiple scroll listeners into one unified handler with `requestAnimationFrame` throttling
   - Check for CSS animation conflicts with GSAP transforms (remove CSS animations if GSAP controls the same property)
   - Verify no heavy libraries loaded unnecessarily (e.g. p5.js for simple canvas work)
   - Ensure Google Fonts only loads weights actually used
   - Check all images use `loading="lazy"` except hero/above-fold images

2. **Hall of Fame Verification**
   - Read `src/data/hall-of-fame.yml`
   - Verify the member entry exists with: id, name, avatar, page, tags
   - Verify avatar path in YAML matches an actual file in `public/assets/img/guild/{member}/`
   - Verify page path matches the actual HTML file in `src/content/guild/`

3. **Image Path Verification**
   - Extract all image `src` attributes from the guild HTML file
   - Verify each referenced image exists in `public/` (paths are relative to public root)
   - Check for orphan images in the member's image directory (files not referenced by the HTML)
   - Ensure all images are in webp format

4. **Link Verification**
   - Verify all external links (social media, websites) are correct URLs
   - Verify internal links (`/guild/` back link) are correct
   - Check `target="_blank"` and `rel="noopener noreferrer"` on external links

5. **Commit (only when all checks pass)**
   - Stage ONLY files related to this guild member:
     - `src/content/guild/{member}.html`
     - `public/assets/img/guild/{member}/*`
     - `src/data/hall-of-fame.yml` (only if modified for this member)
   - Do NOT stage unrelated files (screenshots, other guild pages, etc.)
   - Use conventional commit format: `feat: add {member_name} guild page with {theme_description}`

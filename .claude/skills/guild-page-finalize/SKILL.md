---
name: guild-page-finalize
description: Use when a guild page is ready for final QA before commit. Runs performance audit, removes dead code, verifies hall-of-fame.yml entry, checks image paths, validates links, and commits only the relevant files. Trigger when user says "finalize guild page", "optimize and commit guild page", or similar.
---

# Guild Page Finalize

Run this checklist for the specified guild member page before committing.

## Input

The guild member ID (e.g. `jaded_frog_omg`). Derive from context if not explicitly given.

## Checklist

### 1. Performance Audit

Scan the guild HTML file (`src/content/guild/{member}.html`):

- **Dead CSS**: Search for CSS selectors not referenced anywhere in the HTML body. Remove them.
- **Dead CSS variables**: Search for `--var-name` definitions in `:root` that are never used in any CSS rule. Remove them.
- **Dead JS**: Find unused variables, unreachable code, redundant expressions (e.g. `x ? val : val`). Remove them.
- **Scroll handler consolidation**: If there are multiple `window.addEventListener('scroll', ...)`, merge into one unified handler using `requestAnimationFrame` throttling.
- **CSS/GSAP conflicts**: If a CSS `animation` or `transition` targets the same property GSAP is animating (e.g. `transform`), remove the CSS animation to prevent conflicts.
- **Heavy libraries**: Check if any loaded library (p5.js, Three.js, etc.) can be replaced with lighter vanilla code for the actual use case.
- **Google Fonts**: Ensure only actually-used font families and weights are loaded. Remove unused families or weights from the `<link>` URL.
- **Lazy loading**: All images below the fold should have `loading="lazy"`. Hero/above-fold images should NOT.

### 2. Hall of Fame Verification

Read `src/data/hall-of-fame.yml` and verify the member entry:

```
Required fields:
- id: "{member_id}"          # Must be unique
- name: "Display Name"       # Chinese display name
- avatar: "/assets/img/guild/{member}/avatar.webp"
- page: "/guild/{member}.html"
- tags:                       # 1-3 tags
    - id: "tag_id"
      label: "Tag Label"
```

Then verify:
- Avatar file exists at `public/assets/img/guild/{member}/avatar.webp`
- HTML file exists at `src/content/guild/{member}.html`

### 3. Image Path Verification

Extract all `src="..."` from `<img>` tags in the guild HTML. For each:
- Verify the file exists under `public/` (image paths are served from public root)
- Flag any missing images

Then check the member's image directory (`public/assets/img/guild/{member}/`):
- List all files
- Flag orphan images not referenced by the HTML
- Ensure all images are `.webp` format (no leftover `.jpg`/`.png`)

### 4. Link Verification

Extract all `<a href="...">` from the guild HTML:
- **External links**: Verify they look like valid URLs (https://)
- **External links**: Must have `target="_blank"` and `rel="noopener noreferrer"`
- **Internal links**: Verify `/guild/` back link exists
- **Social links**: Cross-check with the member's known social profiles

### 5. Commit

Only proceed when all checks pass.

```bash
# Stage ONLY this member's files
git add src/content/guild/{member}.html
git add public/assets/img/guild/{member}/
git add src/data/hall-of-fame.yml  # only if modified

# Do NOT stage:
# - Screenshots (*.png, *.jpg in root)
# - Other guild member files
# - Unrelated modified files

# Commit format
git commit -m "feat: add {display_name} guild page with {theme} theme"
```

## Output

Report each checklist step result:
- Items found and fixed (dead code removed, etc.)
- Verification results (pass/fail for each check)
- Final commit hash and staged file list

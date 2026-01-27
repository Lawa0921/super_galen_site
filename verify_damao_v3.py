
import os
import re

html_path = 'guild/damao.html'
with open(html_path, 'r') as f:
    content = f.read()

# Check image sources
img_srcs = re.findall(r'src=["\']\.\./([^"\']+)["\']', content)
# Also check dynamically generated srcs in JS
# JS: `../assets/img/guild/damao/process_${i}.webp`
# JS: `../assets/img/guild/damao/gallery_${i}.webp`
# JS: `../assets/img/guild/damao/avatar_v2.webp`

print(f"Found {len(img_srcs)} static image references.")

missing = []
for src in img_srcs:
    # src is relative to guild/ so ../assets -> assets/
    fs_path = src # since src captured is assets/...
    if not os.path.exists(fs_path):
        missing.append(fs_path)

if missing:
    print("Missing files:", missing)
    exit(1)
else:
    print("All static images found.")

# Verify dynamic assets existence
base_dir = 'assets/img/guild/damao/'
for i in range(1, 11):
    p = os.path.join(base_dir, f'process_{i}.webp')
    if not os.path.exists(p):
        print(f"Missing dynamic asset: {p}")
        exit(1)

for i in range(1, 21):
    p = os.path.join(base_dir, f'gallery_{i}.webp')
    if not os.path.exists(p):
        print(f"Missing dynamic asset: {p}")
        exit(1)

print("Dynamic assets verified.")
print("Verification passed.")

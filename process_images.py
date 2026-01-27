
import os
import glob
from PIL import Image

# Source and Destination
src_dir = '/tmp/file_attachments/'
dst_dir = 'assets/img/guild/damao/'
os.makedirs(dst_dir, exist_ok=True)

# Specific mapping
# 621665114... is Avatar/ZiHeng
avatar_src = glob.glob(os.path.join(src_dir, '621665114*'))[0]
novel_src = glob.glob(os.path.join(src_dir, '622371358*'))[0]

# Convert Avatar
img = Image.open(avatar_src)
img.save(os.path.join(dst_dir, 'avatar_v2.webp'), 'WEBP')
img.save(os.path.join(dst_dir, 'novel_char_ziheng.webp'), 'WEBP') # Reuse for Novel section

# Convert Novel Cover
img = Image.open(novel_src)
img.save(os.path.join(dst_dir, 'novel_1.webp'), 'WEBP')

# Process Marquee Images (Pick 10 random ones that are NOT the avatar/novel ones)
all_jpgs = glob.glob(os.path.join(src_dir, '*.jpg'))
# Filter out used ones to avoid dupes in marquee if possible
used_srcs = [avatar_src, novel_src]
process_candidates = [f for f in all_jpgs if f not in used_srcs]

# Take first 10
for i, fpath in enumerate(process_candidates[:10]):
    img = Image.open(fpath)
    # Resize for marquee optimization (height 400px)
    aspect = img.width / img.height
    new_h = 400
    new_w = int(new_h * aspect)
    img = img.resize((new_w, new_h))
    img.save(os.path.join(dst_dir, f'process_{i+1}.webp'), 'WEBP')

print("Conversion complete.")

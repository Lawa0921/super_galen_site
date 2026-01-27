
import os
import hashlib
from PIL import Image
import shutil
import glob

SOURCE_DIR = "/tmp/file_attachments"
TARGET_DIR = "assets/img/guild/damao"
AVATAR_SOURCE = "612994948_17869347735533461_4758464365579241124_n.jpg"

def get_file_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

def process():
    if not os.path.exists(TARGET_DIR):
        os.makedirs(TARGET_DIR)

    # 1. Process Avatar
    avatar_src_path = os.path.join(SOURCE_DIR, AVATAR_SOURCE)
    if os.path.exists(avatar_src_path):
        img = Image.open(avatar_src_path)
        img.save(os.path.join(TARGET_DIR, "avatar_v3.webp"), "WEBP")
        print(f"Processed avatar_v3.webp from {AVATAR_SOURCE}")
    else:
        print(f"Warning: Avatar source {AVATAR_SOURCE} not found!")

    # 2. Gather all candidate images for Gallery
    # We will exclude the specific novel/avatar images from the gallery pool if possible,
    # or just let them be distinct.

    # Existing webp in target (excluding special ones)
    existing_files = glob.glob(os.path.join(TARGET_DIR, "*.webp"))

    # New jpgs in source
    new_files = glob.glob(os.path.join(SOURCE_DIR, "*.jpg"))

    # Map of hash -> filepath
    unique_images = {}

    # Special files to preserve (don't rename/delete these, but track their hash to avoid duplicates in gallery)
    preserved_names = ["avatar.webp", "avatar_v2.webp", "avatar_v3.webp", "novel_1.webp", "novel_char_ziheng.webp", "merch_showcase.webp"]
    preserved_hashes = set()

    for p in preserved_names:
        path = os.path.join(TARGET_DIR, p)
        if os.path.exists(path):
            h = get_file_hash(path)
            preserved_hashes.add(h)

    # Temporary list for gallery candidates
    gallery_candidates = []

    # Add existing gallery/process images to candidates
    for f in existing_files:
        name = os.path.basename(f)
        if name in preserved_names:
            continue
        gallery_candidates.append(f)

    # Add new source files to candidates
    for f in new_files:
        # Skip the avatar source if we want (though it might be in gallery too)
        if os.path.basename(f) == AVATAR_SOURCE:
            continue
        gallery_candidates.append(f)

    # Deduplicate
    final_gallery_images = []
    seen_hashes = set()

    # Pre-populate seen hashes with preserved ones so we don't duplicate avatar in gallery
    seen_hashes.update(preserved_hashes)

    print(f"Scanning {len(gallery_candidates)} candidates...")

    for f in gallery_candidates:
        try:
            h = get_file_hash(f)
            if h not in seen_hashes:
                seen_hashes.add(h)
                final_gallery_images.append(f)
        except Exception as e:
            print(f"Error reading {f}: {e}")

    # 3. Write out new Gallery
    # We will overwrite the 'gallery_X.webp' sequence.
    # We will also clear out old 'process_X.webp' since user wants videos (or we will re-purpose them if needed, but for now let's just make a clean gallery).

    # Clean up old gallery/process files in target (except preserved)
    for f in existing_files:
        name = os.path.basename(f)
        if name not in preserved_names:
            os.remove(f)

    print(f"Writing {len(final_gallery_images)} unique gallery images...")

    for i, src in enumerate(final_gallery_images):
        idx = i + 1
        dst_name = f"gallery_{idx}.webp"
        dst_path = os.path.join(TARGET_DIR, dst_name)

        try:
            img = Image.open(src)
            # Convert if necessary
            img.save(dst_path, "WEBP")
        except Exception as e:
            print(f"Failed to convert {src}: {e}")

    print("Done.")

if __name__ == "__main__":
    process()

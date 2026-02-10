from PIL import Image
import os

# Create directory
target_dir = "public/assets/img/guild/mochang/"
os.makedirs(target_dir, exist_ok=True)

# Map source files to target names
# 619327723... -> chibi.webp
# 619493530... -> avatar.webp (realistic)
files = {
    "chibi.webp": "619327723_17925017841212084_3619275519230664182_n.jpg",
    "avatar.webp": "619493530_17925017832212084_343197868238155022_n.jpg"
}

for target, source in files.items():
    source_path = os.path.join("/tmp/file_attachments/", source)
    target_path = os.path.join(target_dir, target)
    try:
        if os.path.exists(source_path):
            img = Image.open(source_path)
            img.save(target_path, "WEBP")
            print(f"Converted {source} to {target_path}")
        else:
            print(f"Source file not found: {source_path}")
    except Exception as e:
        print(f"Error converting {source}: {e}")

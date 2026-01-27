
import os
import glob
import shutil

TARGET_DIR = "assets/img/guild/damao"

def renumber():
    # Get all gallery webps
    files = sorted(glob.glob(os.path.join(TARGET_DIR, "gallery_*.webp")))

    # Rename to temp to avoid collisions
    temp_files = []
    for f in files:
        temp_name = f + ".tmp"
        os.rename(f, temp_name)
        temp_files.append(temp_name)

    # Rename back to sequence
    for i, f in enumerate(temp_files):
        new_name = os.path.join(TARGET_DIR, f"gallery_{i+1}.webp")
        os.rename(f, new_name)
        print(f"Renamed {f} -> {new_name}")

if __name__ == "__main__":
    renumber()

"""Hidden, single-launch handle for the bounded Blender channel operation."""
from pathlib import Path
import json,subprocess,time
ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/"art-factory/rts/runs/original-guard-grip-channel/2026-10-05/qa"
blender=Path("C:/Program Files/Blender Foundation/Blender 5.2/blender.exe")
args=[str(blender),"--background","--python",str(ROOT/"art-factory/rts/tools/original_guard_grip_channel_blender.py")]
with (QA/"blender-console.log").open("wb") as stdout, (QA/"blender-stderr.log").open("wb") as stderr:
    process=subprocess.Popen(args,cwd=ROOT,stdout=stdout,stderr=stderr,creationflags=subprocess.CREATE_NO_WINDOW)
value={"pid":process.pid,"started_epoch":time.time(),"command":args}
(QA/"handle.json").write_bytes((json.dumps(value,indent=2)+"\n").encode()); print(json.dumps(value))

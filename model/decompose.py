"""Turn one illustration into a layered PSD with see-through.

Run from a machine that has this environment installed:

    cd model && uv run python decompose.py ../input.png

The phone app does not do this step. Copy the PSD it writes into 立绘屏保.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEE = ROOT / "vendor" / "see-through"
COMMIT = "df019de5129d6c4b406587a14c3501669441a783"


def main() -> None:
    parser = argparse.ArgumentParser(description="see-through 单图拆成 PSD")
    parser.add_argument("image", nargs="?", help="一张 png 或 jpg")
    parser.add_argument("--out", default=str(ROOT / "workspace" / "layerdiff_output"))
    parser.add_argument("--resolution", type=int, default=1280)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--mode",
        choices=("bf16", "nf4"),
        default="bf16",
        help="bf16 大约要 12–16GB 显存；nf4 大约 8GB",
    )
    parser.add_argument("--group-offload", action="store_true", help="12GB 卡用这个把峰值压到大约 10GB")
    parser.add_argument("--check", action="store_true", help="只检查环境和显卡，不跑模型")
    args = parser.parse_args()

    if not (SEE / "inference" / "scripts" / "inference_psd.py").is_file():
        sys.exit(f"缺少 see-through 源码：{SEE}")

    assets = SEE / "assets"
    if not assets.exists():
        assets.symlink_to("common/assets")

    if args.check:
        _check()
        return
    if not args.image:
        parser.error("要给一张图，或者加上 --check")

    image = Path(args.image).expanduser().resolve()
    if not image.is_file():
        sys.exit(f"找不到图：{image}")

    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    if args.mode == "nf4":
        script = SEE / "inference" / "scripts" / "inference_psd_quantized.py"
        cmd = [
            sys.executable,
            str(script),
            "--srcp",
            str(image),
            "--save_to_psd",
            "--save_dir",
            str(out),
            "--resolution",
            str(args.resolution),
            "--seed",
            str(args.seed),
            "--quant_mode",
            "nf4",
        ]
        if not args.group_offload:
            cmd.append("--no_group_offload")
    else:
        script = SEE / "inference" / "scripts" / "inference_psd.py"
        cmd = [
            sys.executable,
            str(script),
            "--srcp",
            str(image),
            "--save_to_psd",
            "--save_dir",
            str(out),
            "--resolution",
            str(args.resolution),
            "--seed",
            str(args.seed),
        ]
        if args.group_offload:
            cmd.append("--group_offload")

    print("see-through", COMMIT)
    print(" ".join(cmd))
    subprocess.run(cmd, cwd=SEE, check=True)
    print(f"PSD 在 {out}")


def _check() -> None:
    import torch

    print("python", sys.version.split()[0])
    print("torch", torch.__version__, "cuda", torch.cuda.is_available())
    if torch.cuda.is_available():
        print("gpu", torch.cuda.get_device_name(0))
        free, total = torch.cuda.mem_get_info()
        print(f"vram {free / 1024**3:.1f}GB free / {total / 1024**3:.1f}GB")
    else:
        print("没有可用的 CUDA。环境可以留在这台机器上，拆层要换到有显卡的机器再跑。")
    import diffusers
    import utils.inference_utils  # noqa: F401
    from annotators.lama_inpainter import apply_inpaint  # noqa: F401

    print("diffusers", diffusers.__version__)
    print("see-through", COMMIT, SEE)


if __name__ == "__main__":
    main()

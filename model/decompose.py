"""Turn one illustration into a layered PSD with see-through.

On a Mac:

    cd model && uv sync
    uv run python decompose.py --check
    uv run python decompose.py ../input.png --resolution 768

Apple Silicon uses the Mac GPU. A 16GB machine should stay at 768.
NVIDIA Linux keeps bf16, and --mode nf4 is only for that.
The phone app does not do this step. Copy the PSD into 立绘屏保.
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
    parser.add_argument("--resolution", type=int, default=768 if sys.platform == "darwin" else 1280)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--mode",
        choices=("bf16", "nf4"),
        default="bf16",
        help="Mac 用默认 bf16（实际走 float16）。nf4 只给 NVIDIA",
    )
    parser.add_argument("--group-offload", action="store_true", help="NVIDIA 12GB 卡用这个。Mac 会忽略")
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

    if args.mode == "nf4" and sys.platform != "linux":
        sys.exit("nf4 只在 NVIDIA 显卡上能跑。Mac 去掉 --mode nf4，内存紧就加 --resolution 768。")

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

    mps = getattr(torch.backends, "mps", None)
    mps_ok = bool(mps is not None and mps.is_available())
    print("python", sys.version.split()[0])
    print("torch", torch.__version__, "cuda", torch.cuda.is_available(), "mps", mps_ok)
    if torch.cuda.is_available():
        print("gpu", torch.cuda.get_device_name(0))
        free, total = torch.cuda.mem_get_info()
        print(f"vram {free / 1024**3:.1f}GB free / {total / 1024**3:.1f}GB")
    elif mps_ok:
        print("用这台 Mac 的 GPU。16GB 内存把分辨率留在 768。")
    else:
        print("没有 GPU，会走 CPU，一张图会很久。")
    import diffusers
    import utils.inference_utils  # noqa: F401
    from annotators.lama_inpainter import apply_inpaint  # noqa: F401

    print("diffusers", diffusers.__version__)
    print("see-through", COMMIT, SEE)


if __name__ == "__main__":
    main()

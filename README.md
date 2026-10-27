# 立绘屏保

一个装在 iPhone 上的全屏立绘。把 [see-through](https://github.com/shitagaki-lab/see-through) 导出的分层 PSD 放进来，画面会自己眨眼、呼吸、晃头发。打开前置摄像头之后，脸在镜头前就跟着动，人离开大约一秒回到待机。

拆层不在手机上做。模型代码在 `vendor/see-through`（提交 `df019de`），环境在 `model/`。官方在线演示仍是 [Hugging Face](https://huggingface.co/spaces/24yearsold/see-through-demo)。手机上的绑定来自 [Anime2.5DRig](https://github.com/852wa/Anime2.5DRig)（MIT）。

## 拆层环境

要一块 NVIDIA 显卡。bf16 大约 12–16GB 显存，加上 `--group-offload` 大约 10GB，`--mode nf4` 大约 8GB。这台没有显卡的机器只能把环境装好，不能出图。

```bash
cd model
uv sync
uv run python decompose.py --check
uv run python decompose.py ../你的图.png --group-offload
```

第一次跑会从 Hugging Face 下载两个模型：`layerdifforg/seethroughv0.0.2_layerdiff3d` 和 `24yearsold/seethroughv0.0.1_marigold`。PSD 写到 `workspace/layerdiff_output/`。8GB 显存用 `uv sync --extra nf4`，再跑 `decompose.py --mode nf4`。

环境钉死 Python 3.12 和 PyTorch 2.8.0+cu128。`uv sync` 会装 CUDA 版 torch，以及 see-through 推理要的 diffusers、LaMa 补绘和 psd-tools。训练界面、Detectron2、mmcv 不在这份环境里。

安装包在 `dist/RigScreen.ipa`。它在 Linux 上交叉编译，带的是本机 ad-hoc 签名，系统会拒绝直接安装。用 SideStore 或 Sideloadly，用你自己的 Apple ID 重签名后再装。需要 iOS 15 或更高。

## 使用

1. 准备一张适合拆层的图：单人、正面或微侧、眼睛睁开、尽量正方形，边长大约 768 到 2048。用上面的 `decompose.py` 导出 PSD。脖子和衣服接缝会裂的话，把脖子并进 `topwear` 再装进来。
2. 打开「立绘屏保」，点「选择 PSD」。
3. 点「打开相机」，允许前置摄像头。看着手机，点「记下正面」。
4. 插上电。应用开着时不会自动锁屏。连按三次侧边键，打开引导式访问，把手机留在这一页。
5. 按下侧边键仍然会锁屏。锁屏之后相机和立绘都会停，亮起来看到的是系统墙纸。

「调整」打开原来的参数面板，里面仍是日文。闭眼、闭嘴如果 PSD 里没有，会用自带的通用差分补上。

## 重新打包

需要 clang、`ld64.lld`（Ubuntu 的 `lld` 包）和 [ldid](https://github.com/ProcursusTeam/ldid)。

```bash
./tools/build-ipa.sh
```

脚本会取 Anime2.5DRig 的固定提交 `7ddbd9943ea3152561b3dc8348fd752c850f3e95`，打上 `overlay/` 里的屏保界面，编出 `dist/RigScreen.ipa`。示例 PSD 不打进包里，那些图的权利属于原作者。

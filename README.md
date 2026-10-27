# 立绘屏保

一个装在 iPhone 上的全屏立绘。把 [see-through](https://github.com/shitagaki-lab/see-through) 导出的分层 PSD 放进来，画面会自己眨眼、呼吸、晃头发。打开前置摄像头之后，脸在镜头前就跟着动，人离开大约一秒回到待机。

拆层在 Mac 上做。模型代码在 `vendor/see-through`（提交 `df019de`），入口是 `model/decompose.py`。Apple Silicon 走 Mac 的 GPU，不需要 NVIDIA。手机上的绑定来自 [Anime2.5DRig](https://github.com/852wa/Anime2.5DRig)（MIT），页面已经放在 `ios/www`。

## 在 Mac 上拆层

先装 [uv](https://docs.astral.sh/uv/)，然后：

```bash
cd model
uv sync
uv run python decompose.py --check
uv run python decompose.py ../你的图.png
```

Mac 默认分辨率是 768。内存够再加 `--resolution 1280`。第一次会从 Hugging Face 下载 `layerdifforg/seethroughv0.0.2_layerdiff3d` 和 `24yearsold/seethroughv0.0.1_marigold`。PSD 写到 `workspace/layerdiff_output/`。

`uv sync` 在 Apple Silicon 上装 PyTorch 2.8.0（带 MPS），在 Linux 上装 2.8.0+cu128。Intel Mac 没有这份 torch 轮子。`--mode nf4` 和 `--group-offload` 只给 NVIDIA。训练界面、Detectron2、mmcv 不在这份环境里。

## 在 Mac 上装到手机

用 Xcode 打开 `ios/RigScreen.xcodeproj`。Signing 里选你的 Apple ID，把 iPhone 插上，Run。需要 iOS 15 或更高。相机在模拟器里不可用，跟踪要真机。

`dist/RigScreen.ipa` 是 Linux 上的 ad-hoc 包，系统会拒绝直接安装。有 Mac 就用上面的 Xcode 工程，不用这个包。

## 使用

1. 准备一张适合拆层的图：单人、正面或微侧、眼睛睁开、尽量正方形，边长大约 768 到 2048。用上面的 `decompose.py` 导出 PSD。脖子和衣服接缝会裂的话，把脖子并进 `topwear` 再装进来。
2. 打开「立绘屏保」，点「选择 PSD」。
3. 点「打开相机」，允许前置摄像头。看着手机，点「记下正面」。
4. 插上电。应用开着时不会自动锁屏。连按三次侧边键，打开引导式访问，把手机留在这一页。
5. 按下侧边键仍然会锁屏。锁屏之后相机和立绘都会停，亮起来看到的是系统墙纸。

「调整」打开原来的参数面板，里面仍是日文。闭眼、闭嘴如果 PSD 里没有，会用自带的通用差分补上。

## 重新打包

有 Mac 时用 Xcode 工程。没有 Mac 时，这台 Linux 机器可以用 clang、`ld64.lld` 和 ldid 打一个还要重签名的包：

```bash
./tools/build-ipa.sh
```

页面来自 `ios/www`，对应 Anime2.5DRig 提交 `7ddbd9943ea3152561b3dc8348fd752c850f3e95`。示例 PSD 不打进包里。

/* Screensaver controls for the IPA shell. The page is unchanged without ?app=1. */
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get("app") !== "1") return;

  document.body.classList.add("screensaver");
  document.title = "立绘屏保";
  const appStatus = document.getElementById("appStatus");
  if (appStatus) appStatus.textContent = "正在打开 Mac 上准备好的立绘";

  const dark = document.querySelector('[data-bg="dark"]');
  if (dark) dark.click();

  const obs = document.getElementById("prefObsSync");
  if (obs && obs.checked) {
    obs.checked = false;
    obs.dispatchEvent(new Event("change"));
  }

  const drop = document.getElementById("drop");
  if (drop) {
    const eyebrow = drop.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = "屏保";
    const title = drop.querySelector("h2");
    if (title) title.textContent = "立绘在 Mac 上已经准备好";
    const lead = drop.querySelector("h2 + p");
    if (lead) lead.textContent = "手机只打开摄像头，并把这份立绘画出来。人在镜头前会跟着脸动，人离开就自己眨眼、呼吸、晃头发。";
    const hint = drop.querySelector(".drop-hint");
    if (hint) hint.textContent = "拆层和绑骨不在手机上做。";
    const open = document.getElementById("btnFile");
    if (open) open.hidden = true;
  }

  const fileInput = document.getElementById("fileInput");
  fileInput?.addEventListener("click", (event) => event.stopImmediatePropagation(), true);
  fileInput?.addEventListener("change", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const dock = document.createElement("div");
  dock.id = "saverDock";
  dock.innerHTML =
    '<button type="button" class="primary" id="saverCam">打开相机</button>' +
    '<button type="button" id="saverCal">记下正面</button>' +
    '<button type="button" id="saverTune">调整</button>';
  document.body.appendChild(dock);

  document.getElementById("saverCam").addEventListener("click", () => {
    document.getElementById("tgCam").click();
  });
  document.getElementById("saverCal").addEventListener("click", () => {
    document.getElementById("btnCalibrate").click();
  });
  document.getElementById("saverTune").addEventListener("click", () => {
    document.body.classList.toggle("show-panel");
  });

  const camToggle = document.getElementById("tgCam");
  const saverCam = document.getElementById("saverCam");
  const camBg = document.createElement("canvas");
  camBg.id = "camBg";
  document.getElementById("stage").prepend(camBg);
  const camBgCtx = camBg.getContext("2d", { alpha: false });
  let camBgAt = 0;

  const roomColor = (ctx, w, h) => {
    const s = 8;
    const spots = [[1, 1], [w - s - 1, 1], [1, h - s - 1], [w - s - 1, h - s - 1]];
    let r = 0, g = 0, b = 0, n = 0;
    for (const [x, y] of spots) {
      const data = ctx.getImageData(Math.max(0, x), Math.max(0, y), s, s).data;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    return `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`;
  };

  // Blurred camera behind the illustration. The person is painted over with
  // the room color so the background stays, and the blur hides the patch.
  window.paintCamBg = (video, lm) => {
    if (!video || video.readyState < 2) return;
    const now = performance.now();
    if (now - camBgAt < 80) return;
    camBgAt = now;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const long = 280;
    const w = vw >= vh ? long : Math.max(2, Math.round(long * vw / vh));
    const h = vw >= vh ? Math.max(2, Math.round(long * vh / vw)) : long;
    if (camBg.width !== w) camBg.width = w;
    if (camBg.height !== h) camBg.height = h;
    const ctx = camBgCtx;
    ctx.setTransform(w, 0, 0, h, 0, 0);
    ctx.scale(-1, 1);
    ctx.translate(-1, 0);
    ctx.drawImage(video, 0, 0, 1, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (lm && lm.length > 10) {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (let i = 0; i < Math.min(lm.length, 468); i++) {
        const p = lm[i];
        const x = 1 - p.x;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const faceW = Math.max(0.08, maxX - minX) * w;
      const faceH = Math.max(0.08, maxY - minY) * h;
      const cx = ((minX + maxX) / 2) * w;
      const cy = ((minY + maxY) / 2) * h;
      const chin = maxY * h;
      ctx.save();
      ctx.filter = "blur(6px)";
      ctx.fillStyle = roomColor(ctx, w, h);
      ctx.beginPath();
      // Head and a short shoulder patch only. A body-sized ellipse
      // paints the whole frame one color, which reads as a backdrop layer.
      ctx.ellipse(cx, cy, faceW * 0.7, faceH * 0.9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx, chin + faceH * 0.25, faceW * 0.8, faceH * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const reflectCam = () => {
    const on = camToggle.classList.contains("on");
    saverCam.textContent = on ? "关闭相机" : "打开相机";
    saverCam.classList.toggle("on", on);
    document.body.classList.toggle("cam-on", on);
    if (!on) camBgCtx.clearRect(0, 0, camBg.width, camBg.height);
  };
  new MutationObserver(reflectCam).observe(camToggle, { attributes: true, attributeFilter: ["class"] });
  reflectCam();

  const keepAwake = () => {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request("screen").catch(() => {});
  };
  keepAwake();

  let camRestartAt = 0;
  const restartCamIfNeeded = () => {
    if (!camToggle.classList.contains("on")) return;
    const now = performance.now();
    if (now - camRestartAt < 1200) return;
    camRestartAt = now;
    camToggle.click();
    setTimeout(() => {
      if (!camToggle.classList.contains("on")) camToggle.click();
    }, 350);
  };
  let knownCams = new Set();
  const rememberCams = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    knownCams = new Set(list.filter((d) => d.kind === "videoinput").map((d) => d.deviceId));
  };
  rememberCams();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", async () => {
      const list = await navigator.mediaDevices.enumerateDevices();
      const vids = list.filter((d) => d.kind === "videoinput");
      const fresh = vids.filter((d) => d.deviceId && !knownCams.has(d.deviceId));
      knownCams = new Set(vids.map((d) => d.deviceId));
      if (!fresh.length || !camToggle.classList.contains("on")) return;
      window.__preferCam = fresh[fresh.length - 1].deviceId;
      restartCamIfNeeded();
    });
  }
  window.addEventListener("pageshow", () => {
    keepAwake();
    restartCamIfNeeded();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      keepAwake();
      restartCamIfNeeded();
    }
  });

  const stage = document.getElementById("stage");
  const seam = document.createElement("div");
  seam.id = "duoSeam";
  const companion = document.createElement("div");
  companion.id = "duoCompanion";
  document.body.appendChild(seam);
  document.body.appendChild(companion);

  const appStatusEl = document.getElementById("appStatus");
  let split = false;

  const placeChrome = (on) => {
    if (on === split) return;
    split = on;
    if (on) {
      companion.appendChild(appStatusEl);
      companion.appendChild(dock);
    } else {
      stage.appendChild(appStatusEl);
      document.body.appendChild(dock);
    }
  };

  const hingeRadians = (angle) => {
    if (!(angle >= 0)) return -1;
    if (angle > Math.PI * 2 + 0.2) return (angle * Math.PI) / 180;
    return angle;
  };

  const applyDuo = (info) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    const landscape = w > h;
    let kind = "phone";
    if (short <= 530 && long <= 780) kind = "cover";
    else if (short >= 560 && long >= 800) kind = "inner";
    const book = kind === "inner" && !landscape;
    const tent = kind === "inner" && landscape;
    document.body.classList.toggle("duo-cover", kind === "cover");
    document.body.classList.toggle("duo-book", book);
    document.body.classList.toggle("duo-tent", tent);
    window.rigStageMode = "contain";
    window.rigStageAnchor = tent ? "below-hinge" : "center";
    placeChrome(book);
    const angle = hingeRadians(info && info.angle);
    window.__duoAngle = angle;
    const status = (info && info.status) || "none";
    if (angle < 0) {
      window.__duoMotion = { yaw: 0, pitch: 0, roll: 0 };
    } else {
      const tentAmt = Math.sin(Math.min(Math.PI, angle));
      const look = status === "partial" ? 1 : 0.4;
      window.__duoMotion = {
        pitch: tentAmt * 0.28 * look,
        roll: Math.sin(angle * 2) * 0.08,
        yaw: (angle / Math.PI - 0.5) * 0.06,
      };
    }
    if (typeof window.rigRefit === "function") window.rigRefit();
    scheduleCamForFold(kind);
  };

  let openedCamKind = "";
  let camFoldTimer = 0;
  const scheduleCamForFold = (kind) => {
    if (kind !== "cover" && kind !== "inner") return;
    clearTimeout(camFoldTimer);
    camFoldTimer = setTimeout(() => {
      if (!camToggle.classList.contains("on")) {
        openedCamKind = kind;
        return;
      }
      if (openedCamKind === kind) return;
      openedCamKind = kind;
      window.__preferCam = "";
      restartCamIfNeeded();
    }, 480);
  };

  window.rigDuo = (info) => {
    window.__duoInfo = info || null;
    applyDuo(window.__duoInfo);
  };
  window.addEventListener("resize", () => applyDuo(window.__duoInfo || null));
  applyDuo(null);

  const fail = (message) => {
    if (appStatus) appStatus.textContent = message;
    const title = drop?.querySelector("h2");
    if (title) title.textContent = message;
  };
  if (typeof window.loadPreparedRig === "function") {
    window.loadPreparedRig("prepared").catch(() => fail("Mac 上还没有准备好这份立绘"));
  } else {
    fail("Mac 上还没有准备好这份立绘");
  }
})();

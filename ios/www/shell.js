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
  const reflectCam = () => {
    const on = camToggle.classList.contains("on");
    saverCam.textContent = on ? "关闭相机" : "打开相机";
    saverCam.classList.toggle("on", on);
    document.body.classList.toggle("cam-on", on);
  };
  new MutationObserver(reflectCam).observe(camToggle, { attributes: true, attributeFilter: ["class"] });
  reflectCam();

  const keepAwake = () => {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request("screen").catch(() => {});
  };
  keepAwake();

  const restartCamIfNeeded = () => {
    if (!camToggle.classList.contains("on")) return;
    camToggle.click();
    setTimeout(() => {
      if (!camToggle.classList.contains("on")) camToggle.click();
    }, 350);
  };
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

/* Screensaver controls for the IPA shell. The page is unchanged without ?app=1. */
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get("app") !== "1") return;

  document.body.classList.add("screensaver");
  document.title = "立绘屏保";
  const appStatus = document.getElementById("appStatus");
  if (appStatus) appStatus.textContent = "选好 PSD 之后，立绘会在这里动起来";

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
    if (title) title.textContent = "放进一张拆好的立绘";
    const lead = drop.querySelector("h2 + p");
    if (lead) lead.textContent = "用 see-through 导出的 PSD。人在镜头前会跟着脸动，人离开就自己眨眼、呼吸、晃头发。";
    const hint = drop.querySelector(".drop-hint");
    if (hint) {
      hint.textContent = "正方形，眼睛睁开，边长大约 768 到 2048。RGB、8bit，128MB 以内。";
    }
    const open = document.getElementById("btnFile");
    if (open) open.textContent = "选择 PSD";
  }

  const dock = document.createElement("div");
  dock.id = "saverDock";
  dock.innerHTML =
    '<button type="button" class="primary" id="saverOpen">选择 PSD</button>' +
    '<button type="button" id="saverCam">打开相机</button>' +
    '<button type="button" id="saverCal">记下正面</button>' +
    '<button type="button" id="saverTune">调整</button>';
  document.body.appendChild(dock);

  document.getElementById("saverOpen").addEventListener("click", () => {
    document.getElementById("btnFile").click();
  });
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
})();

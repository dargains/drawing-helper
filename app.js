(() => {
  const imageInput = document.getElementById("image-input");
  const cameraBtn = document.getElementById("camera-btn");
  const opacitySlider = document.getElementById("opacity-slider");
  const opacityValue = document.getElementById("opacity-value");
  const scaleSlider = document.getElementById("scale-slider");
  const scaleValue = document.getElementById("scale-value");
  const flipBtn = document.getElementById("flip-btn");
  const lockBtn = document.getElementById("lock-btn");
  const invertBtn = document.getElementById("invert-btn");
  const resetBtn = document.getElementById("reset-btn");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const fullscreenRestore = document.getElementById("fullscreen-restore");
  const toggleControlsBtn = document.getElementById("toggle-controls-btn");
  const controlsExpanded = document.getElementById("controls-expanded");
  const video = document.getElementById("camera");
  const overlayImage = document.getElementById("overlay-image");
  const placeholder = document.getElementById("placeholder");
  const viewport = document.getElementById("viewport");

  const STORAGE_KEY = "drawing-helper-state";

  let cameraStream = null;
  let imageLoaded = false;
  let flipped = false;
  let locked = false;
  let inverted = false;

  // Image position/transform state
  let imgX = 0;
  let imgY = 0;
  let imgScale = 1;
  let imgRotation = 0;
  let imgOpacity = 50;
  let baseWidth = 0;
  let baseHeight = 0;

  // Touch/drag state
  let isDragging = false;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let lastPinchDist = 0;
  let lastPinchAngle = 0;

  // ---- LocalStorage persistence ----
  function saveState() {
    const state = {
      imgX,
      imgY,
      imgScale,
      imgRotation,
      imgOpacity,
      flipped,
      inverted,
      locked,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      /* quota exceeded, ignore */
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function restoreState() {
    const state = loadState();
    if (!state) return;

    imgX = state.imgX ?? 0;
    imgY = state.imgY ?? 0;
    imgScale = state.imgScale ?? 1;
    imgRotation = state.imgRotation ?? 0;
    imgOpacity = state.imgOpacity ?? 50;
    flipped = state.flipped ?? false;
    inverted = state.inverted ?? false;
    locked = state.locked ?? false;

    // Apply to UI
    opacitySlider.value = imgOpacity;
    opacityValue.textContent = imgOpacity + "%";
    overlayImage.style.opacity = imgOpacity / 100;

    scaleSlider.value = Math.round(imgScale * 100);
    scaleValue.textContent = Math.round(imgScale * 100) + "%";

    lockBtn.textContent = locked ? "🔓 Unlock" : "🔒 Lock";
    invertBtn.classList.toggle("active", inverted);
    overlayImage.classList.toggle("inverted", inverted);
  }

  // ---- Image Upload ----
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      overlayImage.onload = () => {
        imageLoaded = true;
        baseWidth = overlayImage.naturalWidth;
        baseHeight = overlayImage.naturalHeight;
        restoreState();
        applyTransform();
        overlayImage.style.display = "block";
        showImageControls();
        updatePlaceholder();
      };
      overlayImage.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  function showImageControls() {
    invertBtn.classList.remove("hidden");
    flipBtn.classList.remove("hidden");
    lockBtn.classList.remove("hidden");
    toggleControlsBtn.classList.remove("hidden");
    controlsExpanded.classList.remove("hidden");
  }

  // ---- Camera ----
  cameraBtn.addEventListener("click", async () => {
    if (cameraStream) {
      stopCamera();
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      video.srcObject = cameraStream;
      cameraBtn.textContent = "⏹ Stop";
      updatePlaceholder();
    } catch (err) {
      alert(
        "Could not access camera. Please allow camera permissions and try again.",
      );
      console.error(err);
    }
  });

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    video.srcObject = null;
    cameraBtn.textContent = "🎥 Camera";
    updatePlaceholder();
  }

  // ---- Opacity ----
  opacitySlider.addEventListener("input", () => {
    imgOpacity = Number(opacitySlider.value);
    overlayImage.style.opacity = imgOpacity / 100;
    opacityValue.textContent = imgOpacity + "%";
    saveState();
  });

  // ---- Scale ----
  scaleSlider.addEventListener("input", () => {
    imgScale = Number(scaleSlider.value) / 100;
    scaleValue.textContent = scaleSlider.value + "%";
    applyTransform();
    saveState();
  });

  // ---- Flip ----
  flipBtn.addEventListener("click", () => {
    flipped = !flipped;
    applyTransform();
    saveState();
  });

  // ---- Invert ----
  invertBtn.addEventListener("click", () => {
    inverted = !inverted;
    overlayImage.classList.toggle("inverted", inverted);
    invertBtn.classList.toggle("active", inverted);
    saveState();
  });

  // ---- Lock ----
  lockBtn.addEventListener("click", () => {
    locked = !locked;
    lockBtn.textContent = locked ? "🔓 Unlock" : "🔒 Lock";
    saveState();
  });

  // ---- Reset ----
  resetBtn.addEventListener("click", () => {
    imgX = 0;
    imgY = 0;
    imgScale = 1;
    imgRotation = 0;
    imgOpacity = 50;
    flipped = false;
    inverted = false;
    locked = false;

    opacitySlider.value = 50;
    opacityValue.textContent = "50%";
    overlayImage.style.opacity = 0.5;
    scaleSlider.value = 100;
    scaleValue.textContent = "100%";
    lockBtn.textContent = "🔒 Lock";
    invertBtn.classList.remove("active");
    overlayImage.classList.remove("inverted");

    applyTransform();
    saveState();
  });

  // ---- Fullscreen ----
  fullscreenBtn.addEventListener("click", () => {
    document.body.classList.add("fullscreen-mode");
    // Also try native fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  fullscreenRestore.addEventListener("click", () => {
    document.body.classList.remove("fullscreen-mode");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("fullscreen-mode");
    }
  });

  // ---- Toggle sliders panel ----
  toggleControlsBtn.addEventListener("click", () => {
    const isVisible = !controlsExpanded.classList.contains("hidden");
    controlsExpanded.classList.toggle("hidden", isVisible);
    toggleControlsBtn.textContent = isVisible ? "▼ More" : "▲ Less";
  });

  // ---- Transform helpers ----
  function applyTransform() {
    const flipX = flipped ? -1 : 1;
    overlayImage.style.transform =
      `translate(calc(-50% + ${imgX}px), calc(-50% + ${imgY}px)) ` +
      `scale(${imgScale * flipX}, ${imgScale}) ` +
      `rotate(${imgRotation}deg)`;

    overlayImage.style.maxWidth = "none";
    overlayImage.style.maxHeight = "none";

    const vw = viewport.clientWidth * 0.9;
    const vh = viewport.clientHeight * 0.9;
    const ratio = Math.min(vw / baseWidth, vh / baseHeight, 1);
    overlayImage.style.width = baseWidth * ratio + "px";
    overlayImage.style.height = baseHeight * ratio + "px";
  }

  function updatePlaceholder() {
    placeholder.style.display = imageLoaded || cameraStream ? "none" : "block";
  }

  // ---- Touch/pointer gestures on viewport ----
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);

  const activePointers = new Map();

  function onPointerDown(e) {
    if (locked || !imageLoaded) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture(e.pointerId);

    if (activePointers.size === 1) {
      isDragging = true;
      lastTouchX = e.clientX;
      lastTouchY = e.clientY;
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      lastPinchDist = dist(pts[0], pts[1]);
      lastPinchAngle = angle(pts[0], pts[1]);
    }
  }

  function onPointerMove(e) {
    if (locked || !imageLoaded) return;
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1 && isDragging) {
      const dx = e.clientX - lastTouchX;
      const dy = e.clientY - lastTouchY;
      imgX += dx;
      imgY += dy;
      lastTouchX = e.clientX;
      lastTouchY = e.clientY;
      applyTransform();
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const d = dist(pts[0], pts[1]);
      const a = angle(pts[0], pts[1]);

      const scaleRatio = d / lastPinchDist;
      imgScale *= scaleRatio;
      imgScale = Math.max(0.1, Math.min(5, imgScale));
      scaleSlider.value = Math.round(imgScale * 100);
      scaleValue.textContent = Math.round(imgScale * 100) + "%";

      const angleDelta = a - lastPinchAngle;
      imgRotation += angleDelta;

      lastPinchDist = d;
      lastPinchAngle = a;
      applyTransform();
    }
  }

  function onPointerUp(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
      isDragging = false;
      saveState();
    } else if (activePointers.size === 1) {
      const pt = [...activePointers.values()][0];
      lastTouchX = pt.x;
      lastTouchY = pt.y;
    }
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function angle(a, b) {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  }
})();

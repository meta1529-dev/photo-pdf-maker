(() => {
  const A4 = { width: 595.28, height: 841.89 };
  const MM_TO_PT = 72 / 25.4;
  const SCAN_ANALYSIS_EDGE = 760;
  const SCAN_OUTPUT_EDGE = 2200;
  const SCAN_OUTPUT_QUALITY = 0.92;

  const elements = {
    addButton: document.querySelector("#addButton"),
    applyScanButton: document.querySelector("#applyScanButton"),
    clearButton: document.querySelector("#clearButton"),
    createPdfButton: document.querySelector("#createPdfButton"),
    dropZone: document.querySelector("#dropZone"),
    emptyAddButton: document.querySelector("#emptyAddButton"),
    emptyState: document.querySelector("#emptyState"),
    fileInput: document.querySelector("#fileInput"),
    fileName: document.querySelector("#fileName"),
    fitMode: document.querySelector("#fitMode"),
    imageGrid: document.querySelector("#imageGrid"),
    margin: document.querySelector("#margin"),
    maxEdge: document.querySelector("#maxEdge"),
    pageSize: document.querySelector("#pageSize"),
    quality: document.querySelector("#quality"),
    qualityValue: document.querySelector("#qualityValue"),
    scanMode: document.querySelector("#scanMode"),
    selectedMeta: document.querySelector("#selectedMeta"),
    selectedName: document.querySelector("#selectedName"),
    status: document.querySelector("#status"),
    summary: document.querySelector("#summary"),
  };

  const state = {
    busy: false,
    dragId: null,
    items: [],
    selectedId: null,
  };

  const textEncoder = new TextEncoder();
  const formatter = new Intl.NumberFormat("ja-JP");

  function makeId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function bytesLabel(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }

  function normalizeRotation(value) {
    return ((value % 360) + 360) % 360;
  }

  function updateQualityLabel() {
    elements.qualityValue.textContent = `${elements.quality.value}%`;
  }

  function ensureSelection() {
    if (!state.items.length) {
      state.selectedId = null;
      return;
    }
    const exists = state.items.some((item) => item.id === state.selectedId);
    if (!exists) state.selectedId = state.items[0].id;
  }

  function render() {
    ensureSelection();
    updateQualityLabel();

    const totalBytes = state.items.reduce((sum, item) => sum + item.file.size, 0);
    const imageCount = state.items.length;
    elements.summary.textContent = imageCount
      ? `${formatter.format(imageCount)}枚 / ${bytesLabel(totalBytes)}`
      : "0枚";

    elements.applyScanButton.disabled = state.busy || imageCount === 0;
    elements.clearButton.disabled = state.busy || imageCount === 0;
    elements.createPdfButton.disabled = state.busy || imageCount === 0;
    elements.emptyState.classList.toggle("is-hidden", imageCount > 0);

    elements.imageGrid.replaceChildren(
      ...state.items.map((item, index) => createThumbCard(item, index)),
    );

    const selected = state.items.find((item) => item.id === state.selectedId);
    if (selected) {
      elements.selectedName.textContent = selected.originalFile.name;
      elements.selectedMeta.textContent = `${bytesLabel(selected.file.size)} / ${indexLabel(selected)} / ${selected.scanLabel}`;
    } else {
      elements.selectedName.textContent = "未選択";
      elements.selectedMeta.textContent = "画像を追加できます";
    }
  }

  function indexLabel(selected) {
    const index = state.items.findIndex((item) => item.id === selected.id);
    return `${formatter.format(index + 1)} / ${formatter.format(state.items.length)}枚目`;
  }

  function createThumbCard(item, index) {
    const card = document.createElement("article");
    card.className = "thumb-card";
    card.draggable = !state.busy;
    card.dataset.id = item.id;
    if (item.id === state.selectedId) card.classList.add("is-selected");

    card.addEventListener("click", () => {
      state.selectedId = item.id;
      render();
    });

    card.addEventListener("dragstart", (event) => {
      if (state.busy) return;
      state.dragId = item.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    });

    card.addEventListener("dragover", (event) => {
      if (!state.dragId || state.dragId === item.id) return;
      event.preventDefault();
      card.classList.add("is-drag-over");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drag-over");
    });

    card.addEventListener("drop", (event) => {
      if (state.busy) return;
      event.preventDefault();
      card.classList.remove("is-drag-over");
      const fromId = event.dataTransfer.getData("text/plain") || state.dragId;
      moveById(fromId, item.id);
    });

    card.addEventListener("dragend", () => {
      state.dragId = null;
      card.classList.remove("is-drag-over");
    });

    const imageWrap = document.createElement("div");
    imageWrap.className = "thumb-image-wrap";

    const image = document.createElement("img");
    image.className = "thumb-image";
    image.src = item.previewUrl;
    image.alt = item.originalFile.name;
    image.style.transform = `rotate(${item.rotation}deg)`;

    imageWrap.append(image);

    const details = document.createElement("div");
    details.className = "thumb-details";

    const name = document.createElement("p");
    name.className = "thumb-name";
    name.textContent = item.originalFile.name;
    name.title = item.originalFile.name;

    const meta = document.createElement("p");
    meta.className = "thumb-meta";
    meta.textContent = `${formatter.format(index + 1)} / ${formatter.format(state.items.length)}・${item.scanLabel}`;

    const tools = document.createElement("div");
    tools.className = "thumb-tools";
    tools.append(
      makeTool("↑", "前へ", () => moveItem(index, index - 1), state.busy || index === 0),
      makeTool("↓", "後へ", () => moveItem(index, index + 1), state.busy || index === state.items.length - 1),
      makeTool("↶", "左回転", () => rotateItem(item.id, -90), state.busy),
      makeTool("↷", "右回転", () => rotateItem(item.id, 90), state.busy),
      makeTool("×", "削除", () => removeItem(item.id), state.busy, "danger"),
    );

    details.append(name, meta, tools);
    card.append(imageWrap, details);
    return card;
  }

  function makeTool(label, title, action, disabled = false, extraClass = "") {
    const button = document.createElement("button");
    button.className = `thumb-tool ${extraClass}`.trim();
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.disabled = disabled;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      action();
    });
    return button;
  }

  function moveItem(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= state.items.length || fromIndex === toIndex) return;
    const [item] = state.items.splice(fromIndex, 1);
    state.items.splice(toIndex, 0, item);
    state.selectedId = item.id;
    render();
  }

  function moveById(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const fromIndex = state.items.findIndex((item) => item.id === fromId);
    const toIndex = state.items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    moveItem(fromIndex, toIndex);
  }

  function rotateItem(id, degrees) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    item.rotation = normalizeRotation(item.rotation + degrees);
    state.selectedId = id;
    render();
  }

  function removeItem(id) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = state.items.splice(index, 1);
    URL.revokeObjectURL(item.previewUrl);
    if (state.selectedId === id) {
      state.selectedId = state.items[Math.min(index, state.items.length - 1)]?.id ?? null;
    }
    render();
  }

  function clearItems() {
    state.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    state.items = [];
    state.selectedId = null;
    render();
    setStatus("待機中");
  }

  function isImageFile(file) {
    return file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
  }

  async function addFiles(fileList) {
    if (state.busy) return;

    const files = Array.from(fileList).filter(isImageFile);
    if (!files.length) {
      setStatus("画像ファイルを選んでください");
      return;
    }

    const scanMode = elements.scanMode.value;
    const nextItems = [];
    state.busy = true;
    render();

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const item = {
          file,
          id: makeId(),
          originalFile: file,
          previewUrl: "",
          rotation: 0,
          scanLabel: "元画像",
          scanMode: "off",
        };

        setStatus(`${formatter.format(index + 1)} / ${formatter.format(files.length)} を読み込み中`);
        await applyScanToItem(item, scanMode);
        nextItems.push(item);
      }

      state.items.push(...nextItems);
      if (!state.selectedId) state.selectedId = nextItems[0].id;
      setStatus(`${formatter.format(nextItems.length)}枚追加しました`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`追加できませんでした: ${message}`);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function applyScanToAll() {
    if (!state.items.length || state.busy) return;
    state.busy = true;
    render();

    try {
      const scanMode = elements.scanMode.value;
      for (let index = 0; index < state.items.length; index += 1) {
        setStatus(`${formatter.format(index + 1)} / ${formatter.format(state.items.length)} を補正中`);
        await applyScanToItem(state.items[index], scanMode);
      }
      setStatus("補正を適用しました");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`補正できませんでした: ${message}`);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function applyScanToItem(item, scanMode) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = "";
    }

    if (scanMode === "off") {
      item.file = item.originalFile;
      item.previewUrl = URL.createObjectURL(item.file);
      item.scanLabel = "元画像";
      item.scanMode = "off";
      return;
    }

    try {
      const result = await processScanImage(item.originalFile, scanMode);
      item.file = makeProcessedFile(result.blob, item.originalFile);
      item.previewUrl = URL.createObjectURL(item.file);
      item.scanLabel = result.label;
      item.scanMode = scanMode;
    } catch (error) {
      console.warn(error);
      item.file = item.originalFile;
      item.previewUrl = URL.createObjectURL(item.file);
      item.scanLabel = "補正失敗";
      item.scanMode = "off";
    }
  }

  function makeProcessedFile(blob, originalFile) {
    const baseName = originalFile.name.replace(/\.[^.]*$/, "") || "scan";
    const fileName = `${baseName}-scan.jpg`;
    try {
      return new File([blob], fileName, {
        lastModified: originalFile.lastModified || Date.now(),
        type: "image/jpeg",
      });
    } catch {
      blob.name = fileName;
      return blob;
    }
  }

  async function processScanImage(file, scanMode) {
    let canvas = await fileToCanvas(file, SCAN_OUTPUT_EDGE);
    let label = "文字くっきり";

    if (scanMode === "scan") {
      const region = detectPaperRegion(canvas);
      if (region?.corners) {
        canvas = warpCanvasToDocument(canvas, region.corners);
        softenEdgeObstructions(canvas);
        label = "紙検出";
      } else if (region?.bbox) {
        const cropped = cropCanvas(canvas, region.bbox);
        if (cropped) {
          canvas = cropped;
          softenEdgeObstructions(canvas);
          label = "自動切り抜き";
        }
      }
    }

    enhanceScanCanvas(canvas);
    const blob = await canvasToBlob(canvas, SCAN_OUTPUT_QUALITY);
    return { blob, label };
  }

  async function fileToCanvas(file, maxEdge) {
    const bitmap = await decodeImage(file);
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      closeBitmap(bitmap);
      throw new Error(`${file.name} を読み込めませんでした`);
    }

    const scale = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight)) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) {
      closeBitmap(bitmap);
      throw new Error("画像処理を開始できませんでした");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    closeBitmap(bitmap);
    return canvas;
  }

  function detectPaperRegion(canvas) {
    const scale = Math.min(1, SCAN_ANALYSIS_EDGE / Math.max(canvas.width, canvas.height));
    const width = Math.max(1, Math.round(canvas.width * scale));
    const height = Math.max(1, Math.round(canvas.height * scale));
    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = width;
    analysisCanvas.height = height;

    const context = analysisCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(canvas, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const histogram = new Uint32Array(256);
    const gray = new Uint8Array(width * height);

    for (let pixel = 0; pixel < gray.length; pixel += 1) {
      const offset = pixel * 4;
      const value = luminance(data[offset], data[offset + 1], data[offset + 2]);
      gray[pixel] = value;
      histogram[value] += 1;
    }

    const total = gray.length;
    const otsu = otsuThreshold(histogram, total);
    const p70 = histogramPercentile(histogram, total, 0.7);
    const threshold = clamp(Math.min(224, Math.max(112, Math.min(p70, otsu + 12))), 0, 255);
    const mask = new Uint8Array(total);

    for (let pixel = 0; pixel < total; pixel += 1) {
      const offset = pixel * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (gray[pixel] >= threshold && (gray[pixel] >= threshold + 14 || saturation < 96)) {
        mask[pixel] = 1;
      }
    }

    const component = largestComponent(mask, width, height);
    if (!component || component.area < total * 0.08) return null;

    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    const corners = [
      scalePoint(component.topLeft, scaleX, scaleY),
      scalePoint(component.topRight, scaleX, scaleY),
      scalePoint(component.bottomRight, scaleX, scaleY),
      scalePoint(component.bottomLeft, scaleX, scaleY),
    ];
    const expandedCorners = expandCorners(corners, canvas.width, canvas.height, 0.018);
    const bbox = expandRect({
      x: component.minX * scaleX,
      y: component.minY * scaleY,
      width: (component.maxX - component.minX + 1) * scaleX,
      height: (component.maxY - component.minY + 1) * scaleY,
    }, canvas.width, canvas.height, 0.025);

    if (!isUsableQuad(expandedCorners, canvas.width, canvas.height)) {
      return { bbox };
    }

    return { bbox, corners: expandedCorners };
  }

  function largestComponent(mask, width, height) {
    const visited = new Uint8Array(mask.length);
    let best = null;

    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;

      const stack = [start];
      visited[start] = 1;
      const component = {
        area: 0,
        bottomLeft: null,
        bottomRight: null,
        maxDiff: -Infinity,
        maxSum: -Infinity,
        maxX: 0,
        maxY: 0,
        minDiff: Infinity,
        minSum: Infinity,
        minX: width,
        minY: height,
        topLeft: null,
        topRight: null,
      };

      while (stack.length) {
        const pixel = stack.pop();
        const x = pixel % width;
        const y = (pixel - x) / width;
        component.area += 1;
        if (x < component.minX) component.minX = x;
        if (x > component.maxX) component.maxX = x;
        if (y < component.minY) component.minY = y;
        if (y > component.maxY) component.maxY = y;

        const sum = x + y;
        const diff = x - y;
        if (sum < component.minSum) {
          component.minSum = sum;
          component.topLeft = { x, y };
        }
        if (sum > component.maxSum) {
          component.maxSum = sum;
          component.bottomRight = { x, y };
        }
        if (diff > component.maxDiff) {
          component.maxDiff = diff;
          component.topRight = { x, y };
        }
        if (diff < component.minDiff) {
          component.minDiff = diff;
          component.bottomLeft = { x, y };
        }

        const left = pixel - 1;
        const right = pixel + 1;
        const up = pixel - width;
        const down = pixel + width;
        if (x > 0 && mask[left] && !visited[left]) {
          visited[left] = 1;
          stack.push(left);
        }
        if (x < width - 1 && mask[right] && !visited[right]) {
          visited[right] = 1;
          stack.push(right);
        }
        if (y > 0 && mask[up] && !visited[up]) {
          visited[up] = 1;
          stack.push(up);
        }
        if (y < height - 1 && mask[down] && !visited[down]) {
          visited[down] = 1;
          stack.push(down);
        }
      }

      if (!best || component.area > best.area) best = component;
    }

    return best;
  }

  function scalePoint(point, scaleX, scaleY) {
    return { x: point.x * scaleX, y: point.y * scaleY };
  }

  function expandCorners(corners, width, height, amount) {
    const center = corners.reduce(
      (sum, point) => ({ x: sum.x + point.x / corners.length, y: sum.y + point.y / corners.length }),
      { x: 0, y: 0 },
    );
    return corners.map((point) => ({
      x: clamp(point.x + (point.x - center.x) * amount, 0, width - 1),
      y: clamp(point.y + (point.y - center.y) * amount, 0, height - 1),
    }));
  }

  function expandRect(rect, width, height, amount) {
    const paddingX = rect.width * amount;
    const paddingY = rect.height * amount;
    const x = clamp(rect.x - paddingX, 0, width - 1);
    const y = clamp(rect.y - paddingY, 0, height - 1);
    const right = clamp(rect.x + rect.width + paddingX, x + 1, width);
    const bottom = clamp(rect.y + rect.height + paddingY, y + 1, height);
    return {
      height: bottom - y,
      width: right - x,
      x,
      y,
    };
  }

  function isUsableQuad(corners, width, height) {
    const area = polygonArea(corners);
    const imageArea = width * height;
    if (!Number.isFinite(area) || area < imageArea * 0.12) return false;

    const sides = [
      distance(corners[0], corners[1]),
      distance(corners[1], corners[2]),
      distance(corners[2], corners[3]),
      distance(corners[3], corners[0]),
    ];
    return sides.every((side) => Number.isFinite(side) && side > Math.min(width, height) * 0.14);
  }

  function cropCanvas(canvas, rect) {
    if (rect.width < canvas.width * 0.2 || rect.height < canvas.height * 0.2) return null;
    if (rect.width > canvas.width * 0.96 && rect.height > canvas.height * 0.96) return canvas;

    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(rect.width));
    output.height = Math.max(1, Math.round(rect.height));
    const context = output.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return canvas;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      canvas,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      output.width,
      output.height,
    );
    return output;
  }

  function warpCanvasToDocument(canvas, corners) {
    const topWidth = distance(corners[0], corners[1]);
    const bottomWidth = distance(corners[3], corners[2]);
    const leftHeight = distance(corners[0], corners[3]);
    const rightHeight = distance(corners[1], corners[2]);
    let width = Math.max(1, Math.round(Math.max(topWidth, bottomWidth)));
    let height = Math.max(1, Math.round(Math.max(leftHeight, rightHeight)));
    const maxEdge = Math.max(width, height);

    if (maxEdge > SCAN_OUTPUT_EDGE) {
      const scale = SCAN_OUTPUT_EDGE / maxEdge;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const sourceContext = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!sourceContext) return canvas;
    const source = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;

    const outputContext = output.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!outputContext) return canvas;

    const destinationCorners = [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: width - 1, y: height - 1 },
      { x: 0, y: height - 1 },
    ];
    const homography = computeHomography(destinationCorners, corners);
    if (!homography) return canvas;

    const imageData = outputContext.createImageData(width, height);
    const sourceData = source.data;
    const outputData = imageData.data;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const denominator = homography[6] * x + homography[7] * y + 1;
        const targetOffset = (y * width + x) * 4;
        if (Math.abs(denominator) < 1e-8) {
          fillWhite(outputData, targetOffset);
          continue;
        }

        const sourceX = (homography[0] * x + homography[1] * y + homography[2]) / denominator;
        const sourceY = (homography[3] * x + homography[4] * y + homography[5]) / denominator;
        sampleBilinear(sourceData, canvas.width, canvas.height, sourceX, sourceY, outputData, targetOffset);
      }
    }

    outputContext.putImageData(imageData, 0, 0);
    return output;
  }

  function computeHomography(from, to) {
    const matrix = [];
    const vector = [];

    for (let index = 0; index < 4; index += 1) {
      const source = from[index];
      const target = to[index];
      matrix.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y]);
      vector.push(target.x);
      matrix.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y]);
      vector.push(target.y);
    }

    return solveLinearSystem(matrix, vector);
  }

  function solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const rows = matrix.map((row, index) => [...row, vector[index]]);

    for (let column = 0; column < size; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (Math.abs(rows[pivot][column]) < 1e-10) return null;
      if (pivot !== column) {
        const next = rows[column];
        rows[column] = rows[pivot];
        rows[pivot] = next;
      }

      const divisor = rows[column][column];
      for (let cell = column; cell <= size; cell += 1) rows[column][cell] /= divisor;

      for (let row = 0; row < size; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        if (Math.abs(factor) < 1e-12) continue;
        for (let cell = column; cell <= size; cell += 1) {
          rows[row][cell] -= factor * rows[column][cell];
        }
      }
    }

    return rows.map((row) => row[size]);
  }

  function sampleBilinear(source, width, height, x, y, output, offset) {
    if (x < 0 || y < 0 || x > width - 1 || y > height - 1) {
      fillWhite(output, offset);
      return;
    }

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const dx = x - x0;
    const dy = y - y0;
    const topLeft = (y0 * width + x0) * 4;
    const topRight = (y0 * width + x1) * 4;
    const bottomLeft = (y1 * width + x0) * 4;
    const bottomRight = (y1 * width + x1) * 4;

    for (let channel = 0; channel < 3; channel += 1) {
      const top = source[topLeft + channel] * (1 - dx) + source[topRight + channel] * dx;
      const bottom = source[bottomLeft + channel] * (1 - dx) + source[bottomRight + channel] * dx;
      output[offset + channel] = top * (1 - dy) + bottom * dy;
    }
    output[offset + 3] = 255;
  }

  function softenEdgeObstructions(canvas) {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const width = canvas.width;
    const height = canvas.height;
    const total = width * height;
    const margin = Math.max(20, Math.round(Math.min(width, height) * 0.18));
    const mask = new Uint8Array(total);

    for (let y = 0; y < height; y += 1) {
      const nearYEdge = y < margin || y >= height - margin;
      for (let x = 0; x < width; x += 1) {
        if (!nearYEdge && x >= margin && x < width - margin) continue;
        const pixel = y * width + x;
        const offset = pixel * 4;
        if (looksLikeSkin(data[offset], data[offset + 1], data[offset + 2])) {
          mask[pixel] = 1;
        }
      }
    }

    const removeMask = edgeSkinComponents(mask, width, height, margin);
    let expanded = removeMask;
    for (let pass = 0; pass < 4; pass += 1) expanded = dilateMask(expanded, width, height);

    const paper = estimatePaperColor(data);
    let changed = false;
    for (let pixel = 0; pixel < total; pixel += 1) {
      if (!expanded[pixel]) continue;
      const offset = pixel * 4;
      data[offset] = paper[0];
      data[offset + 1] = paper[1];
      data[offset + 2] = paper[2];
      data[offset + 3] = 255;
      changed = true;
    }

    if (changed) context.putImageData(imageData, 0, 0);
  }

  function edgeSkinComponents(mask, width, height, margin) {
    const visited = new Uint8Array(mask.length);
    const output = new Uint8Array(mask.length);
    const minArea = Math.max(48, Math.round(mask.length * 0.00003));
    const maxArea = Math.round(mask.length * 0.12);

    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;

      const stack = [start];
      const pixels = [];
      visited[start] = 1;
      let minX = width;
      let maxX = 0;
      let minY = height;
      let maxY = 0;
      let touchesEdge = false;

      while (stack.length) {
        const pixel = stack.pop();
        pixels.push(pixel);
        const x = pixel % width;
        const y = (pixel - x) / width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) touchesEdge = true;

        const left = pixel - 1;
        const right = pixel + 1;
        const up = pixel - width;
        const down = pixel + width;
        if (x > 0 && mask[left] && !visited[left]) {
          visited[left] = 1;
          stack.push(left);
        }
        if (x < width - 1 && mask[right] && !visited[right]) {
          visited[right] = 1;
          stack.push(right);
        }
        if (y > 0 && mask[up] && !visited[up]) {
          visited[up] = 1;
          stack.push(up);
        }
        if (y < height - 1 && mask[down] && !visited[down]) {
          visited[down] = 1;
          stack.push(down);
        }
      }

      const nearEdge = minX < margin * 0.45
        || minY < margin * 0.45
        || maxX > width - margin * 0.45
        || maxY > height - margin * 0.45;
      if (pixels.length >= minArea && pixels.length <= maxArea && (touchesEdge || nearEdge)) {
        pixels.forEach((pixel) => {
          output[pixel] = 1;
        });
      }
    }

    return output;
  }

  function dilateMask(mask, width, height) {
    const output = mask.slice();
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (!mask[pixel]) continue;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x > 0) output[pixel - 1] = 1;
      if (x < width - 1) output[pixel + 1] = 1;
      if (y > 0) output[pixel - width] = 1;
      if (y < height - 1) output[pixel + width] = 1;
    }
    return output;
  }

  function looksLikeSkin(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const y = luminance(r, g, b);
    return r > 95
      && g > 42
      && b > 22
      && y > 65
      && y < 246
      && r > g * 1.05
      && r > b * 1.2
      && max - min > 18
      && Math.abs(r - g) > 7;
  }

  function estimatePaperColor(data) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    const pixelCount = data.length / 4;
    const step = Math.max(1, Math.floor(pixelCount / 220_000));

    for (let pixel = 0; pixel < pixelCount; pixel += step) {
      const offset = pixel * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (luminance(r, g, b) > 196 && sat < 58) {
        red += r;
        green += g;
        blue += b;
        count += 1;
      }
    }

    if (!count) return [255, 255, 255];
    return [
      Math.max(242, Math.round(red / count)),
      Math.max(242, Math.round(green / count)),
      Math.max(242, Math.round(blue / count)),
    ];
  }

  function enhanceScanCanvas(canvas) {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const histogram = new Uint32Array(256);
    const pixelCount = data.length / 4;
    const step = Math.max(1, Math.floor(pixelCount / 500_000));

    for (let pixel = 0; pixel < pixelCount; pixel += step) {
      const offset = pixel * 4;
      histogram[luminance(data[offset], data[offset + 1], data[offset + 2])] += 1;
    }

    const sampled = Math.ceil(pixelCount / step);
    let low = histogramPercentile(histogram, sampled, 0.018);
    let high = histogramPercentile(histogram, sampled, 0.985);
    if (high - low < 48) {
      low = 24;
      high = 238;
    }

    for (let offset = 0; offset < data.length; offset += 4) {
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const y = luminance(r, g, b);
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const normalized = clamp((y - low) / (high - low), 0, 1);
      let targetY = Math.pow(normalized, 0.86) * 255;
      if (targetY < 72) targetY *= 0.82;
      const scale = targetY / Math.max(1, y);

      let nextR = clampByte((r * scale - 128) * 1.04 + 128);
      let nextG = clampByte((g * scale - 128) * 1.04 + 128);
      let nextB = clampByte((b * scale - 128) * 1.04 + 128);

      if (targetY > 224 && sat < 62) {
        nextR = clampByte(nextR + (255 - nextR) * 0.58);
        nextG = clampByte(nextG + (255 - nextG) * 0.58);
        nextB = clampByte(nextB + (255 - nextB) * 0.58);
      }

      data[offset] = nextR;
      data[offset + 1] = nextG;
      data[offset + 2] = nextB;
      data[offset + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
    if (canvas.width * canvas.height <= 4_800_000) sharpenCanvas(canvas, 0.13);
  }

  function sharpenCanvas(canvas, amount) {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context || canvas.width < 3 || canvas.height < 3) return;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const source = new Uint8ClampedArray(imageData.data);
    const { data } = imageData;
    const width = canvas.width;
    const height = canvas.height;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const offset = (y * width + x) * 4;
        const left = offset - 4;
        const right = offset + 4;
        const up = offset - width * 4;
        const down = offset + width * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const neighbors = (source[left + channel] + source[right + channel] + source[up + channel] + source[down + channel]) / 4;
          data[offset + channel] = clampByte(source[offset + channel] + (source[offset + channel] - neighbors) * amount);
        }
      }
    }

    context.putImageData(imageData, 0, 0);
  }

  function luminance(r, g, b) {
    return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }

  function otsuThreshold(histogram, total) {
    let sum = 0;
    for (let index = 0; index < 256; index += 1) sum += index * histogram[index];

    let sumB = 0;
    let weightB = 0;
    let maximum = 0;
    let threshold = 128;

    for (let index = 0; index < 256; index += 1) {
      weightB += histogram[index];
      if (weightB === 0) continue;
      const weightF = total - weightB;
      if (weightF === 0) break;

      sumB += index * histogram[index];
      const meanB = sumB / weightB;
      const meanF = (sum - sumB) / weightF;
      const between = weightB * weightF * (meanB - meanF) ** 2;
      if (between > maximum) {
        maximum = between;
        threshold = index;
      }
    }

    return threshold;
  }

  function histogramPercentile(histogram, total, percentile) {
    const target = Math.max(1, Math.round(total * percentile));
    let seen = 0;
    for (let index = 0; index < histogram.length; index += 1) {
      seen += histogram[index];
      if (seen >= target) return index;
    }
    return histogram.length - 1;
  }

  function polygonArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function fillWhite(data, offset) {
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampByte(value) {
    return Math.round(clamp(value, 0, 255));
  }

  async function createPdf() {
    if (!state.items.length || state.busy) return;
    state.busy = true;
    render();

    try {
      const settings = readSettings();
      const pages = [];
      for (let index = 0; index < state.items.length; index += 1) {
        const item = state.items[index];
        setStatus(`${formatter.format(index + 1)} / ${formatter.format(state.items.length)} を処理中`);
        const image = await renderItemToJpeg(item, settings);
        pages.push({
          ...image,
          geometry: makeGeometry(image, settings),
        });
      }

      setStatus("PDFを作成中");
      const blob = buildPdf(pages);
      const fileName = cleanPdfName(elements.fileName.value);
      downloadBlob(blob, fileName);
      elements.fileName.value = fileName;
      setStatus(`${fileName} / ${bytesLabel(blob.size)}`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`作成できませんでした: ${message}`);
    } finally {
      state.busy = false;
      render();
    }
  }

  function readSettings() {
    return {
      fitMode: elements.fitMode.value,
      marginMm: Number(elements.margin.value),
      maxEdge: Number(elements.maxEdge.value),
      pageSize: elements.pageSize.value,
      quality: Math.max(0.55, Math.min(0.98, Number(elements.quality.value) / 100)),
    };
  }

  async function renderItemToJpeg(item, settings) {
    const bitmap = await decodeImage(item.file);
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      closeBitmap(bitmap);
      throw new Error(`${item.file.name} を読み込めませんでした`);
    }

    const rotation = normalizeRotation(item.rotation);
    const sideways = rotation === 90 || rotation === 270;
    const rotatedWidth = sideways ? sourceHeight : sourceWidth;
    const rotatedHeight = sideways ? sourceWidth : sourceHeight;
    const maxEdge = settings.maxEdge;
    const scale = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(rotatedWidth, rotatedHeight)) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
    canvas.height = Math.max(1, Math.round(rotatedHeight * scale));

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      closeBitmap(bitmap);
      throw new Error("画像処理を開始できませんでした");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.save();

    if (rotation === 90) {
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
    } else if (rotation === 180) {
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
    } else if (rotation === 270) {
      context.translate(0, canvas.height);
      context.rotate(-Math.PI / 2);
    }

    context.drawImage(bitmap, 0, 0, sourceWidth * scale, sourceHeight * scale);
    context.restore();
    closeBitmap(bitmap);

    const blob = await canvasToBlob(canvas, settings.quality);
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      height: canvas.height,
      width: canvas.width,
    };
  }

  async function decodeImage(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        // Fall through to the Image element path, which covers more older browsers.
      }
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`${file.name} を読み込めませんでした`));
      };
      image.src = url;
    });
  }

  function closeBitmap(bitmap) {
    if (typeof bitmap.close === "function") bitmap.close();
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("画像を書き出せませんでした"));
          }
        },
        "image/jpeg",
        quality,
      );
    });
  }

  function makeGeometry(image, settings) {
    let pageWidth = A4.width;
    let pageHeight = A4.height;

    if (settings.pageSize === "a4-landscape") {
      pageWidth = A4.height;
      pageHeight = A4.width;
    } else if (settings.pageSize === "a4-auto" && image.width > image.height) {
      pageWidth = A4.height;
      pageHeight = A4.width;
    } else if (settings.pageSize === "image-fit") {
      const longEdge = A4.height;
      if (image.width >= image.height) {
        pageWidth = longEdge;
        pageHeight = longEdge * (image.height / image.width);
      } else {
        pageHeight = longEdge;
        pageWidth = longEdge * (image.width / image.height);
      }
    }

    const margin = Math.min(settings.marginMm * MM_TO_PT, pageWidth * 0.35, pageHeight * 0.35);
    const availableWidth = Math.max(1, pageWidth - margin * 2);
    const availableHeight = Math.max(1, pageHeight - margin * 2);
    const widthScale = availableWidth / image.width;
    const heightScale = availableHeight / image.height;
    const scale = settings.fitMode === "cover"
      ? Math.max(widthScale, heightScale)
      : Math.min(widthScale, heightScale);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    return {
      drawHeight,
      drawWidth,
      pageHeight,
      pageWidth,
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
    };
  }

  function buildPdf(pages) {
    const chunks = [];
    const offsets = [];
    let length = 0;

    const appendText = (text) => {
      const bytes = textEncoder.encode(text);
      chunks.push(bytes);
      length += bytes.length;
    };

    const appendBytes = (bytes) => {
      chunks.push(bytes);
      length += bytes.length;
    };

    const beginObject = (number) => {
      offsets[number] = length;
      appendText(`${number} 0 obj\n`);
    };

    appendText("%PDF-1.7\n% Photo PDF Maker\n");

    beginObject(1);
    appendText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    beginObject(2);
    const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
    appendText(`<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs}] >>\nendobj\n`);

    pages.forEach((page, index) => {
      const pageObject = 3 + index * 3;
      const imageObject = pageObject + 1;
      const contentObject = pageObject + 2;
      const geometry = page.geometry;

      beginObject(pageObject);
      appendText(
        [
          "<<",
          "/Type /Page",
          "/Parent 2 0 R",
          `/MediaBox [0 0 ${pdfNumber(geometry.pageWidth)} ${pdfNumber(geometry.pageHeight)}]`,
          `/Resources << /XObject << /Im1 ${imageObject} 0 R >> >>`,
          `/Contents ${contentObject} 0 R`,
          ">>\nendobj\n",
        ].join(" "),
      );

      beginObject(imageObject);
      appendText(
        [
          "<<",
          "/Type /XObject",
          "/Subtype /Image",
          `/Width ${page.width}`,
          `/Height ${page.height}`,
          "/ColorSpace /DeviceRGB",
          "/BitsPerComponent 8",
          "/Filter /DCTDecode",
          `/Length ${page.bytes.length}`,
          ">>\nstream\n",
        ].join(" "),
      );
      appendBytes(page.bytes);
      appendText("\nendstream\nendobj\n");

      const content = [
        "q",
        `${pdfNumber(geometry.drawWidth)} 0 0 ${pdfNumber(geometry.drawHeight)} ${pdfNumber(geometry.x)} ${pdfNumber(geometry.y)} cm`,
        "/Im1 Do",
        "Q",
        "",
      ].join("\n");
      beginObject(contentObject);
      appendText(`<< /Length ${textEncoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
    });

    const xrefOffset = length;
    const totalObjects = pages.length * 3 + 2;
    appendText(`xref\n0 ${totalObjects + 1}\n`);
    appendText("0000000000 65535 f \n");
    for (let objectNumber = 1; objectNumber <= totalObjects; objectNumber += 1) {
      appendText(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    const output = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return new Blob([output], { type: "application/pdf" });
  }

  function pdfNumber(value) {
    return Number(value.toFixed(3)).toString();
  }

  function cleanPdfName(value) {
    const fallback = "photos.pdf";
    const cleaned = (value || fallback).trim().replace(/[\\/:*?"<>|]+/g, "-");
    if (!cleaned) return fallback;
    return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  elements.addButton.addEventListener("click", () => elements.fileInput.click());
  elements.applyScanButton.addEventListener("click", () => {
    void applyScanToAll();
  });
  elements.emptyAddButton.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => {
    void addFiles(event.target.files);
    elements.fileInput.value = "";
  });
  elements.clearButton.addEventListener("click", clearItems);
  elements.createPdfButton.addEventListener("click", createPdf);
  elements.quality.addEventListener("input", render);

  elements.dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  elements.dropZone.addEventListener("dragleave", (event) => {
    if (!elements.dropZone.contains(event.relatedTarget)) {
      elements.dropZone.classList.remove("is-dragging");
    }
  });
  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
    void addFiles(event.dataTransfer.files);
  });

  window.addEventListener("beforeunload", () => {
    state.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  });

  render();
})();

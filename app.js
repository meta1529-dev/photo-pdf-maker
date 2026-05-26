(() => {
  const A4 = { width: 595.28, height: 841.89 };
  const MM_TO_PT = 72 / 25.4;

  const elements = {
    addButton: document.querySelector("#addButton"),
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

    elements.clearButton.disabled = state.busy || imageCount === 0;
    elements.createPdfButton.disabled = state.busy || imageCount === 0;
    elements.emptyState.classList.toggle("is-hidden", imageCount > 0);

    elements.imageGrid.replaceChildren(
      ...state.items.map((item, index) => createThumbCard(item, index)),
    );

    const selected = state.items.find((item) => item.id === state.selectedId);
    if (selected) {
      elements.selectedName.textContent = selected.file.name;
      elements.selectedMeta.textContent = `${bytesLabel(selected.file.size)} / ${indexLabel(selected)}`;
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
    image.alt = item.file.name;
    image.style.transform = `rotate(${item.rotation}deg)`;

    imageWrap.append(image);

    const details = document.createElement("div");
    details.className = "thumb-details";

    const name = document.createElement("p");
    name.className = "thumb-name";
    name.textContent = item.file.name;
    name.title = item.file.name;

    const meta = document.createElement("p");
    meta.className = "thumb-meta";
    meta.textContent = `${formatter.format(index + 1)} / ${formatter.format(state.items.length)}`;

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

  function addFiles(fileList) {
    const files = Array.from(fileList).filter(isImageFile);
    if (!files.length) {
      setStatus("画像ファイルを選んでください");
      return;
    }

    const nextItems = files.map((file) => ({
      file,
      id: makeId(),
      previewUrl: URL.createObjectURL(file),
      rotation: 0,
    }));

    state.items.push(...nextItems);
    if (!state.selectedId) state.selectedId = nextItems[0].id;
    render();
    setStatus(`${formatter.format(nextItems.length)}枚追加しました`);
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
  elements.emptyAddButton.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => {
    addFiles(event.target.files);
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
    addFiles(event.dataTransfer.files);
  });

  window.addEventListener("beforeunload", () => {
    state.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  });

  render();
})();

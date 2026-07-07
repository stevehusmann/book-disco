import React, { useEffect, useMemo, useRef, useState } from 'react';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const DEFAULT_LOCAL_IMAGE_PATH = 'Penguin Deluxe Classics.jpg';

const SpineCropEditor = ({ books, setBooks }) => {
  const pcdBooks = useMemo(
    () => books.filter((b) => (b?.SeriesId || '').toString().toUpperCase() === 'PCD'),
    [books]
  );

  const [selectedId, setSelectedId] = useState('');
  const [sourceMode, setSourceMode] = useState('public');
  const [imageSrc, setImageSrc] = useState(`/${DEFAULT_LOCAL_IMAGE_PATH}`);
  const [publicPath, setPublicPath] = useState(DEFAULT_LOCAL_IMAGE_PATH);
  const [directUrl, setDirectUrl] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [bookListHandle, setBookListHandle] = useState(null);
  const [imgNatural, setImgNatural] = useState({ width: 0, height: 0 });
  const [imgRendered, setImgRendered] = useState({ width: 0, height: 0 });
  const [cropDisplay, setCropDisplay] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  const selectedBook = useMemo(
    () => pcdBooks.find((b) => (b?.ISBN || b?.EAN || b?.Title) === selectedId) || null,
    [pcdBooks, selectedId]
  );

  const publicImageOptions = useMemo(() => {
    const local = books
      .map((b) => (b?.Image || '').toString().trim())
      .filter((src) => {
        if (!src) return false;
        const lower = src.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:') || lower.startsWith('blob:')) return false;
        return true;
      });
    return Array.from(new Set([DEFAULT_LOCAL_IMAGE_PATH, ...local]));
  }, [books]);

  const normalizePublicPath = (value) => {
    const v = (value || '').trim();
    if (!v) return '';
    if (v.startsWith('/')) return v;
    return `/${v}`;
  };

  const mapRotatedToSourcePoint = (rx, ry, width, height, rot) => {
    if (rot === 90) {
      return { x: ry, y: height - rx };
    }
    if (rot === 180) {
      return { x: width - rx, y: height - ry };
    }
    if (rot === 270) {
      return { x: width - ry, y: rx };
    }
    return { x: rx, y: ry };
  };

  const mapSourceToRotatedPoint = (x, y, width, height, rot) => {
    if (rot === 90) {
      return { x: height - y, y: x };
    }
    if (rot === 180) {
      return { x: width - x, y: height - y };
    }
    if (rot === 270) {
      return { x: y, y: width - x };
    }
    return { x, y };
  };

  const getPointInStage = (evt) => {
    if (!stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    const maxWidth = imgRendered.width || rect.width;
    const maxHeight = imgRendered.height || rect.height;
    const x = clamp(evt.clientX - rect.left, 0, maxWidth);
    const y = clamp(evt.clientY - rect.top, 0, maxHeight);
    return { x, y, width: maxWidth, height: maxHeight };
  };

  const onStageMouseDown = (evt) => {
    if (!imageSrc) return;
    const p = getPointInStage(evt);
    if (!p) return;
    setIsDragging(true);
    setDragStart({ x: p.x, y: p.y });
    setCropDisplay({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const onStageMouseMove = (evt) => {
    if (!isDragging || !dragStart) return;
    const p = getPointInStage(evt);
    if (!p) return;
    const x = Math.min(dragStart.x, p.x);
    const y = Math.min(dragStart.y, p.y);
    const width = Math.abs(p.x - dragStart.x);
    const height = Math.abs(p.y - dragStart.y);
    setCropDisplay({ x, y, width, height });
  };

  const onStageMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const onImageLoad = () => {
    const img = imgRef.current;
    if (!img || !stageRef.current || !canvasRef.current) return;

    const naturalWidth = img.naturalWidth || 0;
    const naturalHeight = img.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) return;

    const stageWidth = stageRef.current.clientWidth || 0;
    if (!stageWidth) return;

    const rotatedNaturalWidth = rotation % 180 === 0 ? naturalWidth : naturalHeight;
    const rotatedNaturalHeight = rotation % 180 === 0 ? naturalHeight : naturalWidth;
    const renderedWidth = stageWidth;
    const renderedHeight = Math.max(1, Math.round(renderedWidth * (rotatedNaturalHeight / rotatedNaturalWidth)));

    const canvas = canvasRef.current;
    canvas.width = renderedWidth;
    canvas.height = renderedHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, renderedWidth, renderedHeight);
    ctx.save();
    if (rotation === 90) {
      ctx.translate(renderedWidth, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, renderedHeight, renderedWidth);
    } else if (rotation === 180) {
      ctx.translate(renderedWidth, renderedHeight);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, renderedWidth, renderedHeight);
    } else if (rotation === 270) {
      ctx.translate(0, renderedHeight);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, renderedHeight, renderedWidth);
    } else {
      ctx.drawImage(img, 0, 0, renderedWidth, renderedHeight);
    }
    ctx.restore();

    setImgNatural({ width: naturalWidth, height: naturalHeight });
    setImgRendered({ width: renderedWidth, height: renderedHeight });
  };

  const handleFileUpload = (evt) => {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSourceMode('upload');
      setImageSrc(String(reader.result || ''));
      setCropDisplay(null);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const loadPublicImage = () => {
    const normalized = normalizePublicPath(publicPath);
    if (!normalized) return;
    setSourceMode('public');
    setImageSrc(normalized);
    setCropDisplay(null);
    setRotation(0);
  };

  const loadDirectUrlImage = () => {
    const url = (directUrl || '').trim();
    if (!url) return;
    setSourceMode('url');
    setImageSrc(url);
    setCropDisplay(null);
    setRotation(0);
  };

  const cropSourceCoords = useMemo(() => {
    if (!cropDisplay || !imgRendered.width || !imgRendered.height || !imgNatural.width || !imgNatural.height) {
      return null;
    }

    const rotatedNaturalWidth = rotation % 180 === 0 ? imgNatural.width : imgNatural.height;
    const rotatedNaturalHeight = rotation % 180 === 0 ? imgNatural.height : imgNatural.width;

    const rx0 = cropDisplay.x * (rotatedNaturalWidth / imgRendered.width);
    const ry0 = cropDisplay.y * (rotatedNaturalHeight / imgRendered.height);
    const rx1 = (cropDisplay.x + cropDisplay.width) * (rotatedNaturalWidth / imgRendered.width);
    const ry1 = (cropDisplay.y + cropDisplay.height) * (rotatedNaturalHeight / imgRendered.height);

    const p1 = mapRotatedToSourcePoint(rx0, ry0, imgNatural.width, imgNatural.height, rotation);
    const p2 = mapRotatedToSourcePoint(rx1, ry0, imgNatural.width, imgNatural.height, rotation);
    const p3 = mapRotatedToSourcePoint(rx0, ry1, imgNatural.width, imgNatural.height, rotation);
    const p4 = mapRotatedToSourcePoint(rx1, ry1, imgNatural.width, imgNatural.height, rotation);

    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

    let x = Math.round(minX);
    let y = Math.round(minY);
    let width = Math.max(1, Math.round(maxX - minX));
    let height = Math.max(1, Math.round(maxY - minY));

    x = clamp(x, 0, Math.max(0, imgNatural.width - 1));
    y = clamp(y, 0, Math.max(0, imgNatural.height - 1));
    width = Math.max(1, Math.min(width, imgNatural.width - x));
    height = Math.max(1, Math.min(height, imgNatural.height - y));

    return {
      x,
      y,
      width,
      height,
      nx: Number((x / imgNatural.width).toFixed(6)),
      ny: Number((y / imgNatural.height).toFixed(6)),
      nw: Number((width / imgNatural.width).toFixed(6)),
      nh: Number((height / imgNatural.height).toFixed(6)),
      sourceWidth: imgNatural.width,
      sourceHeight: imgNatural.height,
      editorRotation: rotation
    };
  }, [cropDisplay, imgRendered, imgNatural, rotation]);

  const savedCropDisplay = useMemo(() => {
    const saved = selectedBook?.SpineCrop;
    if (!saved || !imgNatural.width || !imgNatural.height || !imgRendered.width || !imgRendered.height) {
      return null;
    }

    const sx = Number.isFinite(saved.x)
      ? Number(saved.x)
      : Number.isFinite(saved.nx)
        ? Math.round(Number(saved.nx) * imgNatural.width)
        : null;
    const sy = Number.isFinite(saved.y)
      ? Number(saved.y)
      : Number.isFinite(saved.ny)
        ? Math.round(Number(saved.ny) * imgNatural.height)
        : null;
    const sw = Number.isFinite(saved.width)
      ? Number(saved.width)
      : Number.isFinite(saved.nw)
        ? Math.max(1, Math.round(Number(saved.nw) * imgNatural.width))
        : null;
    const sh = Number.isFinite(saved.height)
      ? Number(saved.height)
      : Number.isFinite(saved.nh)
        ? Math.max(1, Math.round(Number(saved.nh) * imgNatural.height))
        : null;

    if (sx == null || sy == null || sw == null || sh == null) return null;

    const x = clamp(Math.round(sx), 0, Math.max(0, imgNatural.width - 1));
    const y = clamp(Math.round(sy), 0, Math.max(0, imgNatural.height - 1));
    const width = Math.max(1, Math.min(Math.round(sw), imgNatural.width - x));
    const height = Math.max(1, Math.min(Math.round(sh), imgNatural.height - y));

    const p1 = mapSourceToRotatedPoint(x, y, imgNatural.width, imgNatural.height, rotation);
    const p2 = mapSourceToRotatedPoint(x + width, y, imgNatural.width, imgNatural.height, rotation);
    const p3 = mapSourceToRotatedPoint(x, y + height, imgNatural.width, imgNatural.height, rotation);
    const p4 = mapSourceToRotatedPoint(x + width, y + height, imgNatural.width, imgNatural.height, rotation);

    const minRX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxRX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minRY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxRY = Math.max(p1.y, p2.y, p3.y, p4.y);

    const rotatedNaturalWidth = rotation % 180 === 0 ? imgNatural.width : imgNatural.height;
    const rotatedNaturalHeight = rotation % 180 === 0 ? imgNatural.height : imgNatural.width;

    return {
      x: (minRX / rotatedNaturalWidth) * imgRendered.width,
      y: (minRY / rotatedNaturalHeight) * imgRendered.height,
      width: ((maxRX - minRX) / rotatedNaturalWidth) * imgRendered.width,
      height: ((maxRY - minRY) / rotatedNaturalHeight) * imgRendered.height
    };
  }, [selectedBook, imgNatural, imgRendered, rotation]);

  const isSavedCropSameSource = useMemo(() => {
    const savedSrc = (selectedBook?.SpineCrop?.src || selectedBook?.SpineCrop?.source || '').toString().trim();
    const currentSrc = (imageSrc || '').toString().trim();
    if (!savedSrc || !currentSrc) return false;
    return savedSrc === currentSrc;
  }, [selectedBook, imageSrc]);

  useEffect(() => {
    onImageLoad();
    setCropDisplay(null);
  }, [rotation]);

  useEffect(() => {
    const handleResize = () => onImageLoad();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, imageSrc]);

  const writeBooksToHandle = async (targetBooks, handleArg) => {
    const handle = handleArg || bookListHandle;
    if (!handle) return false;
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(targetBooks, null, 2));
    await writable.close();
    return true;
  };

  const connectBookListFile = async () => {
    try {
      if (!window.showOpenFilePicker) {
        setSaveStatus('File connection is not supported in this browser. Use Download Updated BookList.json instead.');
        return;
      }
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }
        ]
      });
      if (!handle) return;
      setBookListHandle(handle);
      setSaveStatus(`Connected file: ${handle.name}. Crop saves will write directly to this file.`);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setSaveStatus('File selection canceled.');
        return;
      }
      setSaveStatus('Failed to connect file.');
    }
  };

  const applyCropToSelected = async () => {
    if (!selectedBook || !cropSourceCoords || !imageSrc) return;
    const id = selectedBook.ISBN || selectedBook.EAN || selectedBook.Title;
    const updatedBooks = books.map((b) => {
      const candidate = b.ISBN || b.EAN || b.Title;
      if (candidate !== id) return b;
      return {
        ...b,
        SpineCrop: {
          src: imageSrc,
          ...cropSourceCoords
        }
      };
    });
    setBooks(updatedBooks);

    if (bookListHandle) {
      try {
        await writeBooksToHandle(updatedBooks, bookListHandle);
        setSaveStatus(`Saved crop and wrote directly to ${bookListHandle.name}.`);
      } catch (err) {
        setSaveStatus('Crop saved in app state, but writing file failed. Use Download Updated BookList.json.');
      }
    } else {
      setSaveStatus('Crop saved in app state. Connect BookList.json to write directly, or download updated JSON.');
    }
  };

  const exportBookList = () => {
    const content = JSON.stringify(books, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BookList.updated.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const writeBookListToFile = async () => {
    try {
      if (!window.showSaveFilePicker) {
        setSaveStatus('Direct file write is not supported in this browser. Use Download Updated BookList.json instead.');
        return;
      }

      const handle = await window.showSaveFilePicker({
        suggestedName: 'BookList.json',
        types: [
          {
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(books, null, 2));
      await writable.close();
      setSaveStatus('Wrote updated JSON to file successfully.');
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setSaveStatus('File write canceled.');
        return;
      }
      setSaveStatus('Failed to write JSON file. You can still use the download button.');
    }
  };

  return (
    <div className="spine-crop-editor">
      <h6 className="mb-2">PCD Spine Crop Editor</h6>
      <div className="small text-muted mb-2">Select a PCD book, choose a source image from the public folder, direct URL, or upload, drag a crop over the target spine, then apply and export.</div>

      <label className="form-label mb-1">PCD Book</label>
      <select
        className="form-select form-select-sm mb-2"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">Select a book...</option>
        {pcdBooks.map((b) => {
          const id = b.ISBN || b.EAN || b.Title;
          return (
            <option key={id} value={id}>
              {(b.Title || 'Untitled').trim()} - {b.Author || b.AlphaAuthor || 'Unknown'}
            </option>
          );
        })}
      </select>

      <label className="form-label mb-1">Image Source</label>
      <div className="d-flex gap-3 mb-2">
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="cropSourceMode"
            id="sourcePublic"
            checked={sourceMode === 'public'}
            onChange={() => setSourceMode('public')}
          />
          <label className="form-check-label" htmlFor="sourcePublic">Public folder image</label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="cropSourceMode"
            id="sourceUpload"
            checked={sourceMode === 'upload'}
            onChange={() => setSourceMode('upload')}
          />
          <label className="form-check-label" htmlFor="sourceUpload">Upload file</label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="cropSourceMode"
            id="sourceUrl"
            checked={sourceMode === 'url'}
            onChange={() => setSourceMode('url')}
          />
          <label className="form-check-label" htmlFor="sourceUrl">Direct image URL</label>
        </div>
      </div>

      {sourceMode === 'public' ? (
        <>
          <label className="form-label mb-1">Choose existing local image path</label>
          <select
            className="form-select form-select-sm mb-2"
            value={publicPath}
            onChange={(e) => setPublicPath(e.target.value)}
          >
            <option value="">Select a local image path...</option>
            {publicImageOptions.map((src) => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>

          <label className="form-label mb-1">Or type path under public/</label>
          <div className="input-group input-group-sm mb-2">
            <input
              className="form-control"
              placeholder="e.g. shelf.jpg or images/shelf.jpg"
              value={publicPath}
              onChange={(e) => setPublicPath(e.target.value)}
            />
            <button className="btn btn-outline-secondary" type="button" onClick={loadPublicImage}>Load</button>
          </div>
        </>
      ) : sourceMode === 'url' ? (
        <>
          <label className="form-label mb-1">Direct Image URL</label>
          <div className="input-group input-group-sm mb-2">
            <input
              className="form-control"
              placeholder="https://example.com/spine.jpg"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
            />
            <button className="btn btn-outline-secondary" type="button" onClick={loadDirectUrlImage}>Load</button>
          </div>
        </>
      ) : (
        <>
          <label className="form-label mb-1">Upload Image</label>
          <input className="form-control form-control-sm mb-2" type="file" accept="image/*" onChange={handleFileUpload} />
        </>
      )}

      <label className="form-label mb-1">Rotation</label>
      <div className="d-flex gap-2 mb-2">
        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setRotation((r) => (r + 270) % 360)}>
          Rotate Left 90
        </button>
        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setRotation((r) => (r + 90) % 360)}>
          Rotate Right 90
        </button>
        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setRotation(0)}>
          Reset
        </button>
      </div>
      <div className="small text-muted mb-2">Current rotation: {rotation}deg</div>
      {selectedBook?.SpineCrop && !isSavedCropSameSource && (
        <div className="small text-warning mb-2">Saved crop source does not match the currently loaded image, so saved preview is hidden.</div>
      )}

      <div
        ref={stageRef}
        className="spine-crop-stage mb-2"
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onMouseLeave={onStageMouseUp}
      >
        {imageSrc ? (
          <>
            <img ref={imgRef} src={imageSrc} alt="Spine crop source loader" className="spine-crop-loader" onLoad={onImageLoad} />
            <canvas ref={canvasRef} className="spine-crop-image" />
          </>
        ) : (
          <div className="spine-crop-placeholder">Load a public image path, direct URL, or upload a file to start cropping.</div>
        )}
        {cropDisplay && (
          <div
            className="spine-crop-rect"
            style={{
              left: `${cropDisplay.x}px`,
              top: `${cropDisplay.y}px`,
              width: `${cropDisplay.width}px`,
              height: `${cropDisplay.height}px`
            }}
          />
        )}
        {savedCropDisplay && isSavedCropSameSource && (
          <div
            className="spine-crop-rect-saved"
            style={{
              left: `${savedCropDisplay.x}px`,
              top: `${savedCropDisplay.y}px`,
              width: `${savedCropDisplay.width}px`,
              height: `${savedCropDisplay.height}px`
            }}
          />
        )}
      </div>

      <div className="small mb-2">
        {cropSourceCoords ? (
          <>
            x: {cropSourceCoords.x}, y: {cropSourceCoords.y}, w: {cropSourceCoords.width}, h: {cropSourceCoords.height}
          </>
        ) : (
          'No crop selected.'
        )}
      </div>

      <div className="d-flex gap-2 mb-2">
        <button className="btn btn-sm btn-outline-dark" onClick={connectBookListFile}>
          {bookListHandle ? `Connected: ${bookListHandle.name}` : 'Connect BookList.json'}
        </button>
        <button className="btn btn-sm btn-primary" disabled={!selectedBook || !cropSourceCoords || !imageSrc} onClick={applyCropToSelected}>
          Save Crop To Selected Book
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={exportBookList}>
          Download Updated BookList.json
        </button>
        <button className="btn btn-sm btn-outline-success" onClick={writeBookListToFile}>
          Write Updated JSON To File
        </button>
      </div>

      {saveStatus && <div className="small mb-2">{saveStatus}</div>}

      {selectedBook?.SpineCrop && (
        <pre className="spine-crop-json mb-0">{JSON.stringify(selectedBook.SpineCrop, null, 2)}</pre>
      )}
    </div>
  );
};

export default SpineCropEditor;

import React, { useMemo, useRef, useState } from 'react';

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
  const [saveStatus, setSaveStatus] = useState('');
  const [bookListHandle, setBookListHandle] = useState(null);
  const [imgNatural, setImgNatural] = useState({ width: 0, height: 0 });
  const [imgRendered, setImgRendered] = useState({ width: 0, height: 0 });
  const [cropDisplay, setCropDisplay] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const imgRef = useRef(null);
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

  const getPointInStage = (evt) => {
    if (!stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    const x = clamp(evt.clientX - rect.left, 0, rect.width);
    const y = clamp(evt.clientY - rect.top, 0, rect.height);
    return { x, y, width: rect.width, height: rect.height };
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
    if (!img) return;
    setImgNatural({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    setImgRendered({ width: img.clientWidth || 0, height: img.clientHeight || 0 });
  };

  const handleFileUpload = (evt) => {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSourceMode('upload');
      setImageSrc(String(reader.result || ''));
      setCropDisplay(null);
    };
    reader.readAsDataURL(file);
  };

  const loadPublicImage = () => {
    const normalized = normalizePublicPath(publicPath);
    if (!normalized) return;
    setSourceMode('public');
    setImageSrc(normalized);
    setCropDisplay(null);
  };

  const cropSourceCoords = useMemo(() => {
    if (!cropDisplay || !imgRendered.width || !imgRendered.height || !imgNatural.width || !imgNatural.height) {
      return null;
    }
    const scaleX = imgNatural.width / imgRendered.width;
    const scaleY = imgNatural.height / imgRendered.height;
    const x = Math.round(cropDisplay.x * scaleX);
    const y = Math.round(cropDisplay.y * scaleY);
    const width = Math.max(1, Math.round(cropDisplay.width * scaleX));
    const height = Math.max(1, Math.round(cropDisplay.height * scaleY));
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
      sourceHeight: imgNatural.height
    };
  }, [cropDisplay, imgRendered, imgNatural]);

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
      <div className="small text-muted mb-2">Select a PCD book, choose a source image from the public folder or upload one, drag a crop over the target spine, then apply and export.</div>

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
      ) : (
        <>
          <label className="form-label mb-1">Upload Image</label>
          <input className="form-control form-control-sm mb-2" type="file" accept="image/*" onChange={handleFileUpload} />
        </>
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
          <img ref={imgRef} src={imageSrc} alt="Spine crop source" className="spine-crop-image" onLoad={onImageLoad} />
        ) : (
          <div className="spine-crop-placeholder">Load a public image path or upload a file to start cropping.</div>
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

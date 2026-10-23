import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../apiUrl';
import {
  getQuadBounds,
  mapRotatedPointToSource,
  mapSourcePointToRotated,
  orderRotatedQuadPointsAsSource,
  quadToPointsString,
  renderSpineCropCanvas
} from './spineCropUtils';
import { getBookSpineThickness, getMainBookRenderDimensions } from './bookSpineSizing';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const getBookUid = (book) => (book?._uid || book?.ISBN || book?.EAN || book?.Title || '').toString();
const DEFAULT_LOCAL_IMAGE_PATH = 'PenguinDeluxeClassics.jpg';
const RECENT_DIRECT_URLS_KEY = 'spineCropRecentDirectUrls';
const MAX_RECENT_DIRECT_URLS = 10;

const getSavedCropSource = (crop) => {
  const source = String(crop?.src || crop?.source || '').trim();
  if (!source) return null;
  try {
    const parsed = new URL(source, window.location.origin);
    const directUrl = parsed.searchParams.get('url');
    if (parsed.pathname.endsWith('/api/image-proxy') && directUrl) {
      return { src: source, mode: 'url', directUrl };
    }
    if (['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== window.location.origin) {
      return {
        src: apiUrl(`/api/image-proxy?url=${encodeURIComponent(source)}`),
        mode: 'url',
        directUrl: source
      };
    }
  } catch (error) {
    console.error('Could not parse saved spine crop source:', error);
  }

  let publicPath = source;
  try {
    publicPath = decodeURI(source);
  } catch (error) {
    console.error('Could not decode saved spine crop source:', error);
  }
  return {
    src: source,
    mode: 'public',
    publicPath: publicPath.replace(/^\/+/, '')
  };
};

const getComparableImageSource = (source) => {
  try {
    const parsed = new URL(source, window.location.origin);
    const directUrl = parsed.searchParams.get('url');
    if (parsed.pathname.endsWith('/api/image-proxy') && directUrl) return directUrl;
    return parsed.href;
  } catch (_error) {
    return source;
  }
};

const SpineCropEditor = ({ books, setBooks, seriesOptions = [] }) => {
  const cropSeriesIds = useMemo(
    () => new Set(seriesOptions.filter((series) => series.spineMode === 'pcd-crop').map((series) => series.id)),
    [seriesOptions]
  );
  const pcdBooks = useMemo(
    () => books.filter((book) => cropSeriesIds.has((book?.SeriesId || '').toString())
      || (!seriesOptions.length && (book?.SeriesId || '').toString().toUpperCase() === 'PCD')),
    [books, cropSeriesIds, seriesOptions.length]
  );

  const [selectedId, setSelectedId] = useState('');
  const [sourceMode, setSourceMode] = useState('public');
  const [imageSrc, setImageSrc] = useState(encodeURI(`/${DEFAULT_LOCAL_IMAGE_PATH}`));
  const [publicPath, setPublicPath] = useState(DEFAULT_LOCAL_IMAGE_PATH);
  const [directUrl, setDirectUrl] = useState('');
  const [recentDirectUrls, setRecentDirectUrls] = useState(() => {
    try {
      const urls = JSON.parse(window.localStorage.getItem(RECENT_DIRECT_URLS_KEY) || '[]');
      return Array.isArray(urls) ? urls.filter((url) => typeof url === 'string') : [];
    } catch (error) {
      console.error('Could not load recent spine image URLs:', error);
      return [];
    }
  });
  const [saveStatus, setSaveStatus] = useState('');
  const [isSavingCrop, setIsSavingCrop] = useState(false);
  const [isDeletingBook, setIsDeletingBook] = useState(false);
  const [bookSearch, setBookSearch] = useState('');
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewSignature, setPreviewSignature] = useState('');
  const [previewRevision, setPreviewRevision] = useState(0);
  const [imageLoadError, setImageLoadError] = useState('');
  const [previewRotation, setPreviewRotation] = useState(0);
  const [sourceZoom, setSourceZoom] = useState(1);
  const [imgNatural, setImgNatural] = useState({ width: 0, height: 0 });
  const [imgRendered, setImgRendered] = useState({ width: 0, height: 0 });
  const [cropDisplay, setCropDisplay] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [selectionMode, setSelectionMode] = useState('quad');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [activeQuadDrag, setActiveQuadDrag] = useState(null);

  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  const selectedBook = useMemo(
    () => pcdBooks.find((book) => getBookUid(book) === selectedId) || null,
    [pcdBooks, selectedId]
  );
  const savedCropCount = useMemo(
    () => pcdBooks.filter((book) => Boolean(book?.SpineCrop)).length,
    [pcdBooks]
  );
  const filteredPcdBooks = useMemo(() => {
    const query = bookSearch.trim().toLocaleLowerCase();
    if (!query) return pcdBooks;
    return pcdBooks.filter((book) => [
      book?.Title,
      book?.FullTitle,
      book?.Author,
      book?.AlphaAuthor,
      book?.ISBN,
      book?.EAN,
      book?._uid
    ].some((value) => (value || '').toString().toLocaleLowerCase().includes(query)));
  }, [bookSearch, pcdBooks]);

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
    const pathValue = v.startsWith('/') ? v : `/${v}`;
    return encodeURI(pathValue);
  };

  const getPointInStage = (evt) => {
    if (!stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    const maxWidth = imgRendered.width || stageRef.current.clientWidth;
    const maxHeight = imgRendered.height || stageRef.current.clientHeight;
    const x = clamp((evt.clientX - rect.left - stageRef.current.clientLeft + stageRef.current.scrollLeft) / sourceZoom, 0, maxWidth);
    const y = clamp((evt.clientY - rect.top - stageRef.current.clientTop + stageRef.current.scrollTop) / sourceZoom, 0, maxHeight);
    return { x, y, width: maxWidth, height: maxHeight };
  };

  const onStagePointerDown = (evt) => {
    evt.preventDefault();
    if (stageRef.current && evt.pointerId != null) {
      stageRef.current.setPointerCapture(evt.pointerId);
    }
    if (!imageSrc || activeQuadDrag) return;
    const p = getPointInStage(evt);
    if (!p) return;

    if (selectionMode === 'quad') {
      addQuadPoint(p);
      return;
    }

    beginRectSelection(p);
  };

  const onStagePointerMove = (evt) => {
    if (activeQuadDrag) {
      evt.preventDefault();
      const point = getPointInStage(evt);
      if (!point) return;
      const deltaX = point.x - activeQuadDrag.start.x;
      const deltaY = point.y - activeQuadDrag.start.y;
      setCropDisplay((current) => {
        if (current?.mode !== 'quad') return current;
        const points = [...activeQuadDrag.points];
        activeQuadDrag.indices.forEach((index) => {
          const original = activeQuadDrag.points[index];
          points[index] = {
            x: clamp(original.x + deltaX, 0, imgRendered.width),
            y: clamp(original.y + deltaY, 0, imgRendered.height)
          };
        });
        return { ...current, points };
      });
      setPreviewSrc('');
      setPreviewSignature('');
      return;
    }
    if (!isDragging || !dragStart || selectionMode === 'quad') return;
    evt.preventDefault();
    const p = getPointInStage(evt);
    if (!p) return;
    const x = Math.min(dragStart.x, p.x);
    const y = Math.min(dragStart.y, p.y);
    const width = Math.abs(p.x - dragStart.x);
    const height = Math.abs(p.y - dragStart.y);
    setCropDisplay({ mode: 'rect', x, y, width, height });
  };

  const onStagePointerUp = (evt) => {
    if (evt.pointerId != null && stageRef.current && stageRef.current.hasPointerCapture?.(evt.pointerId)) {
      stageRef.current.releasePointerCapture(evt.pointerId);
    }
    setIsDragging(false);
    setDragStart(null);
    setActiveQuadDrag(null);
  };

  const beginQuadDrag = (evt, indices) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (stageRef.current && evt.pointerId != null) {
      stageRef.current.setPointerCapture(evt.pointerId);
    }
    const start = getPointInStage(evt);
    if (!start || cropDisplay?.mode !== 'quad') return;
    setActiveQuadDrag({ start, indices, points: cropDisplay.points.map((point) => ({ ...point })) });
  };

  const beginRectSelection = (point) => {
    setIsDragging(true);
    setDragStart({ x: point.x, y: point.y });
    setCropDisplay({ mode: 'rect', x: point.x, y: point.y, width: 0, height: 0 });
  };

  const addQuadPoint = (point) => {
    setCropDisplay((current) => {
      const points = Array.isArray(current?.points) ? [...current.points] : [];
      if (points.length >= 4) {
        points.length = 0;
      }
      points.push({ x: point.x, y: point.y });
      return { mode: 'quad', points: points.slice(0, 4) };
    });
  };


  const onImageLoad = useCallback(() => {
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
  }, [rotation]);

  const loadPublicImage = () => {
    const normalized = normalizePublicPath(publicPath);
    if (!normalized) return;
    setSourceMode('public');
    setImageSrc(normalized);
    setCropDisplay(null);
    setRotation(0);
    setPreviewRotation(0);
    setPreviewSrc('');
    setPreviewSignature('');
    setImageLoadError('');
  };

  const selectBook = (uid) => {
    const book = pcdBooks.find((item) => getBookUid(item) === uid);
    setSelectedId(uid);
    setCropDisplay(null);
    setSaveStatus('');
    setPreviewSrc('');
    setPreviewSignature('');
    setImgNatural({ width: 0, height: 0 });
    setImgRendered({ width: 0, height: 0 });
    setPreviewRotation(0);

    const savedCrop = book?.SpineCrop;
    if (!savedCrop) return;
    setSelectionMode(savedCrop.mode === 'rect' ? 'rect' : 'quad');
    const savedSource = getSavedCropSource(savedCrop);
    if (savedSource) {
      setSourceMode(savedSource.mode);
      if (savedSource.mode === 'url') {
        setDirectUrl(savedSource.directUrl);
        setRecentDirectUrls((current) => [
          savedSource.directUrl,
          ...current.filter((url) => url !== savedSource.directUrl)
        ].slice(0, MAX_RECENT_DIRECT_URLS));
      } else {
        setPublicPath(savedSource.publicPath);
      }
      setImageSrc(savedSource.src);
    }
    setRotation([90, 180, 270].includes(Number(savedCrop.editorRotation))
      ? Number(savedCrop.editorRotation)
      : 0);
    setPreviewRotation(Number(savedCrop.outputRotation) || 0);
  };

  const loadDirectUrlImage = () => {
    const url = (directUrl || '').trim();
    if (!url) return;
    setRecentDirectUrls((current) => [url, ...current.filter((recentUrl) => recentUrl !== url)].slice(0, MAX_RECENT_DIRECT_URLS));
    setSourceMode('url');
    setImageSrc(apiUrl(`/api/image-proxy?url=${encodeURIComponent(url)}`));
    setCropDisplay(null);
    setRotation(0);
    setPreviewRotation(0);
    setPreviewSrc('');
    setPreviewSignature('');
    setImageLoadError('');
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_DIRECT_URLS_KEY, JSON.stringify(recentDirectUrls));
    } catch (error) {
      console.error('Could not save recent spine image URLs:', error);
    }
  }, [recentDirectUrls]);

  const cropSourceCoords = useMemo(() => {
    if (!cropDisplay || !imgRendered.width || !imgRendered.height || !imgNatural.width || !imgNatural.height) {
      return null;
    }

    if (cropDisplay.mode === 'quad' && Array.isArray(cropDisplay.points) && cropDisplay.points.length === 4) {
      const rotatedNaturalWidth = rotation % 180 === 0 ? imgNatural.width : imgNatural.height;
      const rotatedNaturalHeight = rotation % 180 === 0 ? imgNatural.height : imgNatural.width;

      const rotatedPoints = cropDisplay.points.map((point) => {
        const px = (point.x / imgRendered.width) * rotatedNaturalWidth;
        const py = (point.y / imgRendered.height) * rotatedNaturalHeight;
        return { x: px, y: py };
      });

      const normalized = orderRotatedQuadPointsAsSource(rotatedPoints, imgNatural.width, imgNatural.height, rotation);
      const bounds = getQuadBounds(normalized);

      return {
        mode: 'quad',
        points: normalized,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        nx: Number((bounds.x / imgNatural.width).toFixed(6)),
        ny: Number((bounds.y / imgNatural.height).toFixed(6)),
        nw: Number((bounds.width / imgNatural.width).toFixed(6)),
        nh: Number((bounds.height / imgNatural.height).toFixed(6)),
        sourceWidth: imgNatural.width,
        sourceHeight: imgNatural.height,
        editorRotation: rotation,
        pointsString: quadToPointsString(normalized)
      };
    }

    const rotatedNaturalWidth = rotation % 180 === 0 ? imgNatural.width : imgNatural.height;
    const rotatedNaturalHeight = rotation % 180 === 0 ? imgNatural.height : imgNatural.width;

    const rx0 = cropDisplay.x * (rotatedNaturalWidth / imgRendered.width);
    const ry0 = cropDisplay.y * (rotatedNaturalHeight / imgRendered.height);
    const rx1 = (cropDisplay.x + cropDisplay.width) * (rotatedNaturalWidth / imgRendered.width);
    const ry1 = (cropDisplay.y + cropDisplay.height) * (rotatedNaturalHeight / imgRendered.height);

    const p1 = mapRotatedPointToSource(rx0, ry0, imgNatural.width, imgNatural.height, rotation);
    const p2 = mapRotatedPointToSource(rx1, ry0, imgNatural.width, imgNatural.height, rotation);
    const p3 = mapRotatedPointToSource(rx0, ry1, imgNatural.width, imgNatural.height, rotation);
    const p4 = mapRotatedPointToSource(rx1, ry1, imgNatural.width, imgNatural.height, rotation);

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
      mode: 'rect',
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

  const cropSignature = cropSourceCoords
    ? JSON.stringify({ imageSrc, cropSourceCoords })
    : '';
  const previewIsCurrent = Boolean(previewSrc && cropSignature && previewSignature === cropSignature);

  useEffect(() => {
    if (!cropSignature) {
      setPreviewSrc('');
      setPreviewSignature('');
      return;
    }
    const sourceImage = imgRef.current;
    if (!sourceImage || !cropSourceCoords || !sourceImage.complete) return;
    try {
      const previewCanvas = renderSpineCropCanvas(sourceImage, {
        ...cropSourceCoords,
        outputRotation: previewRotation
      });
      setPreviewSrc(previewCanvas ? previewCanvas.toDataURL('image/jpeg', 0.92) : '');
      setPreviewSignature(cropSignature);
    } catch (error) {
      setPreviewSrc('');
      setImageLoadError('Could not generate a preview from this image. Check that it is a supported image URL.');
      console.error('Could not render crop preview:', error);
    }
  }, [cropSignature, cropSourceCoords, imageSrc, imgNatural, previewRotation, previewRevision]);

  const generatePreview = () => {
    if (!cropSignature) return;
    setSaveStatus('');
    setPreviewRevision((revision) => revision + 1);
  };

  const savedCropDisplay = useMemo(() => {
    const saved = selectedBook?.SpineCrop;
    if (!saved || !imgNatural.width || !imgNatural.height || !imgRendered.width || !imgRendered.height) {
      return null;
    }

    if (saved.mode === 'quad' && Array.isArray(saved.points) && saved.points.length === 4) {
      const rotatedNaturalWidth = rotation % 180 === 0 ? imgNatural.width : imgNatural.height;
      const rotatedNaturalHeight = rotation % 180 === 0 ? imgNatural.height : imgNatural.width;
      const displayPoints = saved.points.map((point) => {
        const px = Number(point.x);
        const py = Number(point.y);
        const rotatedPoint = mapSourcePointToRotated(px, py, imgNatural.width, imgNatural.height, rotation);
        return {
          x: (rotatedPoint.x / rotatedNaturalWidth) * imgRendered.width,
          y: (rotatedPoint.y / rotatedNaturalHeight) * imgRendered.height
        };
      });

      return {
        mode: 'quad',
        points: displayPoints
      };
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

    const p1 = mapSourcePointToRotated(x, y, imgNatural.width, imgNatural.height, rotation);
    const p2 = mapSourcePointToRotated(x + width, y, imgNatural.width, imgNatural.height, rotation);
    const p3 = mapSourcePointToRotated(x, y + height, imgNatural.width, imgNatural.height, rotation);
    const p4 = mapSourcePointToRotated(x + width, y + height, imgNatural.width, imgNatural.height, rotation);

    const minRX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxRX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minRY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxRY = Math.max(p1.y, p2.y, p3.y, p4.y);

    const rotatedNaturalWidth = rotation % 180 === 0 ? imgNatural.width : imgNatural.height;
    const rotatedNaturalHeight = rotation % 180 === 0 ? imgNatural.height : imgNatural.width;

    return {
      mode: 'rect',
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
    return getComparableImageSource(savedSrc) === getComparableImageSource(currentSrc);
  }, [selectedBook, imageSrc]);
  const previewBookDimensions = useMemo(
    () => getMainBookRenderDimensions(selectedBook, seriesOptions),
    [selectedBook, seriesOptions]
  );
  const selectedSeries = seriesOptions.find((series) => series.id === selectedBook?.SeriesId);
  const previewSpineWidth = clamp(
    getBookSpineThickness({
      coverWidth: previewBookDimensions.width,
      pagination: Number(selectedBook?.PAGINATION) || 300,
      series: selectedBook?.SeriesId || selectedBook?.Series || '',
      seriesId: selectedBook?.SeriesId || '',
      thicknessMultiplier: Number(selectedSeries?.thicknessMultiplier) || 1
    }) || 14,
    6,
    200
  );

  useEffect(() => {
    if (!selectedBook?.SpineCrop || !savedCropDisplay || !isSavedCropSameSource) return;
    setCropDisplay((current) => current || savedCropDisplay);
    setPreviewRotation(Number(selectedBook.SpineCrop.outputRotation) || 0);
  }, [selectedBook, savedCropDisplay, isSavedCropSameSource]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (imgRef.current?.complete) onImageLoad();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, imageSrc, onImageLoad]);
  const sourceContentStyle = {
    width: `${imgRendered.width * sourceZoom}px`,
    height: `${imgRendered.height * sourceZoom}px`
  };
  const sourceImageStyle = {
    width: `${imgRendered.width}px`,
    height: `${imgRendered.height}px`,
    transform: `scale(${sourceZoom})`
  };

  useEffect(() => {
    onImageLoad();
    setCropDisplay(null);
    setPreviewRotation(0);
  }, [rotation, onImageLoad]);

  useEffect(() => {
    const handleResize = () => onImageLoad();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rotation, imageSrc, onImageLoad]);

  const saveBookToApi = async (book) => {
    const bookUid = book?._uid || book?.ISBN || book?.EAN || book?.Title;
    if (!bookUid) {
      throw new Error('Book is missing a stable identifier.');
    }

    const response = await fetch(apiUrl(`/api/books/${encodeURIComponent(bookUid)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(book)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Failed to save ${bookUid}`);
    }

    return response.json();
  };

  const applyCropToSelected = async () => {
    if (!selectedBook || !cropSourceCoords || !imageSrc || isSavingCrop) return;
    const id = getBookUid(selectedBook);
    const nextSelectedBook = {
      ...selectedBook,
      SpineCrop: {
        src: imageSrc,
        ...cropSourceCoords,
        outputRotation: previewRotation,
        mode: cropSourceCoords.mode || 'rect',
        points: cropSourceCoords.points || undefined
      }
    };
    setIsSavingCrop(true);
    setSaveStatus(`Saving crop for ${selectedBook.Title || 'selected book'}...`);
    try {
      const savedBook = await saveBookToApi(nextSelectedBook);
      setBooks((currentBooks) => currentBooks.map((book) =>
        getBookUid(book) === id
          ? { ...book, ...savedBook }
          : book
      ));
      setSaveStatus(`Saved crop for ${savedBook.Title || selectedBook.Title || 'selected book'} to the database.`);
    } catch (err) {
      setSaveStatus(`Could not save crop for ${selectedBook.Title || 'selected book'}.`);
      console.error('Failed to save crop to API:', err);
    } finally {
      setIsSavingCrop(false);
    }
  };

  const deleteSelectedBook = async () => {
    if (!selectedBook || isDeletingBook || isSavingCrop) return;
    const uid = getBookUid(selectedBook);
    if (!uid) {
      setSaveStatus('Cannot delete this book because it is missing a stable identifier.');
      return;
    }
    if (!window.confirm(`Permanently delete "${selectedBook.Title || 'this book'}" from the library?`)) return;

    setIsDeletingBook(true);
    setSaveStatus(`Deleting ${selectedBook.Title || 'selected book'}...`);
    try {
      const response = await fetch(apiUrl(`/api/books/${encodeURIComponent(uid)}`), { method: 'DELETE' });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to delete ${uid}`);
      }

      setBooks((currentBooks) => currentBooks.filter((book) =>
        getBookUid(book) !== uid
      ));
      setSelectedId('');
      setCropDisplay(null);
      setPreviewSrc('');
      setPreviewSignature('');
      setSaveStatus(`Deleted ${selectedBook.Title || 'book'} from the library.`);
    } catch (error) {
      setSaveStatus(error?.message || 'Failed to delete book.');
      console.error(`Failed to delete book ${uid}:`, error);
    } finally {
      setIsDeletingBook(false);
    }
  };

  return (
    <div className="spine-crop-editor">
      <h6 className="mb-2">PCD Spine Crop Editor</h6>
      <div className="small text-muted mb-2">Select a book and image, define the crop, generate a preview, then confirm it to save.</div>
      <div className="small mb-2" role="status">Crops saved: {savedCropCount} / {pcdBooks.length}</div>

      <label className="form-label mb-1">PCD Book</label>
      <input
        className="form-control form-control-sm mb-2"
        type="search"
        aria-label="Search PCD books"
        placeholder="Search title, author, or ISBN"
        value={bookSearch}
        onChange={(event) => setBookSearch(event.target.value)}
      />
      <select
        className="form-select form-select-sm mb-2"
        aria-label="PCD Book"
        value={selectedId}
        onChange={(event) => selectBook(event.target.value)}
      >
        <option value="">Select a book...</option>
        {filteredPcdBooks.map((b) => {
          const id = getBookUid(b);
          return (
            <option key={id} value={id}>
              {(b.Title || 'Untitled').trim()} - {b.Author || b.AlphaAuthor || 'Unknown'}{b.SpineCrop ? ' (crop saved)' : ' (no crop)'}
            </option>
          );
        })}
      </select>
      {filteredPcdBooks.length === 0 && bookSearch.trim() && (
        <div className="small text-muted mb-2">No PCD books match that search.</div>
      )}
      {selectedBook && (
        <button
          className="btn btn-sm btn-outline-danger mb-3"
          type="button"
          onClick={deleteSelectedBook}
          disabled={isDeletingBook || isSavingCrop}
        >
          {isDeletingBook ? 'Deleting Book...' : 'Delete Book Record'}
        </button>
      )}

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
          {recentDirectUrls.length > 0 && (
            <>
              <label className="form-label mb-1" htmlFor="recentDirectUrls">Recent direct image URLs</label>
              <select
                id="recentDirectUrls"
                className="form-select form-select-sm mb-2"
                value=""
                onChange={(event) => {
                  if (event.target.value) setDirectUrl(event.target.value);
                }}
              >
                <option value="">Choose a recent URL...</option>
                {recentDirectUrls.map((url) => (
                  <option key={url} value={url}>{url}</option>
                ))}
              </select>
            </>
          )}
        </>
      ) : null}

      <label className="form-label mb-1">Selection Mode</label>
      <div className="d-flex gap-3 mb-2">
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="cropSelectionMode"
            id="cropSelectionQuad"
            checked={selectionMode === 'quad'}
            onChange={() => {
              setSelectionMode('quad');
              setCropDisplay(null);
            }}
          />
          <label className="form-check-label" htmlFor="cropSelectionQuad">4-point skew</label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="cropSelectionMode"
            id="cropSelectionRect"
            checked={selectionMode === 'rect'}
            onChange={() => {
              setSelectionMode('rect');
              setCropDisplay(null);
            }}
          />
          <label className="form-check-label" htmlFor="cropSelectionRect">Rectangle</label>
        </div>
      </div>

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
      <div className="d-flex align-items-center gap-2 mb-2" aria-label="Source image zoom controls">
        <span className="small">Source image zoom: {Math.round(sourceZoom * 100)}%</span>
        <button
          className="btn btn-sm btn-outline-secondary"
          type="button"
          aria-label="Zoom source image out"
          onClick={() => setSourceZoom((zoom) => Math.max(0.5, Math.round((zoom - 0.25) * 100) / 100))}
          disabled={sourceZoom <= 0.5}
        >−</button>
        <button
          className="btn btn-sm btn-outline-secondary"
          type="button"
          aria-label="Zoom source image in"
          onClick={() => setSourceZoom((zoom) => Math.min(3, Math.round((zoom + 0.25) * 100) / 100))}
          disabled={sourceZoom >= 3}
        >+</button>
        <button
          className="btn btn-sm btn-outline-secondary"
          type="button"
          onClick={() => setSourceZoom(1)}
          disabled={sourceZoom === 1}
        >Reset zoom</button>
      </div>
      {selectedBook && (
        <div className={`small mb-2 ${selectedBook.SpineCrop ? 'text-success' : 'text-muted'}`} role="status">
          {selectedBook.SpineCrop ? 'A crop is saved for this book.' : 'No crop is saved for this book yet.'}
        </div>
      )}
      {selectedBook?.SpineCrop && !isSavedCropSameSource && (
          <div className="small text-warning mb-2">Saved crop source does not match the currently loaded image, so saved preview is hidden.</div>
      )}

      <div className="spine-crop-workspace">
        <div className="spine-crop-source-column">
      <div
        ref={stageRef}
        className="spine-crop-stage mb-2"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerLeave={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
      >
        {imageSrc ? (
          <div className="spine-crop-zoom-content" style={sourceContentStyle}>
            <div className="spine-crop-image-layer" style={sourceImageStyle}>
              <img ref={imgRef} src={imageSrc} alt="Spine crop source loader" className="spine-crop-loader" crossOrigin="anonymous" onLoad={() => { setImageLoadError(''); onImageLoad(); }} onError={() => setImageLoadError('Could not load this image. Check the URL and try again.')} />
              <canvas ref={canvasRef} className="spine-crop-image" />
              {selectionMode === 'quad' && Array.isArray(cropDisplay?.points) && cropDisplay.points.length > 0 && (
                <svg className="spine-crop-polygon-layer editable" viewBox={`0 0 ${imgRendered.width || 1} ${imgRendered.height || 1}`} preserveAspectRatio="none">
                  <polygon points={quadToPointsString(cropDisplay.points)} />
                  {cropDisplay.points.length === 4 && cropDisplay.points.map((point, index) => {
                    const nextIndex = (index + 1) % 4;
                    const nextPoint = cropDisplay.points[nextIndex];
                    return (
                      <line
                        key={`edge-${index}`}
                        className="spine-crop-edge-handle"
                        x1={point.x}
                        y1={point.y}
                        x2={nextPoint.x}
                        y2={nextPoint.y}
                        onPointerDown={(event) => beginQuadDrag(event, [index, nextIndex])}
                      />
                    );
                  })}
                  {cropDisplay.points.map((point, index) => (
                    <circle
                      key={`point-${index}`}
                      className="spine-crop-point-handle"
                      cx={point.x}
                      cy={point.y}
                      r="8"
                      onPointerDown={(event) => beginQuadDrag(event, [index])}
                    />
                  ))}
                </svg>
              )}
              {selectionMode === 'rect' && cropDisplay && (
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
              {savedCropDisplay && !cropDisplay && isSavedCropSameSource && (
                savedCropDisplay.mode === 'quad' ? (
                  <svg className="spine-crop-polygon-layer saved" viewBox={`0 0 ${imgRendered.width || 1} ${imgRendered.height || 1}`} preserveAspectRatio="none">
                    <polygon points={quadToPointsString(savedCropDisplay.points)} />
                  </svg>
                ) : (
                  <div
                    className="spine-crop-rect-saved"
                    style={{
                      left: `${savedCropDisplay.x}px`,
                      top: `${savedCropDisplay.y}px`,
                      width: `${savedCropDisplay.width}px`,
                      height: `${savedCropDisplay.height}px`
                    }}
                  />
                )
              )}
            </div>
          </div>
        ) : (
          <div className="spine-crop-placeholder">Load a public image path or direct URL to start cropping.</div>
        )}
      </div>

      <div className="small mb-2">
        {cropSourceCoords
          ? `x: ${cropSourceCoords.x}, y: ${cropSourceCoords.y}, w: ${cropSourceCoords.width}, h: ${cropSourceCoords.height}`
          : 'No crop selected.'}
      </div>
      {imageLoadError && <div className="small text-danger mb-2" role="alert">{imageLoadError}</div>}
      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-sm btn-outline-primary" type="button" disabled={!cropSourceCoords || !imageSrc || isSavingCrop} onClick={generatePreview}>
          Generate Preview
        </button>
      </div>
        </div>

      <section className="spine-crop-dock" aria-label="Crop preview and save">
        <div className="spine-crop-dock-preview">
          <strong className="small d-block mb-1">Book preview</strong>
          {selectedBook ? (
            <div
              className="spine-crop-preview-scene"
              aria-label="Book preview with spine and cover"
              style={{ height: `${previewBookDimensions.height + 48}px` }}
            >
              <div
                className="spine-crop-preview-book"
                data-testid="spine-crop-preview-book"
                style={{
                  width: `${previewBookDimensions.width}px`,
                  height: `${previewBookDimensions.height}px`,
                  transform: `rotateY(30deg) translateZ(30px) translateX(0) translateZ(-${previewSpineWidth}px)`
                }}
              >
                <div className="spine-crop-preview-front" style={{ transform: `translateZ(${previewSpineWidth - 1}px)` }}>
                  {selectedBook.Image ? (
                    <img src={selectedBook.Image} alt={`${selectedBook.Title || 'Selected book'} cover`} />
                  ) : (
                    <div className="spine-crop-preview-cover-placeholder">No cover image</div>
                  )}
                </div>
                <div
                  className="spine-crop-preview-spine"
                  style={{ width: `${previewSpineWidth}px`, transform: 'rotateY(-90deg)', transformOrigin: 'left center' }}
                >
                  {previewIsCurrent ? (
                    <img src={previewSrc} alt="Generated spine crop preview" />
                  ) : (
                    <span>{cropSourceCoords ? 'Updating preview...' : 'Select crop'}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="spine-crop-dock-placeholder">Select a book to preview its cover with the cropped spine.</div>
          )}
        </div>
        <div className="spine-crop-dock-actions">
          <div className="small text-muted mb-2">Rotate preview: {previewRotation} degrees</div>
          <div className="d-flex flex-wrap gap-2 mb-2">
            <button className="btn btn-sm btn-outline-secondary" type="button" aria-label="Rotate crop preview left" onClick={() => setPreviewRotation((value) => (value + 270) % 360)} disabled={!previewIsCurrent}>Rotate Left</button>
            <button className="btn btn-sm btn-outline-secondary" type="button" aria-label="Rotate crop preview right" onClick={() => setPreviewRotation((value) => (value + 90) % 360)} disabled={!previewIsCurrent}>Rotate Right</button>
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setPreviewRotation(0)} disabled={!previewIsCurrent || previewRotation === 0}>Reset</button>
          </div>
          <button className="btn btn-sm btn-primary" disabled={!selectedBook || !cropSourceCoords || !previewIsCurrent || !imageSrc || isSavingCrop} onClick={applyCropToSelected}>
            {isSavingCrop ? 'Saving Crop...' : 'Confirm & Save Crop'}
          </button>
        </div>
      </section>
      </div>

      {saveStatus && <div className="small mb-2">{saveStatus}</div>}

      {selectedBook?.SpineCrop && (
        <pre className="spine-crop-json mb-0">{JSON.stringify(selectedBook.SpineCrop, null, 2)}</pre>
      )}
    </div>
  );
};

export default SpineCropEditor;

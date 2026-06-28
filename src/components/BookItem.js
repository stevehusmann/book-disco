import React, { useEffect, useRef, useState } from 'react';
import Col from 'react-bootstrap/Col';
import SpineOWC from './SpineOWC';
import SpineBNC from './SpineBNC';
import SpinePC from './SpinePC';
import SpinePCD from './SpinePCD';

const PHYSICAL_SERIES_SIZES = {
  container: { width: 7.0, height: 9 },
  owc: { width: 5.1875, height: 7.6875 },
  bnc: { width: 5.25, height: 8.0 },
  pc: { width: 5.0, height: 7.75 },
  pcd: { width: 5.67, height: 8.35 }
};

const BookItem = ({ book, index, pageIndex, header = null, colStyle = {}, colClass = '', layout = 'title' }) => {

  const pagination = Number(book?.PAGINATION || 300);
  const series = (book?.SeriesId || book?.Series || '').toString();
  const seriesId = (book?.SeriesId || book?.Series || 'GEN').toString().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').toLowerCase();

  const seriesSize = PHYSICAL_SERIES_SIZES[seriesId];
  const horizontalPaddingRatio = seriesSize
    ? (PHYSICAL_SERIES_SIZES.container.width - seriesSize.width) / PHYSICAL_SERIES_SIZES.container.width / 2
    : 0;
  const topPaddingRatio = seriesSize
    ? (PHYSICAL_SERIES_SIZES.container.height - seriesSize.height) / PHYSICAL_SERIES_SIZES.container.height
    : 0;

  const bookRef = useRef(null);
  const [thicknessWidth, setThicknessWidth] = useState(null);
  const [horizontalPadding, setHorizontalPadding] = useState(0);
  const [topPadding, setTopPadding] = useState(0);
  const [pcRibbon, setPcRibbon] = useState(null);

  // Try to compute thickness proportionally from rendered cover width for OWC series.
  // Physical reference: OWC 5-3/16" (83/16 in) wide, 464pp -> thickness 13/16".
  // Per-page multiplier relative to cover width = (13/83) / 464 = 13/(83*464).
  const OWC_PER_PAGE_REL = 0.00062; // 13/(83*464) ~= 0.000337
  // BNC physical reference: thickness 1.12" for 448 pages, cover width 5.25"
  // Per-page multiplier relative to cover width = (1.12 / 5.25) / 448 = 1.12/(5.25*448)
  const BNC_PER_PAGE_REL = 0.00069;
  // PC physical reference: 16mm thickness, 128mm cover width, 368 pages
  // Per-page multiplier relative to cover width = (16 / 128) / 368 = 16/(128*368)
  const PC_PER_PAGE_REL = 0.000594;
  // PCD physical reference: 1.69" thickness, 5.67" cover width, 672 pages
  // Per-page multiplier relative to cover width = (1.69 / 5.67) / 672 = 1.69/(5.67*672)
  const PCD_PER_PAGE_REL = 0.000684;
  const isPCD = /Penguin Classics Deluxe/i.test(series) || seriesId === 'pcd';
  const isPC = seriesId === 'pc' || (/Penguin Classics/i.test(series) && !/Deluxe/i.test(series));

  const detectPcRibbon = (imgEl) => {
    if (!imgEl || !isPC) return;
    try {
      const naturalW = imgEl.naturalWidth || imgEl.width;
      const naturalH = imgEl.naturalHeight || imgEl.height;
      const renderW = Math.round(imgEl.clientWidth || imgEl.width || 0);
      const renderH = Math.round(imgEl.clientHeight || imgEl.height || 0);
      if (!naturalW || !naturalH || !renderW || !renderH) return;

      const canvas = document.createElement('canvas');
      canvas.width = renderW;
      canvas.height = renderH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Simulate CSS object-fit: cover so pixels match what is actually displayed.
      const scale = Math.max(renderW / naturalW, renderH / naturalH);
      const drawW = naturalW * scale;
      const drawH = naturalH * scale;
      const dx = (renderW - drawW) / 2;
      const dy = (renderH - drawH) / 2;
      ctx.drawImage(imgEl, dx, dy, drawW, drawH);

      const pixels = ctx.getImageData(0, 0, renderW, renderH).data;

      // Search range: 45–85% of the cover where the PC ribbon lives.
      const yStart = Math.max(0, Math.floor(renderH * 0.45));
      const yEnd = Math.min(renderH - 1, Math.ceil(renderH * 0.85));
      const xStart = Math.floor(renderW * 0.08);
      const xEnd = Math.ceil(renderW * 0.92);
      const xCount = xEnd - xStart + 1;

      // Compute average luminance per row (robust to JPEG noise).
      const rowLum = [];
      for (let y = yStart; y <= yEnd; y++) {
        let lumSum = 0;
        for (let x = xStart; x <= xEnd; x++) {
          const idx = (y * renderW + x) * 4;
          lumSum += 0.2126 * pixels[idx] + 0.7152 * pixels[idx + 1] + 0.0722 * pixels[idx + 2];
        }
        rowLum.push({ y, lum: lumSum / xCount });
      }

      // Find the top edge of the ribbon: the row with the largest upward lum jump
      // (dark artwork → bright ribbon). Same for bottom edge (bright → dark).
      let topEdge = -1, topDelta = 0;
      let botEdge = -1, botDelta = 0;
      for (let i = 1; i < rowLum.length; i++) {
        const rise = rowLum[i].lum - rowLum[i - 1].lum;
        const fall = rowLum[i - 1].lum - rowLum[i].lum;
        if (rise > topDelta) { topDelta = rise; topEdge = i; }
        if (fall > botDelta) { botDelta = fall; botEdge = i - 1; }
      }

      // Need a meaningful transition (not a noisy flat region).
      if (topEdge < 0 || botEdge < 0 || topEdge >= botEdge || topDelta < 15 || botDelta < 15) {
        setPcRibbon(null);
        return;
      }

      const topY    = rowLum[topEdge].y;
      const bottomY = rowLum[botEdge].y;

      // Average color of the ribbon band.
      let rSum = 0, gSum = 0, bSum = 0, bandPx = 0;
      for (let y = topY; y <= bottomY; y++) {
        for (let x = xStart; x <= xEnd; x++) {
          const idx = (y * renderW + x) * 4;
          rSum += pixels[idx];
          gSum += pixels[idx + 1];
          bSum += pixels[idx + 2];
          bandPx++;
        }
      }
      const avgR = bandPx ? Math.round(rSum / bandPx) : 241;
      const avgG = bandPx ? Math.round(gSum / bandPx) : 239;
      const avgB = bandPx ? Math.round(bSum / bandPx) : 236;

      setPcRibbon({
        topPx: topY,
        bottomPx: bottomY,
        coverHeightPx: renderH,
        color: `rgb(${avgR}, ${avgG}, ${avgB})`
      });
    } catch (err) {
      setPcRibbon(null);
    }
  };

  let thickness = null;
  // If we can measure the displayed cover width, compute a pixel thickness for OWC
  const thicknessBaseWidth = thicknessWidth;
  if (thicknessBaseWidth && /OWC|Oxford/i.test(series)) {
    thickness = Math.ceil(thicknessBaseWidth * pagination * OWC_PER_PAGE_REL);
  }
  if (thicknessBaseWidth && /BNC|Barnes/i.test(series)) {
    thickness= Math.ceil(thicknessBaseWidth * pagination * BNC_PER_PAGE_REL);
  }
  if (thicknessBaseWidth && isPCD) {
    thickness = Math.ceil(thicknessBaseWidth * pagination * PCD_PER_PAGE_REL);
  }
  if (thicknessBaseWidth && isPC) {
    thickness = Math.ceil(thicknessBaseWidth * pagination * PC_PER_PAGE_REL);
  }

  const spineText = (book.SpineTitle || book.Title || '').trim();
  const lastName = (book.AlphaAuthor || '').split(',')[0] || '';
  const showAuthorOnSpine = book.Author && book.Author !== 'Unknown' && lastName && !spineText.toLowerCase().includes(lastName.toLowerCase());
  const authorFull = book.Author || book.AlphaAuthor || '';
  const pcdSpineSource = book?.SpineCrop?.src || book?.SpineCrop?.source;
  const hasPcdSpineImage = Boolean(pcdSpineSource);

  useEffect(() => {
    if (!bookRef.current) return;
    const el = bookRef.current;

    const containerAspect = PHYSICAL_SERIES_SIZES.container.height / PHYSICAL_SERIES_SIZES.container.width;

    const measure = () => {
      try {
        const containerEl = el.parentElement; // .book-container
        const outerEl = containerEl?.parentElement; // <a>
        if (!outerEl) return;
        const availableWidth = outerEl.getBoundingClientRect().width || outerEl.offsetWidth || 0;
        if (!availableWidth) return;
        const containerHeight = availableWidth * containerAspect;
        const hPad = Math.round(availableWidth * horizontalPaddingRatio);
        const tPad = Math.round(containerHeight * topPaddingRatio);
        setHorizontalPadding(hPad);
        setTopPadding(tPad);
        setThicknessWidth(availableWidth - 2 * hPad);
      } catch (e) {
        // ignore
      }
    };
    measure();
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      if (ro) ro.disconnect(); else window.removeEventListener('resize', measure);
    };
  }, [seriesId, series, horizontalPaddingRatio, topPaddingRatio]);



  const isAuthorLayout = layout === 'author';
  const isDesktopViewport = typeof window !== 'undefined' && window.innerWidth >= 768;
  const containerPaddingStyle = isDesktopViewport
    ? { paddingRight: `${horizontalPadding * 2}px`, paddingTop: `${topPadding}px` }
    : { paddingLeft: `${horizontalPadding }px`, paddingRight: `${horizontalPadding }px`, paddingTop: `${topPadding}px` };

  return (
    <Col xs={12} lg={3} className={`mb-3 ${colClass || ''} ${isAuthorLayout ? 'author-view-col' : ''}`} style={colStyle}>
      <div className="py-2 h-100 book-tile">
        {book.isAuthorLayout && (
        <div className="book-header-row" style={{ minHeight: 26, marginBottom: 8, fontWeight: 700 }}>
          {header ? header : <span style={{ visibility: 'hidden' }}>placeholder</span>}
        </div>)}
        <div className="book-stage-link">
          <div className="book-container" style={containerPaddingStyle}>
            <div ref={bookRef} className={`book series-${seriesId}`} style={{ transform: `translateZ(-${thickness || 0}px)` }}>
              <div className="book-front" style={{ transform: `translateZ(${(thickness || 0) - 1}px)` }}>
                <img src={book.Image} alt={book.Title} draggable="false" onLoad={(e) => detectPcRibbon(e.currentTarget)} />
              </div>

              {(() => {
                const spineProps = { book, pagination: book?.PAGINATION, thickness, spineText, showAuthorOnSpine, author: authorFull, ribbon: pcRibbon };
                const spineMap = {
                  OWC: SpineOWC,
                  BNC: SpineBNC,
                  PC: SpinePC,
                  PCD: hasPcdSpineImage ? SpinePCD : SpinePC
                };
                const SpineComponent = spineMap[book.SeriesId];
                return SpineComponent ? <SpineComponent {...spineProps} /> : null;
              })()}
            </div>
          </div>
        </div>
        <div className="book-meta book-meta-row mt-5">
          <strong>{book.Title || 'Untitled Book'}</strong>
          <div>{book?.Author || 'Unknown Author'}</div>
          {book.GOODREADS && (
            <a target="_blank" href={book?.GOODREADS} rel="noopener noreferrer">GoodReads</a>
          )}
          {book.Website && (
            <a target="_blank" href={book?.Website} rel="noopener noreferrer">Website</a>
          )}
          {book.PAGINATION && (
            <div>{book.PAGINATION}p</div>
          )}
          {thickness && (
            <div>Thickness: {thickness}px</div>
          )}
        </div>
      </div>
    </Col>
  );
};

export default BookItem;

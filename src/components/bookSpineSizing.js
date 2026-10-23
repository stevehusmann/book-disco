const OWC_PER_PAGE_REL = 0.00049;
const BNC_PER_PAGE_REL = 0.00069;
const PC_PER_PAGE_REL = 0.000497;
const PCD_PER_PAGE_REL = 0.000684;

export const PHYSICAL_SERIES_SIZES = {
  container: { width: 7, height: 9 },
  owc: { width: 5.1875, height: 7.6875 },
  bnc: { width: 5.25, height: 8 },
  pc: { width: 5, height: 7.75 },
  pcd: { width: 5.67, height: 8.35 }
};

export const getBookSpineThickness = ({
  coverWidth,
  pagination,
  series = '',
  seriesId = '',
  thicknessMultiplier = 1
}) => {
  if (!coverWidth) return null;

  const normalizedSeriesId = String(seriesId).toLowerCase();
  const isDeluxe = /Penguin Classics Deluxe/i.test(series) || normalizedSeriesId === 'pcd';
  const isPenguinClassics = normalizedSeriesId === 'pc' || (/Penguin Classics/i.test(series) && !/Deluxe/i.test(series));
  const thicknessPerPage = /OWC|Oxford/i.test(series)
    ? OWC_PER_PAGE_REL
    : /BNC|Barnes/i.test(series)
      ? BNC_PER_PAGE_REL
      : isDeluxe
        ? PCD_PER_PAGE_REL
        : isPenguinClassics
          ? PC_PER_PAGE_REL
          : PC_PER_PAGE_REL;

  return Math.ceil(coverWidth * pagination * thicknessPerPage * thicknessMultiplier);
};

export const getMainBookRenderDimensions = (book, seriesOptions = [], maxBookWidth = 280) => {
  const series = String(book?.SeriesId || book?.Series || '');
  const seriesId = series.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
  const seriesMeta = seriesOptions.find((option) => option.id === (book?.SeriesId || ''));
  const configuredHeightWidthRatio = Number(seriesMeta?.heightWidthRatio);
  const physicalSeriesSize = PHYSICAL_SERIES_SIZES[seriesId]
    || (configuredHeightWidthRatio > 0
      ? { width: 5.25, height: 5.25 * configuredHeightWidthRatio }
      : null);
  const overrideWidth = Number(book?.BookWidth);
  const overrideHeight = Number(book?.BookHeight);
  const physicalBookSize = overrideWidth > 0 && overrideHeight > 0
    ? { width: overrideWidth, height: overrideHeight }
    : physicalSeriesSize;

  const horizontalPaddingRatio = physicalBookSize
    ? (PHYSICAL_SERIES_SIZES.container.width - physicalBookSize.width)
      / PHYSICAL_SERIES_SIZES.container.width / 2
    : 0;
  const bookWidth = seriesId === 'classics'
    ? 190
    : maxBookWidth - 2 * Math.round(maxBookWidth * horizontalPaddingRatio);
  const heightWidthRatio = configuredHeightWidthRatio > 0
    ? configuredHeightWidthRatio
    : seriesId === 'owc'
      ? 7.6875 / 5.1875
      : seriesId === 'bnc'
        ? 8 / 5.25
        : seriesId === 'classics'
          ? 300 / 190
          : 3 / 2;

  return { width: bookWidth, height: bookWidth * heightWidthRatio };
};

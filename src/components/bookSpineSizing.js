const OWC_PER_PAGE_REL = 0.00049;
const BNC_PER_PAGE_REL = 0.00069;
const PC_PER_PAGE_REL = 0.000497;
const PCD_PER_PAGE_REL = 0.000684;

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

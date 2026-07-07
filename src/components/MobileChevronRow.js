import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Row from 'react-bootstrap/Row';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const MobileChevronRow = ({
  children,
  rowClassName = '',
  itemClassName = '',
  ariaLabel = 'Scrollable books row',
  resetKey = ''
}) => {
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [centeredIndex, setCenteredIndex] = useState(0);

  const childArray = useMemo(() => React.Children.toArray(children), [children]);

  const updateArrowState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll('.mobile-chevron-item'));
    if (!items.length) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      setCenteredIndex(0);
      return;
    }

    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const distance = Math.abs(itemCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    setCenteredIndex(bestIndex);
    setCanScrollLeft(bestIndex > 0);
    setCanScrollRight(bestIndex < items.length - 1);
  }, []);

  const getClosestItemIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return 0;
    const items = Array.from(el.querySelectorAll('.mobile-chevron-item'));
    if (!items.length) return 0;

    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const distance = Math.abs(itemCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }, []);

  const scrollToItem = useCallback((targetIndex) => {
    const el = scrollerRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll('.mobile-chevron-item'));
    const item = items[targetIndex];
    if (!item) return;

    const targetLeft = item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, []);

  const handleLeft = useCallback(() => {
    const currentIndex = getClosestItemIndex();
    const nextIndex = clamp(currentIndex - 1, 0, Math.max(0, childArray.length - 1));
    scrollToItem(nextIndex);
  }, [childArray.length, getClosestItemIndex, scrollToItem]);

  const handleRight = useCallback(() => {
    const currentIndex = getClosestItemIndex();
    const nextIndex = clamp(currentIndex + 1, 0, Math.max(0, childArray.length - 1));
    scrollToItem(nextIndex);
  }, [childArray.length, getClosestItemIndex, scrollToItem]);

  useEffect(() => {
    updateArrowState();
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => updateArrowState();
    const onResize = () => updateArrowState();

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [updateArrowState]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const rafId = window.requestAnimationFrame(() => {
      const prevBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = 0;
      el.style.scrollBehavior = prevBehavior;
      updateArrowState();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [resetKey, childArray.length, updateArrowState]);

  return (
    <div className="mobile-chevron-row-wrap" aria-label={ariaLabel}>
      <button
        type="button"
        className={`mobile-chevron mobile-chevron-left ${canScrollLeft ? 'is-visible' : ''}`}
        onClick={handleLeft}
        aria-label="Scroll left"
      >
        &#8249;
      </button>

      <Row ref={scrollerRef} className={`d-flex flex-nowrap mobile-chevron-row ${rowClassName}`.trim()}>
        {childArray.map((child, index) => (
          <div className={`mobile-chevron-item ${index === centeredIndex ? 'is-centered' : ''} ${itemClassName}`.trim()} key={`mobile-item-${index}`}>
            {child}
          </div>
        ))}
      </Row>

      <button
        type="button"
        className={`mobile-chevron mobile-chevron-right ${canScrollRight ? 'is-visible' : ''}`}
        onClick={handleRight}
        aria-label="Scroll right"
      >
        &#8250;
      </button>
    </div>
  );
};

export default MobileChevronRow;
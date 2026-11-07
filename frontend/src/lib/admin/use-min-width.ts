import * as React from 'react';

/** Whether the viewport is at least `width` px wide; admin screens pick between two layouts with it. */
export function useMinWidth(width: number): boolean {
  const [wide, setWide] = React.useState(() => typeof window !== 'undefined' && window.innerWidth >= width);
  React.useEffect(() => {
    const update = () => setWide(window.innerWidth >= width);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [width]);
  return wide;
}

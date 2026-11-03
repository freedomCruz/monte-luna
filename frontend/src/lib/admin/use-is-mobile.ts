import * as React from 'react';

// The admin responsive rules switch to the read-only mobile layout at 390 px.
const MOBILE_MAX_WIDTH = 390;

export const isMobileWidth = () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX_WIDTH;

export function useIsMobile(): boolean {
  const [mobile, setMobile] = React.useState(isMobileWidth);
  React.useEffect(() => {
    const update = () => setMobile(isMobileWidth());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return mobile;
}

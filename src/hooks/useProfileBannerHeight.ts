import { useCallback, useMemo, useState } from 'react';
import { Dimensions, LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { getProfileBannerHeight } from '../utils/profileBanner';

/**
 * Mesure la largeur réelle du slot (onglet / stack) puis calcule une hauteur de bannière stable.
 */
export function useProfileBannerHeight() {
  const { width: ww, height: wh } = useWindowDimensions();
  const [measuredW, setMeasuredW] = useState(0);

  const onBannerParentLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 8) {
      setMeasuredW((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    }
  }, []);

  const effW = measuredW > 16 ? measuredW : ww > 16 ? ww : Dimensions.get('window').width;
  const effH = wh > 16 ? wh : Dimensions.get('window').height;

  const bannerHeight = useMemo(() => Math.round(getProfileBannerHeight(effW, effH) * 0.7), [effW, effH]);

  return { bannerHeight, onBannerParentLayout };
}

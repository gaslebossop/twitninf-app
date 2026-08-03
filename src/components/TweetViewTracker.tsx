import React, { useEffect, useRef, useCallback } from 'react';
import { View, ViewStyle } from 'react-native';
import { useOptimizedViewTracking } from '../hooks/useOptimizedViewTracking';

interface TweetViewTrackerProps {
  tweetId: string;
  children: React.ReactNode;
  style?: ViewStyle;
  threshold?: number; // Percentage of tweet visible (0-1)
  minViewTime?: number; // Minimum time in ms before counting as view
  onViewTracked?: (tweetId: string) => void;
}

export default function TweetViewTracker({
  tweetId,
  children,
  style,
  threshold = 0.5, // 50% of tweet must be visible
  minViewTime = 2000, // 2 seconds minimum
  onViewTracked
}: TweetViewTrackerProps) {
  const viewRef = useRef<View>(null);
  const isVisibleRef = useRef(false);
  const viewStartTimeRef = useRef<number | null>(null);
  const visibilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { trackView } = useOptimizedViewTracking({
    minViewTime,
    debounceMs: 1000,
    batchSize: 10,
    enableBackgroundSync: true
  });

  // Check if tweet is visible in viewport
  const checkVisibility = useCallback(() => {
    if (!viewRef.current) return;

    viewRef.current.measureInWindow((x, y, width, height) => {
      const screenHeight = 800; // Approximate screen height
      const screenWidth = 400; // Approximate screen width
      
      // Calculate visible area
      const visibleTop = Math.max(0, y);
      const visibleBottom = Math.min(screenHeight, y + height);
      const visibleLeft = Math.max(0, x);
      const visibleRight = Math.min(screenWidth, x + width);
      
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const visibleArea = visibleHeight * visibleWidth;
      const totalArea = height * width;
      
      const visibilityRatio = totalArea > 0 ? visibleArea / totalArea : 0;
      const isVisible = visibilityRatio >= threshold;

      if (isVisible && !isVisibleRef.current) {
        // Tweet became visible
        isVisibleRef.current = true;
        viewStartTimeRef.current = Date.now();
        
        // Start timer for minimum view time
        visibilityTimerRef.current = setTimeout(() => {
          trackView(tweetId, true);
          onViewTracked?.(tweetId);
        }, minViewTime);
        
      } else if (!isVisible && isVisibleRef.current) {
        // Tweet became invisible
        isVisibleRef.current = false;
        viewStartTimeRef.current = null;
        
        // Clear timer
        if (visibilityTimerRef.current) {
          clearTimeout(visibilityTimerRef.current);
          visibilityTimerRef.current = null;
        }
      }
    });
  }, [tweetId, threshold, minViewTime, trackView, onViewTracked]);

  // Set up visibility checking
  useEffect(() => {
    const interval = setInterval(checkVisibility, 500); // Check every 500ms
    
    return () => {
      clearInterval(interval);
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current);
      }
    };
  }, [checkVisibility]);

  return (
    <View ref={viewRef} style={style}>
      {children}
    </View>
  );
}

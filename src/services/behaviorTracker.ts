import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';
import { Platform, Dimensions } from 'react-native';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { Accelerometer } from 'expo-sensors';

interface UserAction {
  action_type: string;
  target_id?: string;
  target_type?: string;
  context_data?: any;
  device_info?: any;
  timestamp?: Date;
  client_timestamp?: string; // High precision ISO
}

interface ActivityStats {
  h: number;
  m: number;
  s: number;
  ms: number;
}

class BehaviorTracker {
  private enabled: boolean = true;
  private actionQueue: UserAction[] = [];
  private sessionStartTime: number = 0;
  private currentContent: { id: string; type: string; startTime: number } | null = null;
  private batchSize: number = 15;
  private flushInterval: number = 20000; // 20 secondes
  private maxQueueSize: number = 150;
  
  // V5 advanced features state
  private lastMotionVariance: number = 0;
  private motionSubscription: any = null;
  private lastBatteryLevel: number = -1;

  constructor() {
    this.loadSettings();
    this.startPeriodicFlush();
    this.setupAdvancedSensors();
  }

  /**
   * 🏗️ Initialisation V5 (Anti-Bot Avancé)
   */
  private async setupAdvancedSensors() {
    if (!this.enabled) return;

    // 1. Monitor Battery (Human signal)
    const batteryLevel = await Battery.getBatteryLevelAsync();
    this.lastBatteryLevel = batteryLevel;
    
    // 2. Sample Accelerometer for Hand Tremor
    Accelerometer.setUpdateInterval(500);
    this.motionSubscription = Accelerometer.addListener(data => {
      const variance = Math.abs(data.x) + Math.abs(data.y) + Math.abs(data.z);
      this.lastMotionVariance = variance;
    });

    // 3. Periodic system check
    setInterval(async () => {
      const currentBattery = await Battery.getBatteryLevelAsync();
      if (Math.abs(currentBattery - this.lastBatteryLevel) > 0.01) {
        this.trackAction('system_stats_sync', null, 'app', {
          battery: currentBattery,
          network: (await Network.getNetworkStateAsync()).type,
          variance: this.lastMotionVariance
        });
        this.lastBatteryLevel = currentBattery;
      }
    }, 60000);
  }

  /**
   * 🔧 Configuration
   */
  async loadSettings() {
    try {
      const enabled = await AsyncStorage.getItem('behavior_tracking_enabled');
      this.enabled = enabled !== 'false';
    } catch (e) {}
  }

  /**
   * 📊 Tracking High-Precision
   */
  trackAction(
    actionType: string, 
    targetId?: string | number, 
    targetType?: string, 
    contextData: any = {},
    deviceInfo: any = {}
  ) {
    if (!this.enabled) return;

    const now = new Date();
    const ts = now.toISOString(); // MS precision by default in JS

    // User requested separate h, m, s, ms for IA
    const activityTime: ActivityStats = {
      h: now.getHours(),
      m: now.getMinutes(),
      s: now.getSeconds(),
      ms: now.getMilliseconds()
    };

    const action: UserAction = {
      action_type: actionType,
      target_id: targetId ? targetId.toString() : undefined,
      target_type: targetType,
      context_data: {
        ...contextData,
        ...activityTime,
        app_state: 'foreground',
        screen_res: `${Dimensions.get('window').width}x${Dimensions.get('window').height}`
      },
      device_info: {
        platform: Platform.OS,
        os_version: Platform.Version,
        ...deviceInfo
      },
      timestamp: now,
      client_timestamp: ts
    };

    this.actionQueue.push(action);
    
    // Auto-track hand tremor noise periodically with actions
    if (this.actionQueue.length % 5 === 0) {
        this.actionQueue.push({
            action_type: 'device_motion_noise',
            target_type: 'app',
            context_data: { variance: this.lastMotionVariance, ...activityTime },
            client_timestamp: new Date().toISOString()
        });
    }

    if (this.actionQueue.length >= this.maxQueueSize) this.flushQueue();
  }

  /**
   * 🎯 Advanced anti-bot interactions
   */
  trackTapGesture(duration: number, x?: number, y?: number) {
    this.trackAction('tap_gesture', null, 'interface', {
        duration_ms: duration,
        pos_x: x,
        pos_y: y
    });
  }

  trackKeyboardRhythm(delays: number[]) {
    if (delays.length < 2) return;
    this.trackAction('keyboard_rhythm', null, 'interface', {
        delays,
        entropy: this.calculateEntropy(delays)
    });
  }

  trackScrollJitter(jitter: number) {
      if (jitter > 0) {
          this.trackAction('scroll_jitter', null, 'interface', { jitter });
      }
  }

  private calculateEntropy(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * 🐦 Tweet Tracking (Old API maintained)
   */
  trackTweetView(tweetId: string | number, contextData: any = {}) {
    this.trackAction('tweet_view', tweetId, 'tweet', contextData);
  }

  trackTweetLike(tweetId: string | number, liked: boolean, contextData: any = {}) {
    this.trackAction(liked ? 'tweet_like' : 'tweet_unlike', tweetId, 'tweet', contextData);
  }

  trackTweetRetweet(tweetId: string | number, retweeted: boolean, contextData: any = {}) {
    this.trackAction(retweeted ? 'tweet_retweet' : 'tweet_unretweet', tweetId, 'tweet', contextData);
  }

  trackTweetReply(tweetId: string | number, contextData: any = {}) {
    this.trackAction('tweet_reply', tweetId, 'tweet', contextData);
  }

  trackTweetShare(tweetId: string | number, contextData: any = {}) {
    this.trackAction('tweet_share', tweetId, 'tweet', contextData);
  }

  trackTweetBookmark(tweetId: string | number, bookmarked: boolean, contextData: any = {}) {
    this.trackAction(bookmarked ? 'tweet_bookmark' : 'tweet_unbookmark', tweetId, 'tweet', contextData);
  }

  /**
   * 👤 Profile Tracking
   */
  trackProfileView(userId: string | number, contextData: any = {}) {
    this.trackAction('profile_view', userId, 'user', contextData);
  }

  trackUserFollow(userId: string | number, followed: boolean, contextData: any = {}) {
    this.trackAction(followed ? 'user_follow' : 'user_unfollow', userId, 'user', contextData);
  }

  /**
   * 🔍 Search & Preferences Tracking
   */
  trackSearch(query: string, resultsCount: number, contextData: any = {}) {
    this.trackAction('search', null, 'app', { ...contextData, query, resultsCount });
  }

  trackAlgorithmChange(newValue: any, previousValue: any) {
    this.trackAction('setting_change', 'algorithm', 'preference', { newValue, previousValue });
  }

  trackPreferenceChange(settingType: string, newValue: any, previousValue: any) {
    this.trackAction('setting_change', settingType, 'preference', { newValue, previousValue });
  }

  /**
   * 📊 Network Flush
   */
  async flushQueue() {
    if (this.actionQueue.length === 0 || !this.enabled) return;

    const actionsToSend = this.actionQueue.splice(0, this.batchSize);
    try {
      await apiService.makeRequest('/api/behavior/batch', {
        method: 'POST',
        body: { actions: actionsToSend },
        requiresAuth: true
      });
    } catch (error) {
      this.actionQueue.unshift(...actionsToSend); // Retry later
    }
  }

  private startPeriodicFlush() {
    setInterval(() => this.flushQueue(), this.flushInterval);
  }

  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    await AsyncStorage.setItem('behavior_tracking_enabled', enabled.toString());
  }

  isEnabled() { return this.enabled; }
  getQueueSize() { return this.actionQueue.length; }
  async forceFlush() { await this.flushQueue(); }
  
  async getMyBehaviorStats(days: number = 30) {
    if (!this.enabled) return null;
    const res = await apiService.makeRequest(`/api/behavior/stats?days=${days}`, { method: 'GET', requiresAuth: true });
    return res.success ? res.data : null;
  }

  // Session logic remains consistent
  async startSession() { this.sessionStartTime = Date.now(); }
  async endSession() { this.flushQueue(); }
  startContentEngagement(id: string, type: string) { this.currentContent = { id, type, startTime: Date.now() }; }
  async endContentEngagement(data: any) {
    if (!this.currentContent) return;
    const duration = Date.now() - this.currentContent.startTime;
    await apiService.makeRequest('/api/behavior/engagement', {
        method: 'POST',
        body: { content_id: this.currentContent.id, content_type: this.currentContent.type, time_spent: duration, engagement_data: data },
        requiresAuth: true
    });
    this.currentContent = null;
  }
}

export const behaviorTracker = new BehaviorTracker();
export default behaviorTracker;

import { fonts , colors} from '../theme';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, ScreenSkeleton } from '../components/ui';
import { policierCongoService, PolicierCongoInstruction } from '../services/policierCongoService';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

const { width: screenWidth } = Dimensions.get('window');

const COLORS = {
  primary: '#4F7CFF',
  secondary: '#3354C4',
  accent: '#ff6b6b',
  bgPrimary: '#0B0C0F',
  bgSecondary: '#15171C',
  textPrimary: '#F2F4F7',
  textSecondary: '#cbd5e0',
  textMuted: '#9BA1AC',
  success: '#2BC48A',
  error: '#F4365B',
  warning: '#E0A458',
};

export default function PolicierCongoAdminScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [instructionText, setInstructionText] = useState('');
  const [instructionType, setInstructionType] = useState<'immediate' | 'personality'>('immediate');
  
  const [personalityInstructions, setPersonalityInstructions] = useState<PolicierCongoInstruction[]>([]);
  const [recentOrders, setRecentOrders] = useState<PolicierCongoInstruction[]>([]);
  const [status, setStatus] = useState<any>(null);

  const [memory, setMemory] = useState<any>(null);
  const [v2Memory, setV2Memory] = useState<any>(null);
  const [v2Tab, setV2Tab] = useState<'vector' | 'knowledge'>('vector');
  const [scheduler, setScheduler] = useState<any>(null);
  const [resettingScheduler, setResettingScheduler] = useState(false);
  const [runningAutomation, setRunningAutomation] = useState(false);

  // Valeur calculée pour éviter le drift entre serveur et client
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (scheduler?.minutes_until_run !== undefined) {
      setMinutesRemaining(scheduler.minutes_until_run);
    }
  }, [scheduler]);

  // Décrémenter les minutes localement toutes les 60s pour un affichage dynamique
  useEffect(() => {
    const timer = setInterval(() => {
      setMinutesRemaining(prev => (prev !== null && prev > 0) ? prev - 1 : prev);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const formatNextRun = () => {
    if (!scheduler) return 'Chargement...';
    if (scheduler.is_ready_to_run) return 'Immédiatement';
    if (minutesRemaining === null) return 'Calcul...';
    if (minutesRemaining <= 0) return 'Maintenant';
    
    const h = Math.floor(minutesRemaining / 60);
    const m = minutesRemaining % 60;
    if (h > 0) return `dans ${h}h${m > 0 ? m + 'min' : ''}`;
    return `dans ${m} min`;
  };

  const GREEN_TTL_MS = 3 * 60 * 60 * 1000; // "récents" ~ 1 cycle

  const toTimeAgo = (value: any) => {
    if (!value) return 'date inconnue';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'date inconnue';
    const deltaMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (deltaMin < 1) return 'à l\'instant';
    if (deltaMin < 60) return `il y a ${deltaMin} min`;
    const h = Math.floor(deltaMin / 60);
    if (h < 24) return `il y a ${h}h`;
    const days = Math.floor(h / 24);
    return `il y a ${days}j`;
  };

  const isBigContextRecent = (createdAt: any) => {
    if (!createdAt) return false;
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t <= GREEN_TTL_MS;
  };

  const formatKeywords = (arr: any, limit = 10) => {
    if (!Array.isArray(arr)) return '';
    const sliced = arr.slice(0, limit).filter(Boolean);
    return sliced.join(', ');
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await policierCongoService.getInstructions();
      if (res.success) {
        setPersonalityInstructions(res.instructions.personality);
        setRecentOrders(res.instructions.immediate_orders.slice(-5).reverse());
      }
      
      const statusRes = await policierCongoService.getStatus();
      if (statusRes.success) {
        setStatus(statusRes.memoryStatus);
      }

      const memRes = await policierCongoService.getMemory();
      if (memRes.success) {
        setMemory(memRes.memory);
      }

      const v2Res = await policierCongoService.getV2Memory();
      if (v2Res.success) {
        setV2Memory(v2Res.v2Memory);
      }

      try {
        const schedRes = await policierCongoService.getScheduler();
        if (schedRes.success) setScheduler(schedRes.scheduler);
      } catch (_) {}
    } catch (error) {
      console.error('❌ Erreur chargement PolicierCongo Admin:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSendInstruction = async () => {
    if (!instructionText.trim()) {
      toast.error('Veuillez saisir une instruction.');
      return;
    }

    try {
      setSending(true);
      const res = await policierCongoService.sendInstruction(instructionText, instructionType);
      
      if (res.success) {
        toast.success(res.message);
        setInstructionText('');
        loadData();
      } else {
        toast.error(res.message || 'Échec de l\'envoi');
      }
    } catch (error) {
      toast.error('Erreur lors de la communication avec le serveur');
    } finally {
      setSending(false);
    }
  };

  const handleDeletePersonality = (id: number) => {
    confirmAsync({
      title: 'Confirmer la suppression',
      message: 'Voulez-vous vraiment supprimer cette directive de personnalité ?',
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            try {
              const res = await policierCongoService.deletePersonalityInstruction(id);
              if (res.success) {
                loadData();
              }
            } catch (error) {
              toast.error('Impossible de supprimer');
            }
          })();
    });
  };

  const handleResetScheduler = async () => {
    confirmAsync({
      title: 'Réveiller PolicierCongo',
      message: 'Veux-tu annuler la mise en veille et forcer le bot à se réactiver au prochain cycle ?',
      confirmLabel: 'Réveiller',
    }).then((ok) => {
      if (ok) (async () => {
            try {
              setResettingScheduler(true);
              const res = await policierCongoService.resetScheduler();
              if (res.success) {
                toast.info('✅', {
                  description: res.message,
                });
                loadData();
              }
            } catch (e) {
              toast.error('Impossible de réinitialiser le scheduler');
            } finally {
              setResettingScheduler(false);
            }
          })();
    });
  };

  const handleRunAutomation = async () => {
    confirmAsync({
      title: 'Lancer PolicierCongo',
      message: 'Veux-tu forcer une exécution immédiate de l\'IA ?',
      confirmLabel: 'Lancer',
    }).then((ok) => {
      if (ok) (async () => {
            try {
              setRunningAutomation(true);
              const res = await policierCongoService.runAutomation();
              if (res.success) {
                toast.success('L\'exécution forcée s\'est terminée avec succès.');
                loadData();
              }
            } catch (e) {
              toast.error('Impossible de lancer l\'automatisation');
            } finally {
              setRunningAutomation(false);
            }
          })();
    });
  };

  if (loading && !refreshing) {
    return (
      <ScreenSkeleton variant="list" />
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.bgPrimary, COLORS.bgSecondary]} style={styles.gradient}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>Console PolicierCongo</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {/* Status Overview */}
          <BlurView intensity={20} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="pulse" size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>État du Bot</Text>
            </View>
            <View style={styles.statusGrid}>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Humeur Commu</Text>
                <Text style={styles.statusValue}>{status?.communityMood || 'Neutre'}</Text>
              </View>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Taille Mémoire</Text>
                <Text style={styles.statusValue}>{status?.memorySize || '0'}</Text>
              </View>
            </View>
          </BlurView>

          {/* ⏰ Scheduler Widget */}
          <BlurView intensity={20} style={[styles.card, { borderColor: scheduler?.is_ready_to_run ? 'rgba(67,233,123,0.3)' : 'rgba(255,170,2,0.3)' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={20} color={scheduler?.is_ready_to_run ? COLORS.success : COLORS.warning} />
              <Text style={[styles.cardTitle, { marginLeft: 10 }]}>Planning du Bot</Text>
              <View style={[styles.statsBadge, { backgroundColor: scheduler?.is_ready_to_run ? 'rgba(67,233,123,0.15)' : 'rgba(255,170,2,0.15)', marginLeft: 'auto' }]}>
                <Text style={[styles.statsBadgeText, { color: scheduler?.is_ready_to_run ? COLORS.success : COLORS.warning }]}>
                  {scheduler?.is_ready_to_run ? '🟢 PRÊT' : '😴 EN VEILLE'}
                </Text>
              </View>
            </View>

            <View style={styles.schedulerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusLabel}>Prochain réveil</Text>
                <Text style={[styles.statusValue, { color: (scheduler?.is_ready_to_run || minutesRemaining === 0) ? COLORS.success : COLORS.warning, fontSize: 20 }]}>
                  {formatNextRun()}
                </Text>
                {scheduler?.next_run_time && !scheduler?.is_ready_to_run && (
                  <Text style={[styles.statusLabel, { marginTop: 4 }]}>
                    Prévu : {new Date(scheduler.next_run_time).toLocaleTimeString()}
                  </Text>
                )}
              </View>
              
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity 
                  style={[styles.resetButton, (resettingScheduler || runningAutomation) && { opacity: 0.5 }]}
                  onPress={handleResetScheduler}
                  disabled={resettingScheduler || runningAutomation}
                >
                  <Ionicons name="notifications-off-outline" size={20} color="white" />
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.runButton, (resettingScheduler || runningAutomation) && { opacity: 0.5 }]}
                  onPress={handleRunAutomation}
                  disabled={resettingScheduler || runningAutomation}
                >
                  {runningAutomation ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Ionicons name="play-outline" size={20} color="white" />
                      <Text style={styles.resetButtonText}>Lancer</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>

          {/* Memory DB */}
          <BlurView intensity={25} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="server" size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Mémoire DB (cycles)</Text>
            </View>

            <View style={{ marginBottom: 14 }}>
              <Text style={styles.sectionTitle}>Personnalité</Text>
              <Text style={styles.mutedText}>
                Traits: {memory?.personalityProfile?.traits?.join(', ') || '—'}
              </Text>
              <Text style={styles.mutedText}>
                Ton: {memory?.personalityProfile?.toneKeywords?.join(', ') || '—'}
              </Text>
            </View>

            <View style={{ marginBottom: 14 }}>
              <Text style={styles.sectionTitle}>Big Context (IA “voit ça”)</Text>
              {(memory?.bigContexts || []).slice(0, 15).map((ctx: any, idx: number) => {
                // Recent "cycle" = soit dans la fenêtre temporelle, soit parmi les derniers éléments (bigContexts unshift => index 0 est le plus récent)
                const recent = idx < 3 || isBigContextRecent(ctx?.created_at);
                return (
                  <View
                    key={ctx?.id || String(idx)}
                    style={[
                      styles.bigContextItem,
                      {
                        backgroundColor: recent ? 'rgba(67,233,123,0.12)' : colors.overlaySoft,
                        borderColor: recent ? 'rgba(67,233,123,0.35)' : colors.overlayMedium,
                      },
                    ]}
                  >
                    <View style={styles.bigContextTop}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: recent ? COLORS.success : COLORS.textMuted },
                        ]}
                      />
                      <Text style={styles.bigContextId} numberOfLines={1}>
                        {ctx?.window ? `[${ctx.window}] ` : ''}{ctx?.id || 'bigctx'}
                      </Text>
                      <Text style={styles.bigContextAgo}>{toTimeAgo(ctx?.created_at)}</Text>
                    </View>

                    <Text style={styles.bigContextLine}>Topics: {formatKeywords(ctx?.topics)}</Text>
                    <Text style={styles.bigContextLine}>
                      Sentiment/req: {formatKeywords(ctx?.sentiment_keywords, 6)} | {formatKeywords(ctx?.request_keywords, 6)}
                    </Text>
                    <Text style={styles.bigContextLine}>
                      Stratégie/risque: {formatKeywords(ctx?.strategy_keywords, 6)} | {formatKeywords(ctx?.risk_keywords, 6)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={{ marginBottom: 0 }}>
              <Text style={styles.sectionTitle}>Last Actions</Text>
              {(memory?.lastActions || []).slice(-6).reverse().map((a: any, idx: number) => (
                <View key={`${a?.timestamp || idx}_${idx}`} style={styles.orderItem}>
                  <View style={styles.bigContextTop}>
                    <View style={[styles.statusDot, { backgroundColor: COLORS.textMuted }]} />
                    <Text style={styles.orderText} numberOfLines={1}>
                      {a?.action || a?.type || 'ACTION'}
                    </Text>
                    <Text style={styles.orderDate}>{toTimeAgo(a?.timestamp || a?.created_at || a?.added_at)}</Text>
                  </View>
                  {a?.description ? (
                    <Text style={[styles.orderText, { marginTop: 6, color: colors.textPrimary }]}>
                      {String(a.description).slice(0, 140)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </BlurView>

          {/* V2 Memory Section */}
          <BlurView intensity={35} style={[styles.card, { borderColor: COLORS.primary + '44' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="hardware-chip" size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>V2 Memory Engine (Souverain)</Text>
              <View style={styles.statsBadge}>
                <Text style={styles.statsBadgeText}>{v2Memory?.stats?.total_nodes || 0} nodes</Text>
              </View>
            </View>

            <View style={styles.v2Tabs}>
              <TouchableOpacity 
                style={[styles.v2Tab, v2Tab === 'vector' && styles.v2TabActive]}
                onPress={() => setV2Tab('vector')}
              >
                <Text style={[styles.v2TabText, v2Tab === 'vector' && styles.v2TabTextActive]}>Vectorielle</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.v2Tab, v2Tab === 'knowledge' && styles.v2TabActive]}
                onPress={() => setV2Tab('knowledge')}
              >
                <Text style={[styles.v2TabText, v2Tab === 'knowledge' && styles.v2TabTextActive]}>Connaissances</Text>
              </TouchableOpacity>
            </View>

            {v2Tab === 'vector' ? (
              <View>
                {(v2Memory?.nodes || []).map((node: any, idx: number) => (
                  <View key={node.id || idx} style={styles.v2NodeItem}>
                    <View style={styles.v2NodeHeader}>
                      <Text style={styles.v2NodeRole}>
                        {node.metadata?.role === 'user' ? 'Utilisateur' : 'PolicierCongo'}
                      </Text>
                      <Text style={styles.v2NodeDate}>{toTimeAgo(node.created_at)}</Text>
                    </View>
                    <Text style={styles.v2NodeText} numberOfLines={3}>
                      {node.source_text}
                    </Text>
                    {node.user_id && (
                      <Text style={styles.v2NodeMeta}>User: {node.user_id}</Text>
                    )}
                  </View>
                ))}
                {(!v2Memory?.nodes || v2Memory.nodes.length === 0) && (
                  <Text style={styles.emptyText}>Aucun noeud vectoriel indexé.</Text>
                )}
              </View>
            ) : (
              <View>
                {(v2Memory?.profiles || []).map((prof: any, idx: number) => (
                  <View key={prof.user_id || idx} style={styles.v2KnowledgeItem}>
                    <Text style={styles.v2KnowledgeUser}>
                      {prof.user_id === 'POLICIER_CONGO_ID' ? 'Identité Bot' : `Profil: ${prof.user_id}`}
                    </Text>
                    <View style={styles.v2KnowledgeContent}>
                      {(() => {
                        let parsedProfile = prof.profile || {};
                        if (typeof parsedProfile === 'string') {
                          try { parsedProfile = JSON.parse(parsedProfile); } catch (_) { parsedProfile = { raw: parsedProfile }; }
                        }
                        const entries = Object.entries(parsedProfile);
                        
                        if (entries.length === 0) {
                          return <Text style={styles.v2KnowledgeDate}>Profil en analyse (aucune donnée structurée)</Text>;
                        }

                        return entries.map(([key, value]: [string, any]) => (
                          <View key={key} style={styles.v2KnowledgeRow}>
                            <Text style={styles.v2KnowledgeKey}>{key}:</Text>
                            <Text style={styles.v2KnowledgeValue}>
                              {Array.isArray(value)
                                ? value.join(', ')
                                : typeof value === 'object' && value !== null
                                ? JSON.stringify(value)
                                : String(value)}
                            </Text>
                          </View>
                        ));
                      })()}
                    </View>
                    <Text style={styles.v2KnowledgeDate}>MàJ {toTimeAgo(prof.updated_at)}</Text>
                  </View>
                ))}
                {(!v2Memory?.profiles || v2Memory.profiles.length === 0) && (
                  <Text style={styles.emptyText}>Aucune connaissance longue durée.</Text>
                )}
              </View>
            )}
          </BlurView>

          {/* Instruction Input */}
          <BlurView intensity={30} style={styles.card}>
            <Text style={styles.cardTitle}>Donner un Ordre</Text>
            
            <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeBtn, instructionType === 'immediate' && styles.typeBtnActive]}
                onPress={() => setInstructionType('immediate')}
              >
                <Ionicons name="flash" size={16} color={instructionType === 'immediate' ? 'white' : COLORS.textSecondary} />
                <Text style={[styles.typeText, instructionType === 'immediate' && styles.typeTextActive]}>Instantané</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.typeBtn, instructionType === 'personality' && styles.typeBtnActive]}
                onPress={() => setInstructionType('personality')}
              >
                <Ionicons name="person" size={16} color={instructionType === 'personality' ? 'white' : COLORS.textSecondary} />
                <Text style={[styles.typeText, instructionType === 'personality' && styles.typeTextActive]}>Personnalité</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder={instructionType === 'immediate' ? "Ordre immédiat (ex: Fais un tweet sur...)" : "Règle de personnalité (ex: Sois plus agressif...)"}
              placeholderTextColor={colors.textMuted}
              value={instructionText}
              onChangeText={setInstructionText}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity 
              style={[styles.sendBtn, sending && { opacity: 0.7 }]} 
              onPress={handleSendInstruction}
              disabled={sending}
            >
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.sendBtnGradient}>
                {sending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.sendBtnText}>Lancer l'Ordre</Text>
                    <Ionicons name="send" size={18} color="white" style={{ marginLeft: 8 }} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </BlurView>

          {/* Personality Instructions */}
          {personalityInstructions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Directives de Personnalité</Text>
              {personalityInstructions.map((inst) => (
                <View key={inst.id} style={styles.instructionItem}>
                   <Ionicons name="star" size={14} color={COLORS.warning} />
                   <Text style={styles.instructionText}>{inst.text}</Text>
                   <TouchableOpacity onPress={() => handleDeletePersonality(inst.id)}>
                     <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                   </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Les ordres récents ont été retirés car l'historique est désactivé */}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  gradient: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', fontFamily: fonts.bold, color: 'white' },
  backButton: { padding: 8, backgroundColor: colors.overlayMedium, borderRadius: 12 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', fontFamily: fonts.bold, color: 'white', marginLeft: 10 },
  statusGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statusItem: { flex: 1 },
  statusLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  statusValue: { fontSize: 16, color: 'white', fontWeight: 'bold' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 15,
    color: 'white',
    fontSize: 16,
    textAlignVertical: 'top',
    height: 100,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 15,
    backgroundColor: colors.overlayMedium,
    borderRadius: 12,
    padding: 4,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  typeBtnActive: { backgroundColor: colors.overlayStrong },
  typeText: { fontSize: 14, color: COLORS.textSecondary, marginLeft: 6 },
  typeTextActive: { color: 'white', fontWeight: 'bold' },
  sendBtn: { borderRadius: 16, overflow: 'hidden', elevation: 4 },
  sendBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  sendBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', fontFamily: fonts.bold, color: COLORS.textSecondary, marginBottom: 15, marginLeft: 5 },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlayMedium,
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
  },
  instructionText: { flex: 1, color: 'white', marginHorizontal: 12, fontSize: 15 },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlaySoft,
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 15 },
  orderText: { color: colors.textPrimary, fontSize: 14 },
  orderDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },

  mutedText: { color: COLORS.textSecondary, fontSize: 13, marginTop: 6 },
  bigContextItem: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bigContextTop: { flexDirection: 'row', alignItems: 'center' },
  bigContextId: { flex: 1, color: 'white', fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, marginRight: 8 },
  bigContextAgo: { color: COLORS.textMuted, fontSize: 12 },
  bigContextLine: { color: colors.textPrimary, fontSize: 13, marginTop: 8 },

  // V2 Memory Styles
  v2Tabs: {
    flexDirection: 'row',
    backgroundColor: colors.overlayMedium,
    borderRadius: 12,
    padding: 4,
    marginBottom: 15,
  },
  v2Tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  v2TabActive: {
    backgroundColor: 'rgba(79, 124, 255, 0.14)',
  },
  v2TabText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  v2TabTextActive: {
    color: COLORS.primary,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  statsBadge: {
    backgroundColor: 'rgba(79, 124, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  statsBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  v2NodeItem: {
    backgroundColor: colors.overlaySoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
  },
  v2NodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  v2NodeRole: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  v2NodeDate: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  v2NodeText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  v2NodeMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  v2KnowledgeItem: {
    backgroundColor: colors.overlaySoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  v2KnowledgeUser: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 8,
  },
  v2KnowledgeContent: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 8,
  },
  v2KnowledgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  v2KnowledgeKey: {
    color: COLORS.textMuted,
    fontSize: 11,
    width: 80,
  },
  v2KnowledgeValue: {
    color: 'white',
    fontSize: 11,
    flex: 1,
  },
  v2KnowledgeDate: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'right',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    marginVertical: 20,
  },
  schedulerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resetButton: {
    backgroundColor: colors.overlayMedium,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  resetButtonText: {
    color: 'white',
    fontWeight: '600', fontFamily: fonts.semibold,
    fontSize: 12,
  },
  runButton: {
    backgroundColor: COLORS.success,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  wakeBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginLeft: 12,
  },
  wakeBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  wakeBtnText: {
    color: 'white',
    fontWeight: 'bold', fontFamily: fonts.bold,
    fontSize: 13,
    marginLeft: 4,
  },
});

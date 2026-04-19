import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  fetchTodayPaidOrders,
  OrderDto,
  PaymentMethod,
  voidOrderPayment,
} from '../lib/api';
import { getItem, StorageKeys } from '../lib/storage';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Shift'>;

const ACCENT = '#F5C842';
const DANGER = '#EF4444';

const METHOD_META: Record<
  PaymentMethod,
  { label: string; icon: string; color: string; bg: string }
> = {
  CASH: { label: 'Efectivo', icon: '●', color: '#34D399', bg: '#15291F' },
  CARD: { label: 'Tarjeta', icon: '▮', color: '#60A5FA', bg: '#16222E' },
  TRANSFER: { label: 'Transferencia', icon: '↔', color: '#A78BFA', bg: '#231A2E' },
  COURTESY: { label: 'Cortesía', icon: '♥', color: '#F5C842', bg: '#2A2316' },
  PENDING: { label: 'Pendiente', icon: '…', color: '#888', bg: '#1A1A1A' },
};

function currency(n: number): string {
  return `$${(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ShiftScreen({ navigation }: Props) {
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderDto | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [employeeRole, setEmployeeRole] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Read the logged-in employee's role once so we can gate the void action.
  useEffect(() => {
    getItem(StorageKeys.employee).then((raw) => {
      if (!raw) return;
      try {
        const emp = JSON.parse(raw) as { role?: string };
        if (emp?.role && mountedRef.current) setEmployeeRole(emp.role);
      } catch {
        /* ignore malformed cache */
      }
    });
  }, []);

  const isAdmin = employeeRole === 'ADMIN' || employeeRole === 'SUPER_ADMIN';

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const list = await fetchTodayPaidOrders();
        if (!mountedRef.current) return;
        // Newest first by paidAt (fallback createdAt)
        list.sort((a, b) => {
          const ak = new Date(a.paidAt ?? a.createdAt).getTime();
          const bk = new Date(b.paidAt ?? b.createdAt).getTime();
          return bk - ak;
        });
        setOrders(list);
        setError(null);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg =
          status === 401
            ? 'Sesión expirada — vuelve a ingresar tu PIN.'
            : e?.response?.data?.error ?? e?.message ?? 'Error de red';
        if (mountedRef.current) setError(msg);
      } finally {
        if (mountedRef.current && !opts?.silent) setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load]),
  );

  // ── Aggregated sales summary ───────────────────────────────────────────
  const summary = useMemo(() => {
    const buckets: Record<PaymentMethod, number> = {
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
      COURTESY: 0,
      PENDING: 0,
    };
    let total = 0;
    for (const o of orders ?? []) {
      const amt = o.total ?? 0;
      total += amt;
      const m = (o.paymentMethod ?? 'PENDING') as PaymentMethod;
      buckets[m] += amt;
    }
    return { total, buckets, count: orders?.length ?? 0 };
  }, [orders]);

  // ── Void flow ──────────────────────────────────────────────────────────
  function handleVoid(order: OrderDto) {
    if (!isAdmin) return;
    Alert.alert(
      'Anular cobro',
      `Se revertirá el pago del ticket #${order.orderNumber} (${currency(
        order.total,
      )}). Volverá a aparecer como pendiente en el Dashboard. Esta acción queda registrada en las notas del ticket.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anular pago',
          style: 'destructive',
          onPress: () => void executeVoid(order),
        },
      ],
    );
  }

  async function executeVoid(order: OrderDto) {
    if (voiding) return;
    setVoiding(true);
    try {
      await voidOrderPayment(order.id);
      if (!mountedRef.current) return;
      setSelected(null);
      Alert.alert(
        'Cobro anulado',
        `El ticket #${order.orderNumber} vuelve a estar pendiente.`,
      );
      await load({ silent: true });
    } catch (e: any) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.error;
      const msg =
        status === 403
          ? 'Sólo un administrador puede anular pagos.'
          : status === 400 && serverMsg
            ? serverMsg
            : status === 404
              ? 'La orden ya no existe.'
              : serverMsg ?? e?.message ?? 'Error al anular el pago';
      Alert.alert('Error', msg);
    } finally {
      if (mountedRef.current) setVoiding(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={16}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>‹ Atrás</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerEyebrow}>Corte</Text>
          <Text style={styles.headerTitle}>Resumen de turno</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {orders === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.loadingText}>Cargando turno…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load()}
              tintColor={ACCENT}
            />
          }
        >
          {/* Summary block */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total vendido hoy</Text>
            <Text style={styles.summaryTotal}>{currency(summary.total)}</Text>
            <Text style={styles.summaryMeta}>
              {summary.count} ticket{summary.count === 1 ? '' : 's'} pagado
              {summary.count === 1 ? '' : 's'}
            </Text>
          </View>

          <View style={styles.methodGrid}>
            <MethodTile method="CASH" amount={summary.buckets.CASH} />
            <MethodTile method="CARD" amount={summary.buckets.CARD} />
            <MethodTile method="TRANSFER" amount={summary.buckets.TRANSFER} />
            {summary.buckets.COURTESY > 0 && (
              <MethodTile method="COURTESY" amount={summary.buckets.COURTESY} />
            )}
          </View>

          <Text style={styles.sectionTitle}>
            Tickets pagados {summary.count > 0 ? `(${summary.count})` : ''}
          </Text>

          {orders.length === 0 ? (
            <View style={[styles.center, { paddingVertical: 48 }]}>
              <Text style={styles.emptyTitle}>Sin tickets pagados</Text>
              <Text style={styles.emptyHint}>
                Los cobros del día aparecerán aquí en cuanto se confirmen.
              </Text>
            </View>
          ) : (
            orders.map((o) => (
              <TicketRow
                key={o.id}
                order={o}
                onPress={() => setSelected(o)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Ticket detail modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => !voiding && setSelected(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalNumber}>
                      #{selected.orderNumber}
                    </Text>
                    <Text style={styles.modalSubmeta}>
                      {selected.tableNumber
                        ? `Mesa ${selected.tableNumber}`
                        : selected.orderType}
                      {' · '}
                      {`Pagado ${timeOnly(selected.paidAt ?? selected.createdAt)}`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)} hitSlop={12}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalItems}>
                  {(selected.items ?? []).length === 0 ? (
                    <Text style={styles.modalEmpty}>Sin artículos.</Text>
                  ) : (
                    (selected.items ?? []).map((it) => (
                      <View key={it.id} style={styles.modalItemRow}>
                        <Text style={styles.modalItemQty}>{it.quantity}×</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalItemName}>{it.name}</Text>
                          {!!it.notes && (
                            <Text style={styles.modalItemNotes}>{it.notes}</Text>
                          )}
                        </View>
                        <Text style={styles.modalItemSub}>
                          {currency(it.subtotal)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>

                <View style={styles.modalTotals}>
                  <View style={styles.modalTotalRow}>
                    <Text style={styles.modalTotalLabel}>Método</Text>
                    <Text style={styles.modalTotalValue}>
                      {METHOD_META[
                        (selected.paymentMethod ?? 'PENDING') as PaymentMethod
                      ].label}
                    </Text>
                  </View>
                  <View style={styles.modalTotalRow}>
                    <Text style={styles.modalTotalLabelBold}>Total</Text>
                    <Text style={styles.modalTotalValueBold}>
                      {currency(selected.total)}
                    </Text>
                  </View>
                </View>

                {isAdmin ? (
                  <TouchableOpacity
                    style={[styles.voidBtn, voiding && { opacity: 0.6 }]}
                    onPress={() => handleVoid(selected)}
                    disabled={voiding}
                    activeOpacity={0.85}
                  >
                    {voiding ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.voidBtnText}>Anular pago</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.nonAdminHint}>
                    Sólo un administrador puede anular este cobro.
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function MethodTile({
  method,
  amount,
}: {
  method: PaymentMethod;
  amount: number;
}) {
  const meta = METHOD_META[method];
  return (
    <View style={[styles.methodTile, { borderColor: meta.bg }]}>
      <View style={styles.methodHeader}>
        <View style={[styles.methodIcon, { backgroundColor: meta.bg }]}>
          <Text style={[styles.methodIconText, { color: meta.color }]}>
            {meta.icon}
          </Text>
        </View>
        <Text style={styles.methodLabel}>{meta.label}</Text>
      </View>
      <Text style={styles.methodAmount}>{currency(amount)}</Text>
    </View>
  );
}

function TicketRow({
  order,
  onPress,
}: {
  order: OrderDto;
  onPress: () => void;
}) {
  const meta = METHOD_META[(order.paymentMethod ?? 'PENDING') as PaymentMethod];
  return (
    <TouchableOpacity
      style={styles.ticketRow}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.ticketNumber}>#{order.orderNumber}</Text>
        <Text style={styles.ticketMeta}>
          {order.tableNumber ? `Mesa ${order.tableNumber}` : order.orderType}
          {' · '}
          {timeOnly(order.paidAt ?? order.createdAt)}
        </Text>
      </View>
      <View style={[styles.methodBadge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.methodBadgeText, { color: meta.color }]}>
          {meta.label}
        </Text>
      </View>
      <Text style={styles.ticketTotal}>{currency(order.total)}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 80, paddingVertical: 6 },
  backBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  headerTitleBlock: { flex: 1, alignItems: 'center' },
  headerEyebrow: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },

  errorBanner: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: '#2A1616',
    borderWidth: 1,
    borderColor: '#5A1F1F',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },

  listContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
  },

  // Summary
  summaryCard: {
    backgroundColor: '#141414',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 22,
    marginBottom: 14,
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  summaryTotal: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  summaryMeta: { color: '#AAA', fontSize: 13, marginTop: 4 },

  // Method tiles
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  methodTile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 140,
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  methodIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconText: { fontSize: 15, fontWeight: '800' },
  methodLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  methodAmount: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },

  sectionTitle: {
    color: '#666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyHint: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Ticket row
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 12,
  },
  ticketNumber: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  ticketMeta: { color: '#888', fontSize: 12 },
  ticketTotal: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 72,
    textAlign: 'right',
  },

  methodBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalNumber: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  modalSubmeta: { color: '#888', fontSize: 13, marginTop: 2 },
  modalClose: { color: '#888', fontSize: 20, paddingLeft: 12 },

  modalItems: {
    maxHeight: 260,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    marginBottom: 10,
  },
  modalEmpty: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 14,
  },

  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  modalItemQty: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 32,
  },
  modalItemName: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  modalItemNotes: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  },
  modalItemSub: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },

  modalTotals: {
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingTop: 10,
    marginBottom: 14,
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  modalTotalLabel: { color: '#888', fontSize: 13 },
  modalTotalValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  modalTotalLabelBold: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  modalTotalValueBold: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  voidBtn: {
    backgroundColor: DANGER,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  voidBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nonAdminHint: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
});

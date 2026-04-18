import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  confirmCashPayment,
  fetchActiveOrders,
  OrderDto,
  OrderItemDto,
  OrderStatus,
} from '../lib/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TableDetail'>;

const ACCENT = '#F5C842';
const ERROR = '#EF4444';

const STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: 'Pendiente', color: '#F5C842', bg: '#2A2316' },
  CONFIRMED: { label: 'Confirmado', color: '#F5C842', bg: '#2A2316' },
  PREPARING: { label: 'Preparando', color: '#60A5FA', bg: '#16222E' },
  READY: { label: 'Listo', color: '#34D399', bg: '#15291F' },
  DELIVERED: { label: 'Entregado', color: '#888', bg: '#1A1A1A' },
  CANCELLED: { label: 'Cancelado', color: '#EF4444', bg: '#2A1616' },
};

function currency(n: number): string {
  return `$${(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function relativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60}m`;
}

export default function TableDetailScreen({ route, navigation }: Props) {
  const { tableNumber } = route.params;

  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const all = await fetchActiveOrders();
        if (!mountedRef.current) return;
        setOrders(all.filter((o) => o.tableNumber === tableNumber));
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
    [tableNumber],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const list = orders ?? [];
    return {
      subtotal: list.reduce((s, o) => s + (o.subtotal ?? 0), 0),
      discount: list.reduce((s, o) => s + (o.discount ?? 0), 0),
      total: list.reduce((s, o) => s + (o.total ?? 0), 0),
      itemCount: list.reduce(
        (s, o) => s + (o.items?.reduce((n, it) => n + it.quantity, 0) ?? 0),
        0,
      ),
    };
  }, [orders]);

  function handleBack() {
    navigation.goBack();
  }

  function handleCobrar() {
    if (!orders || orders.length === 0 || paying) return;
    Alert.alert(
      `Cobrar mesa ${tableNumber}`,
      `Se marcarán como PAGADAS ${orders.length} comanda(s) por ${currency(
        totals.total,
      )}. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cobrar',
          style: 'default',
          onPress: () => void cobrar(),
        },
      ],
    );
  }

  async function cobrar() {
    if (!orders || orders.length === 0) return;
    setPaying(true);
    try {
      // Sequential to keep error handling simple and avoid hammering the API.
      for (const o of orders) {
        await confirmCashPayment(o.id);
      }
      if (!mountedRef.current) return;
      Alert.alert('Cobro exitoso', `Mesa ${tableNumber} cerrada.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ?? e?.message ?? 'Error al procesar el cobro';
      if (mountedRef.current) {
        Alert.alert(
          'Error en cobro',
          `${msg}\n\nAlgunas comandas pueden haber quedado sin cobrar. Regresa al dashboard y reintenta.`,
        );
        // Refresh to show current state.
        void load();
      }
    } finally {
      if (mountedRef.current) setPaying(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={16} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Atrás</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerEyebrow}>Mesa</Text>
          <Text style={styles.headerTitle}>Mesa {tableNumber}</Text>
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
          <Text style={styles.loadingText}>Cargando comandas…</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Sin comandas activas</Text>
          <Text style={styles.emptyHint}>
            Esta mesa no tiene tickets abiertos en este momento.
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={() => void load()}>
            <Text style={styles.refreshButtonText}>Refrescar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
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
            {orders.map((o) => (
              <TicketCard key={o.id} order={o} />
            ))}
          </ScrollView>

          {/* Sticky bottom bar with totals + Cobrar button */}
          <View style={styles.footer}>
            <View style={styles.footerTotals}>
              <Text style={styles.footerItems}>
                {totals.itemCount} artículo{totals.itemCount === 1 ? '' : 's'}
                {' · '}
                {orders.length} comanda{orders.length === 1 ? '' : 's'}
              </Text>
              <Text style={styles.footerTotal}>{currency(totals.total)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.cobrarBtn, paying && styles.cobrarBtnDisabled]}
              onPress={handleCobrar}
              disabled={paying}
              activeOpacity={0.85}
            >
              {paying ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.cobrarBtnText}>Cobrar {currency(totals.total)}</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TicketCard({ order }: { order: OrderDto }) {
  const meta = STATUS_META[order.status];
  return (
    <View style={styles.ticket}>
      <View style={styles.ticketHeader}>
        <View>
          <Text style={styles.ticketNumber}>#{order.orderNumber}</Text>
          <Text style={styles.ticketMeta}>
            {order.customerName ?? 'Sin cliente'} · {relativeTime(order.createdAt)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.itemsBlock}>
        {(order.items ?? []).length === 0 ? (
          <Text style={styles.emptyItems}>Sin artículos cargados.</Text>
        ) : (
          (order.items ?? []).map((it) => <ItemRow key={it.id} item={it} />)
        )}
      </View>

      <View style={styles.ticketTotals}>
        {!!order.discount && order.discount > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Descuento</Text>
            <Text style={styles.totalValueSubtle}>-{currency(order.discount)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabelBold}>Total</Text>
          <Text style={styles.totalValueBold}>{currency(order.total)}</Text>
        </View>
      </View>
    </View>
  );
}

function ItemRow({ item }: { item: OrderItemDto }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemQty}>{item.quantity}×</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        {!!item.notes && <Text style={styles.itemNotes}>{item.notes}</Text>}
      </View>
      <Text style={styles.itemSubtotal}>{currency(item.subtotal)}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },

  // Header
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

  // Banner
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

  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },

  // Empty
  emptyTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptyHint: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  refreshButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  // List
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },

  // Ticket card
  ticket: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  ticketNumber: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  ticketMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },

  itemsBlock: {
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingTop: 10,
  },
  emptyItems: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 10,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  itemQty: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 32,
  },
  itemName: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  itemNotes: { color: '#888', fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  itemSubtotal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },

  ticketTotals: {
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingTop: 10,
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalLabel: { color: '#888', fontSize: 13 },
  totalValueSubtle: { color: '#AAA', fontSize: 13 },
  totalLabelBold: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  totalValueBold: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },

  // Badge
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    backgroundColor: '#0F0F0F',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 32,
  },
  footerTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerItems: { color: '#888', fontSize: 13 },
  footerTotal: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },

  cobrarBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },
  cobrarBtnDisabled: { opacity: 0.6 },
  cobrarBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

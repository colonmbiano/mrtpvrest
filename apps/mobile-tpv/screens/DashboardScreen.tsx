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

import { fetchActiveOrders, OrderDto, OrderStatus } from '../lib/api';
import { clearEmployeeSession, getItem, StorageKeys } from '../lib/storage';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const POLL_MS = 15_000;
const ACCENT = '#F5C842';

/** Aggregated view of a single table’s active tickets. */
interface TableGroup {
  tableNumber: number;
  orders: OrderDto[];
  total: number;
  oldestCreatedAt: string;
  anyStatus: OrderStatus; // worst/most-urgent status to badge the card
}

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

/** Prioritise the most kitchen-urgent status when aggregating per table. */
function rankStatus(s: OrderStatus): number {
  switch (s) {
    case 'READY':
      return 4;
    case 'PREPARING':
      return 3;
    case 'CONFIRMED':
      return 2;
    case 'PENDING':
      return 1;
    default:
      return 0;
  }
}

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

export default function DashboardScreen({ navigation }: Props) {
  const [employeeName, setEmployeeName] = useState<string>('Empleado');
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid stale setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load cached employee record to greet the user.
  useEffect(() => {
    getItem(StorageKeys.employee).then((raw) => {
      if (!raw) return;
      try {
        const emp = JSON.parse(raw) as { name?: string };
        if (emp?.name && mountedRef.current) setEmployeeName(emp.name);
      } catch {
        /* ignore malformed cache */
      }
    });
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const list = await fetchActiveOrders();
        if (!mountedRef.current) return;
        setOrders(list);
        setError(null);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg =
          status === 401
            ? 'Sesión expirada — cierra turno y vuelve a ingresar tu PIN.'
            : e?.response?.data?.error ?? e?.message ?? 'Error de red';
        if (mountedRef.current) setError(msg);
      } finally {
        if (mountedRef.current && !opts?.silent) setRefreshing(false);
      }
    },
    [],
  );

  // Initial fetch + polling loop.
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // ── Derived state ──────────────────────────────────────────────────────
  const { tableGroups, nonTableOrders } = useMemo(() => {
    const groups = new Map<number, TableGroup>();
    const loose: OrderDto[] = [];
    for (const o of orders ?? []) {
      if (o.tableNumber == null) {
        loose.push(o);
        continue;
      }
      const existing = groups.get(o.tableNumber);
      if (existing) {
        existing.orders.push(o);
        existing.total += o.total;
        if (new Date(o.createdAt) < new Date(existing.oldestCreatedAt)) {
          existing.oldestCreatedAt = o.createdAt;
        }
        if (rankStatus(o.status) > rankStatus(existing.anyStatus)) {
          existing.anyStatus = o.status;
        }
      } else {
        groups.set(o.tableNumber, {
          tableNumber: o.tableNumber,
          orders: [o],
          total: o.total,
          oldestCreatedAt: o.createdAt,
          anyStatus: o.status,
        });
      }
    }
    const tableGroups = Array.from(groups.values()).sort(
      (a, b) => a.tableNumber - b.tableNumber,
    );
    const nonTableOrders = loose.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return { tableGroups, nonTableOrders };
  }, [orders]);

  async function handleEndShift() {
    Alert.alert('Cerrar turno', `¿Cerrar turno de ${employeeName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar turno',
        style: 'destructive',
        onPress: async () => {
          await clearEmployeeSession();
          navigation.replace('Pin');
        },
      },
    ]);
  }

  function handleTablePress(group: TableGroup) {
    // Real detail screen comes in the next cycle. For now, summarise.
    const lines = group.orders
      .map(
        (o) =>
          `#${o.orderNumber} · ${STATUS_META[o.status].label} · ${currency(o.total)}`,
      )
      .join('\n');
    Alert.alert(
      `Mesa ${group.tableNumber}`,
      `${group.orders.length} ticket(s) · Total ${currency(group.total)}\n\n${lines}`,
    );
  }

  function handleLooseOrderPress(o: OrderDto) {
    Alert.alert(
      `Pedido #${o.orderNumber}`,
      `${o.orderType} · ${STATUS_META[o.status].label}\n${o.customerName ?? 'Sin cliente'} · ${currency(
        o.total,
      )}`,
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {employeeName}</Text>
          <Text style={styles.title}>Mesas activas</Text>
        </View>
        <TouchableOpacity
          onPress={handleEndShift}
          hitSlop={12}
          style={styles.endShiftBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.endShiftText}>Cerrar turno</Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Body */}
      {orders === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.loadingText}>Cargando mesas…</Text>
        </View>
      ) : tableGroups.length === 0 && nonTableOrders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🍽</Text>
          <Text style={styles.emptyTitle}>Sin mesas activas</Text>
          <Text style={styles.emptyHint}>
            Cuando se abra un ticket aparecerá aquí automáticamente.
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void load()}
          >
            <Text style={styles.refreshButtonText}>Refrescar</Text>
          </TouchableOpacity>
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
          {tableGroups.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Mesas</Text>
              <View style={styles.grid}>
                {tableGroups.map((g) => (
                  <TableCard
                    key={g.tableNumber}
                    group={g}
                    onPress={() => handleTablePress(g)}
                  />
                ))}
              </View>
            </>
          )}

          {nonTableOrders.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Para llevar / Delivery</Text>
              {nonTableOrders.map((o) => (
                <LooseOrderRow
                  key={o.id}
                  order={o}
                  onPress={() => handleLooseOrderPress(o)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Components ───────────────────────────────────────────────────────────

function TableCard({
  group,
  onPress,
}: {
  group: TableGroup;
  onPress: () => void;
}) {
  const meta = STATUS_META[group.anyStatus];
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTable}>Mesa {group.tableNumber}</Text>
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <Text style={styles.cardTotal}>{currency(group.total)}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>
          {group.orders.length} ticket{group.orders.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.cardMeta}>Abierta {relativeTime(group.oldestCreatedAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function LooseOrderRow({
  order,
  onPress,
}: {
  order: OrderDto;
  onPress: () => void;
}) {
  const meta = STATUS_META[order.status];
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          #{order.orderNumber} · {order.orderType}
        </Text>
        <Text style={styles.rowMeta}>
          {order.customerName ?? 'Sin cliente'} · {relativeTime(order.createdAt)}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
      <Text style={styles.rowTotal}>{currency(order.total)}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingTop: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  greeting: { color: '#888', fontSize: 14, marginBottom: 4 },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  endShiftBtn: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  endShiftText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Error banner
  errorBanner: {
    marginHorizontal: 32,
    marginBottom: 16,
    backgroundColor: '#2A1616',
    borderWidth: 1,
    borderColor: '#5A1F1F',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },

  // Empty state
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyHint: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
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

  // Loading
  loadingText: { color: '#888', fontSize: 14, marginTop: 14 },

  // List
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 8,
  },

  // Grid of table cards
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 200,
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 20,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTable: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  cardTotal: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardMeta: {
    color: '#888',
    fontSize: 12,
  },

  // Loose order row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 10,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowMeta: {
    color: '#888',
    fontSize: 12,
  },
  rowTotal: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 6,
  },

  // Status badge
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
});

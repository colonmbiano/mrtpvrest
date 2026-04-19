import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  addItemsToOrder,
  CategoryDto,
  createTpvOrder,
  CreateTpvOrderItem,
  CreateTpvOrderPayload,
  effectivePrice,
  fetchMenuCategories,
  fetchMenuItems,
  hasModifiers,
  MenuItemComplementDto,
  MenuItemDto,
  MenuItemVariantDto,
  OrderType,
} from '../lib/api';
import type { RootStackParamList } from '../navigation/types';
import ItemModifierModal, {
  ModifierPreload,
  ModifierSelection,
} from '../components/ItemModifierModal';

type Props = NativeStackScreenProps<RootStackParamList, 'NewOrder'>;

const ACCENT = '#F5C842';

/**
 * One line in the in-memory cart.
 *
 * `unitPrice` is captured when the line is created and stays stable even
 * if the upstream menu price changes mid-ticket. `variant`, `complements`
 * and `manualNote` are kept both for display and as part of the merge key.
 * `notes` is the rendered summary ("Grande, + Extra queso · Nota: ...").
 */
interface CartLine {
  menuItem: MenuItemDto;
  variant: MenuItemVariantDto | null;
  complements: MenuItemComplementDto[];
  quantity: number;
  unitPrice: number;
  notes: string;
  manualNote: string;
}

function currency(n: number): string {
  return `$${(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Normalise a free-form note for use as a merge key. Whitespace is
 * collapsed and the text is lowercased so "Bien cocida" and " bien  cocida "
 * merge, but "Bien cocida" and "Término medio" stay as separate lines.
 */
function normalizeNoteKey(note: string): string {
  return note.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Stable signature used to decide whether two cart lines represent the
 * exact same customised item and can be merged by incrementing qty.
 * Two burgers with different modifiers OR different manual notes MUST
 * stay as separate lines.
 */
function lineSignature(
  menuItemId: string,
  variant: MenuItemVariantDto | null,
  complements: MenuItemComplementDto[],
  manualNote: string,
): string {
  const variantKey = variant?.id ?? '∅';
  const complementKey = [...complements.map((c) => c.id)].sort().join('|');
  const noteKey = normalizeNoteKey(manualNote);
  return `${menuItemId}::${variantKey}::${complementKey}::${noteKey}`;
}

export default function NewOrderScreen({ navigation, route }: Props) {
  // When `orderId` is passed, the screen is in "round mode": items are
  // appended to an existing open ticket via POST /api/orders/:id/items.
  // No tableNumber prompt, no order-type toggle — the parent order owns
  // those attributes.
  const roundOrderId = route.params?.orderId ?? null;
  const isRoundMode = !!roundOrderId;

  // Responsive: side-by-side on landscape tablet, stacked otherwise.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && width >= 720;

  // Menu data
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [items, setItems] = useState<MenuItemDto[] | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Cart state
  const [cart, setCart] = useState<CartLine[]>([]);

  /**
   * Discriminated state for the modifier modal so we can tell "Adding a
   * fresh line" apart from "Editing an existing line at index N". In edit
   * mode the modal receives a preload and the confirm handler either
   * replaces the line or merges it with another existing match.
   */
  type ModalState =
    | { kind: 'add'; item: MenuItemDto }
    | { kind: 'edit'; item: MenuItemDto; lineIdx: number; preload: ModifierPreload };
  const [modalState, setModalState] = useState<ModalState | null>(null);

  // Submit modal state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [tableInput, setTableInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load menu on mount.
  const loadMenu = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cats, prods] = await Promise.all([
        fetchMenuCategories(),
        fetchMenuItems(),
      ]);
      if (!mountedRef.current) return;
      setCategories(cats);
      setItems(prods);
      setSelectedCategoryId((prev) => prev ?? cats[0]?.id ?? null);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        status === 401
          ? 'Sesión expirada — vuelve a ingresar tu PIN.'
          : e?.response?.data?.error ?? e?.message ?? 'Error cargando menú';
      if (mountedRef.current) setLoadError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  // ── Derived ────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!items || !selectedCategoryId) return items ?? [];
    return items.filter((it) => it.categoryId === selectedCategoryId);
  }, [items, selectedCategoryId]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
    return { subtotal, total: subtotal, itemCount }; // no discount for MVP
  }, [cart]);

  // ── Cart ops ───────────────────────────────────────────────────────────
  /**
   * Tap handler from the product grid. If the item has any variant or
   * complement configured, defer to the modal in "add" mode. Otherwise
   * add immediately with no modifiers.
   */
  function onProductTap(m: MenuItemDto) {
    if (hasModifiers(m)) {
      setModalState({ kind: 'add', item: m });
      return;
    }
    addCustomisedToCart({
      menuItem: m,
      variant: null,
      complements: [],
      quantity: 1,
      unitPrice: effectivePrice(m),
      notes: '',
      manualNote: '',
    });
  }

  /**
   * Tap-to-edit from the cart pane. Opens the modifier modal preloaded
   * with the current line's state. Works even for items originally added
   * without modifiers — the modal will just show the note input.
   */
  function handleEditLine(idx: number) {
    setCart((prevCart) => {
      const line = prevCart[idx];
      if (!line) return prevCart;
      setModalState({
        kind: 'edit',
        item: line.menuItem,
        lineIdx: idx,
        preload: {
          variantId: line.variant?.id ?? null,
          complementIds: line.complements.map((c) => c.id),
          quantity: line.quantity,
          manualNote: line.manualNote,
        },
      });
      return prevCart;
    });
  }

  /**
   * Merge-or-append a (possibly customised) line into the cart.
   * Two lines merge iff their signature (menuItemId + variantId +
   * sorted complementIds + normalised manualNote) matches exactly;
   * otherwise a new line is pushed.
   */
  function addCustomisedToCart(line: CartLine) {
    setCart((prev) => {
      const sig = lineSignature(
        line.menuItem.id,
        line.variant,
        line.complements,
        line.manualNote,
      );
      const idx = prev.findIndex(
        (l) =>
          lineSignature(l.menuItem.id, l.variant, l.complements, l.manualNote) ===
          sig,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + line.quantity,
        };
        return next;
      }
      return [...prev, line];
    });
  }

  /**
   * Replace `cart[editingIdx]` with `line`, and — if the new line's
   * signature collides with another existing line — merge the two into
   * a single row. Preserves the position of the kept line to minimise
   * UI jank.
   */
  function replaceOrMergeEditedLine(editingIdx: number, line: CartLine) {
    setCart((prev) => {
      const newSig = lineSignature(
        line.menuItem.id,
        line.variant,
        line.complements,
        line.manualNote,
      );
      const collisionIdx = prev.findIndex(
        (l, i) =>
          i !== editingIdx &&
          lineSignature(
            l.menuItem.id,
            l.variant,
            l.complements,
            l.manualNote,
          ) === newSig,
      );

      if (collisionIdx === -1) {
        // No merge: just replace the edited line in place.
        const next = [...prev];
        next[editingIdx] = line;
        return next;
      }

      // Merge: quantities add, the edited line is removed, the
      // collision line keeps its position.
      const merged: CartLine = {
        ...prev[collisionIdx],
        quantity: prev[collisionIdx].quantity + line.quantity,
      };
      return prev
        .map((l, i) => (i === collisionIdx ? merged : l))
        .filter((_, i) => i !== editingIdx);
    });
  }

  function handleModifierConfirm(selection: ModifierSelection) {
    if (!modalState) return;
    const line: CartLine = {
      menuItem: modalState.item,
      variant: selection.variant,
      complements: selection.complements,
      quantity: selection.quantity,
      unitPrice: selection.unitPrice,
      notes: selection.notes,
      manualNote: selection.manualNote,
    };

    if (modalState.kind === 'edit') {
      replaceOrMergeEditedLine(modalState.lineIdx, line);
    } else {
      addCustomisedToCart(line);
    }
    setModalState(null);
  }

  function updateQuantity(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev];
      const line = next[idx];
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...line, quantity: nextQty };
      }
      return next;
    });
  }

  function clearCart() {
    setCart([]);
  }

  /** Shared mapping from the local cart to the wire payload. */
  function buildPayloadItems(): CreateTpvOrderItem[] {
    return cart.map((l) => ({
      menuItemId: l.menuItem.id,
      quantity: l.quantity,
      // Backend stores `notes` verbatim on OrderItem for the kitchen
      // ticket — we encode variant + complements + manualNote here
      // because variantId / modifier IDs are silently dropped by both
      // POST /api/orders/tpv and POST /api/orders/:id/items.
      notes: l.notes.length > 0 ? l.notes : null,
    }));
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  function handleOpenSubmit() {
    if (cart.length === 0) return;

    // Round mode skips the table/type modal — the parent order owns those.
    if (isRoundMode) {
      void submitRound();
      return;
    }

    setTableInput('');
    setOrderType('DINE_IN');
    setSubmitModalOpen(true);
  }

  /** Create a brand-new ticket (POST /api/orders/tpv). */
  async function handleConfirmSubmit() {
    if (submitting) return;

    const parsedTable = Number.parseInt(tableInput, 10);
    if (orderType === 'DINE_IN') {
      if (!tableInput.trim() || Number.isNaN(parsedTable) || parsedTable <= 0) {
        Alert.alert('Mesa requerida', 'Ingresa un número de mesa válido.');
        return;
      }
    }

    const payload: CreateTpvOrderPayload = {
      items: buildPayloadItems(),
      orderType,
      tableNumber: orderType === 'DINE_IN' ? parsedTable : null,
      paymentMethod: 'PENDING', // paid later via confirm-cash
      subtotal: totals.subtotal,
      discount: 0,
      total: totals.total,
      status: 'PREPARING',
    };

    setSubmitting(true);
    try {
      const created = await createTpvOrder(payload);
      if (!mountedRef.current) return;
      setSubmitModalOpen(false);
      clearCart();
      Alert.alert(
        'Comanda enviada',
        `Ticket #${created.orderNumber} creado${
          created.tableNumber ? ` para mesa ${created.tableNumber}` : ''
        }.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ?? e?.message ?? 'Error al enviar comanda';
      Alert.alert('Error', msg);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  /** Append items to an existing ticket (POST /api/orders/:id/items). */
  async function submitRound() {
    if (submitting || !roundOrderId) return;

    setSubmitting(true);
    try {
      const updated = await addItemsToOrder(roundOrderId, buildPayloadItems());
      if (!mountedRef.current) return;
      clearCart();
      Alert.alert(
        'Ronda enviada',
        `${totals.itemCount} artículo${
          totals.itemCount === 1 ? '' : 's'
        } agregado${totals.itemCount === 1 ? '' : 's'} al ticket #${updated.orderNumber}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.error;
      const msg =
        status === 400 && serverMsg
          ? serverMsg
          : status === 404
            ? 'La comanda ya no existe o fue cerrada.'
            : serverMsg ?? e?.message ?? 'Error al enviar la ronda';
      Alert.alert('Error', msg);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <StatusBar style="light" />
        <ActivityIndicator color={ACCENT} size="large" />
        <Text style={styles.loadingText}>Cargando menú…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, styles.center]}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>No se pudo cargar el menú</Text>
        <Text style={styles.errorMessage}>{loadError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void loadMenu()}>
          <Text style={styles.retryBtnText}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.retryBtn, { marginTop: 10, backgroundColor: 'transparent' }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.retryBtnText, { color: '#888' }]}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const menuPane = (
    <MenuPane
      categories={categories ?? []}
      items={filteredItems}
      selectedCategoryId={selectedCategoryId}
      onSelectCategory={setSelectedCategoryId}
      onAddToCart={onProductTap}
      onBack={() => navigation.goBack()}
      title={isRoundMode ? 'Agregar ronda' : 'Nueva venta'}
    />
  );

  const cartPane = (
    <CartPane
      cart={cart}
      totals={totals}
      onInc={(idx) => updateQuantity(idx, +1)}
      onDec={(idx) => updateQuantity(idx, -1)}
      onEdit={handleEditLine}
      onClear={clearCart}
      onSubmit={handleOpenSubmit}
      submitLabel={isRoundMode ? 'Enviar ronda a cocina' : 'Enviar a cocina'}
      submitting={submitting && isRoundMode}
    />
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {isLandscape ? (
        <View style={styles.twoPane}>
          <View style={styles.menuPaneWrap}>{menuPane}</View>
          <View style={styles.cartPaneWrap}>{cartPane}</View>
        </View>
      ) : (
        // Portrait fallback: menu on top, compact cart below.
        <View style={styles.singlePane}>
          <View style={{ flex: 3 }}>{menuPane}</View>
          <View style={{ flex: 2, borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
            {cartPane}
          </View>
        </View>
      )}

      {/* Modifier picker (variant + complements + manual note).
          Reused for both "add" (from menu) and "edit" (from cart tap). */}
      <ItemModifierModal
        item={modalState?.item ?? null}
        visible={!!modalState}
        mode={modalState?.kind === 'edit' ? 'edit' : 'add'}
        preload={modalState?.kind === 'edit' ? modalState.preload : null}
        onClose={() => setModalState(null)}
        onConfirm={handleModifierConfirm}
      />

      {/* Submit modal */}
      <Modal
        visible={submitModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !submitting && setSubmitModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enviar comanda</Text>
            <Text style={styles.modalSubtitle}>
              {totals.itemCount} artículo{totals.itemCount === 1 ? '' : 's'} ·{' '}
              {currency(totals.total)}
            </Text>

            <Text style={styles.modalLabel}>Tipo</Text>
            <View style={styles.typeToggle}>
              {(['DINE_IN', 'TAKEOUT'] as OrderType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, orderType === t && styles.typeBtnActive]}
                  onPress={() => setOrderType(t)}
                  disabled={submitting}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      orderType === t && styles.typeBtnTextActive,
                    ]}
                  >
                    {t === 'DINE_IN' ? 'Mesa' : 'Para llevar'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {orderType === 'DINE_IN' && (
              <>
                <Text style={styles.modalLabel}>Número de mesa</Text>
                <TextInput
                  style={styles.modalInput}
                  value={tableInput}
                  onChangeText={setTableInput}
                  placeholder="Ej. 5"
                  placeholderTextColor="#555"
                  keyboardType="number-pad"
                  maxLength={4}
                  editable={!submitting}
                  autoFocus
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSubmitModalOpen(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, submitting && { opacity: 0.6 }]}
                onPress={() => void handleConfirmSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.modalConfirmText}>Enviar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function MenuPane({
  categories,
  items,
  selectedCategoryId,
  onSelectCategory,
  onAddToCart,
  onBack,
  title,
}: {
  categories: CategoryDto[];
  items: MenuItemDto[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onAddToCart: (m: MenuItemDto) => void;
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.paneHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={14}>
          <Text style={styles.paneBackText}>‹ Atrás</Text>
        </TouchableOpacity>
        <Text style={styles.paneTitle}>{title}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {categories.map((c) => {
          const active = c.id === selectedCategoryId;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelectCategory(c.id)}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {c.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {items.length === 0 ? (
        <View style={[styles.center, { flex: 1 }]}>
          <Text style={styles.emptyText}>Sin productos en esta categoría.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.gridContent}>
          <View style={styles.grid}>
            {items.map((m) => (
              <ProductCard key={m.id} item={m} onPress={() => onAddToCart(m)} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function ProductCard({
  item,
  onPress,
}: {
  item: MenuItemDto;
  onPress: () => void;
}) {
  const price = effectivePrice(item);
  return (
    <TouchableOpacity style={styles.product} onPress={onPress} activeOpacity={0.85}>
      <View style={{ flex: 1 }}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.isPromo && (
          <View style={styles.promoTag}>
            <Text style={styles.promoTagText}>PROMO</Text>
          </View>
        )}
      </View>
      <Text style={styles.productPrice}>{currency(price)}</Text>
    </TouchableOpacity>
  );
}

function CartPane({
  cart,
  totals,
  onInc,
  onDec,
  onEdit,
  onClear,
  onSubmit,
  submitLabel,
  submitting,
}: {
  cart: CartLine[];
  totals: { subtotal: number; total: number; itemCount: number };
  onInc: (idx: number) => void;
  onDec: (idx: number) => void;
  onEdit: (idx: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <View style={styles.cartPane}>
      <View style={styles.cartHeader}>
        <Text style={styles.cartTitle}>Ticket</Text>
        {cart.length > 0 && (
          <TouchableOpacity onPress={onClear} hitSlop={10}>
            <Text style={styles.cartClear}>Vaciar</Text>
          </TouchableOpacity>
        )}
      </View>

      {cart.length === 0 ? (
        <View style={[styles.center, { flex: 1, paddingHorizontal: 16 }]}>
          <Text style={styles.emptyCartTitle}>Sin artículos</Text>
          <Text style={styles.emptyCartHint}>
            Toca un producto del menú para comenzar.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
          {cart.map((line, idx) => (
            <TouchableOpacity
              key={`${line.menuItem.id}-${idx}`}
              style={styles.cartLine}
              onPress={() => onEdit(idx)}
              activeOpacity={0.7}
              accessibilityLabel={`Editar ${line.menuItem.name}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cartLineName} numberOfLines={2}>
                  {line.menuItem.name}
                </Text>
                {!!line.notes && (
                  <Text style={styles.cartLineModifiers} numberOfLines={3}>
                    {line.notes}
                  </Text>
                )}
                <Text style={styles.cartLineMeta}>
                  {currency(line.unitPrice)} c/u · toca para editar
                </Text>
              </View>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => onDec(idx)}
                  hitSlop={6}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{line.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => onInc(idx)}
                  hitSlop={6}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cartLineSubtotal}>
                {currency(line.unitPrice * line.quantity)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.cartFooter}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{currency(totals.subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabelBold}>Total</Text>
          <Text style={styles.totalValueBold}>{currency(totals.total)}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (cart.length === 0 || submitting) && styles.submitBtnDisabled,
          ]}
          onPress={onSubmit}
          disabled={cart.length === 0 || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitBtnText}>
              {submitLabel}
              {totals.itemCount > 0 ? ` · ${totals.itemCount}` : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#888', fontSize: 14, marginTop: 14 },

  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },

  // Layout
  twoPane: { flex: 1, flexDirection: 'row' },
  menuPaneWrap: { flex: 1.4, borderRightWidth: 1, borderRightColor: '#1A1A1A' },
  cartPaneWrap: { flex: 1, minWidth: 320 },
  singlePane: { flex: 1 },

  // Pane header
  paneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  paneBackText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500', width: 60 },
  paneTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },

  // Chips
  chipsRow: { paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: '#141414',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#000' },

  // Product grid
  gridContent: { paddingHorizontal: 16, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  product: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 160,
    minHeight: 110,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 16,
    justifyContent: 'space-between',
  },
  productName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  productPrice: {
    color: ACCENT,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  promoTag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#2A2316',
  },
  promoTagText: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  emptyText: { color: '#666', fontSize: 14 },

  // Cart pane
  cartPane: { flex: 1, backgroundColor: '#0D0D0D' },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  cartTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  cartClear: { color: '#888', fontSize: 13, fontWeight: '500' },

  emptyCartTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyCartHint: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },

  cartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#171717',
    gap: 12,
  },
  cartLineName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  cartLineModifiers: {
    color: '#888',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 2,
  },
  cartLineMeta: { color: '#888', fontSize: 11 },
  cartLineSubtotal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 70,
    textAlign: 'right',
  },

  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },
  qtyValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },

  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    backgroundColor: '#0F0F0F',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalLabel: { color: '#888', fontSize: 13 },
  totalValue: { color: '#CCC', fontSize: 13 },
  totalLabelBold: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  totalValueBold: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  submitBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#141414',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 24,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: { color: '#888', fontSize: 14, marginBottom: 20 },
  modalLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  typeToggle: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  typeBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  typeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  typeBtnTextActive: { color: '#000' },

  modalInput: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  modalCancelText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#000', fontSize: 15, fontWeight: '700' },
});

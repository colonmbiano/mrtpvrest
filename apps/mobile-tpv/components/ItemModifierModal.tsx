import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  buildModifierNotes,
  computeUnitPrice,
  MenuItemComplementDto,
  MenuItemDto,
  MenuItemVariantDto,
} from '../lib/api';

const ACCENT = '#F5C842';

export interface ModifierSelection {
  variant: MenuItemVariantDto | null;
  complements: MenuItemComplementDto[];
  quantity: number;
  unitPrice: number;
  /** Human-readable summary: variant + complements + manualNote joined. */
  notes: string;
  /** Raw free-form text typed by the operator ("Bien cocida", etc.). */
  manualNote: string;
}

/**
 * State the modal should start from when opened to EDIT an existing
 * cart line. When absent the modal opens in "add" mode with defaults.
 */
export interface ModifierPreload {
  variantId: string | null;
  complementIds: string[];
  quantity: number;
  manualNote: string;
}

interface Props {
  /** Item being customised; when null, the modal is inert. */
  item: MenuItemDto | null;
  visible: boolean;
  /** Optional starting state (edit mode). When null, fresh defaults are used. */
  preload?: ModifierPreload | null;
  /** Controls CTA label and tone; defaults to "add". */
  mode?: 'add' | 'edit';
  onClose: () => void;
  /** Fired with the final selection when the user taps "Agregar" / "Guardar". */
  onConfirm: (selection: ModifierSelection) => void;
}

function currency(n: number): string {
  return `$${(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Centered modal for picking one variant (radio) and any number of
 * complements (checkboxes) for a menu item, plus a quantity stepper and
 * a live-updating "Agregar al ticket por $X" action.
 *
 * State is initialised/reset each time `item` changes — opening the modal
 * for a different product starts fresh. If an item has variants, the first
 * available one is pre-selected (matches how apps/tpv pre-selects sizes).
 */
export default function ItemModifierModal({
  item,
  visible,
  preload,
  mode = 'add',
  onClose,
  onConfirm,
}: Props) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [complementIds, setComplementIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [manualNote, setManualNote] = useState('');

  const availableVariants = useMemo(
    () => (item?.variants ?? []).filter((v) => v.isAvailable !== false),
    [item],
  );
  const availableComplements = useMemo(
    () => (item?.complements ?? []).filter((c) => c.isAvailable !== false),
    [item],
  );

  /**
   * Initialise state every time a fresh "open" happens. We key the reset
   * on (item, visible) because the parent may reuse the same `item` for
   * both an edit and a subsequent add — toggling `visible` re-seeds.
   */
  useEffect(() => {
    if (!item || !visible) return;
    if (preload) {
      setVariantId(preload.variantId);
      setComplementIds([...preload.complementIds]);
      setQuantity(Math.max(1, preload.quantity));
      setManualNote(preload.manualNote ?? '');
    } else {
      setVariantId(availableVariants[0]?.id ?? null);
      setComplementIds([]);
      setQuantity(1);
      setManualNote('');
    }
    // We deliberately read `preload` only at open time; further changes are
    // the user's edits in this modal instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, visible]);

  const selectedVariant = useMemo<MenuItemVariantDto | null>(() => {
    if (!variantId) return null;
    return availableVariants.find((v) => v.id === variantId) ?? null;
  }, [variantId, availableVariants]);

  const selectedComplements = useMemo<MenuItemComplementDto[]>(() => {
    const set = new Set(complementIds);
    return availableComplements.filter((c) => set.has(c.id));
  }, [complementIds, availableComplements]);

  const unitPrice = useMemo(() => {
    if (!item) return 0;
    return computeUnitPrice(item, selectedVariant, selectedComplements);
  }, [item, selectedVariant, selectedComplements]);

  const total = unitPrice * quantity;

  function toggleComplement(id: string) {
    setComplementIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function changeQty(delta: number) {
    setQuantity((q) => Math.max(1, q + delta));
  }

  /**
   * Build the human-readable summary used both as the cart-line subtitle
   * and as the OrderItem.notes sent to the backend. Manual note gets its
   * own segment so the kitchen sees it as a distinct instruction.
   */
  function buildFinalNotes(): string {
    const structured = buildModifierNotes(selectedVariant, selectedComplements);
    const trimmed = manualNote.trim();
    if (structured && trimmed) return `${structured} · Nota: ${trimmed}`;
    if (structured) return structured;
    if (trimmed) return `Nota: ${trimmed}`;
    return '';
  }

  function handleConfirm() {
    if (!item) return;
    onConfirm({
      variant: selectedVariant,
      complements: selectedComplements,
      quantity,
      unitPrice,
      notes: buildFinalNotes(),
      manualNote: manualNote.trim(),
    });
  }

  const ctaLabel = mode === 'edit' ? 'Guardar cambios' : 'Agregar al ticket';

  return (
    <Modal
      visible={visible && !!item}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {item && (
            <>
              {/* Header */}
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {!!item.description && (
                    <Text style={styles.description} numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.body}
                contentContainerStyle={{ paddingVertical: 10 }}
              >
                {/* Variants */}
                {availableVariants.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Tamaño / Variante</Text>
                    {availableVariants.map((v) => {
                      const active = v.id === variantId;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.row, active && styles.rowActive]}
                          onPress={() => setVariantId(v.id)}
                          activeOpacity={0.85}
                        >
                          <View style={[styles.radio, active && styles.radioActive]}>
                            {active && <View style={styles.radioDot} />}
                          </View>
                          <Text style={styles.rowLabel}>{v.name}</Text>
                          <Text style={styles.rowPrice}>{currency(v.price)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* Complements */}
                {availableComplements.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
                      Complementos
                    </Text>
                    {availableComplements.map((c) => {
                      const active = complementIds.includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.row, active && styles.rowActive]}
                          onPress={() => toggleComplement(c.id)}
                          activeOpacity={0.85}
                        >
                          <View
                            style={[styles.checkbox, active && styles.checkboxActive]}
                          >
                            {active && <Text style={styles.checkboxTick}>✓</Text>}
                          </View>
                          <Text style={styles.rowLabel}>{c.name}</Text>
                          <Text style={styles.rowPrice}>
                            {c.price > 0 ? `+ ${currency(c.price)}` : 'Gratis'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {availableVariants.length === 0 &&
                  availableComplements.length === 0 && (
                    <Text style={styles.emptyText}>
                      Este producto no tiene opciones configuradas.
                    </Text>
                  )}

                {/* Manual free-form note */}
                <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
                  Notas para cocina
                </Text>
                <TextInput
                  style={styles.noteInput}
                  value={manualNote}
                  onChangeText={setManualNote}
                  placeholder="Notas especiales (ej. Alergia, término de la carne...)"
                  placeholderTextColor="#555"
                  multiline
                  numberOfLines={2}
                  maxLength={140}
                  returnKeyType="done"
                  blurOnSubmit
                />
              </ScrollView>

              {/* Quantity */}
              <View style={styles.qtyBar}>
                <Text style={styles.qtyLabel}>Cantidad</Text>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => changeQty(-1)}
                    hitSlop={6}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => changeQty(+1)}
                    hitSlop={6}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm */}
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>
                  {ctaLabel} · {currency(total)}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 22,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  description: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  closeBtn: {
    color: '#888',
    fontSize: 22,
    paddingLeft: 12,
    paddingTop: 2,
  },

  body: {
    maxHeight: 380,
  },

  sectionLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: 6,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  rowActive: {
    borderColor: ACCENT,
    backgroundColor: '#2A2316',
  },
  rowLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowPrice: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: '600',
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: ACCENT },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  checkboxTick: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    marginTop: -2,
  },

  emptyText: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24,
  },

  noteInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
  },

  qtyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    marginTop: 4,
  },
  qtyLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  qtyValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },

  confirmBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

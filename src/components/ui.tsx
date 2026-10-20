// Core UI primitives for the Lit Fits editorial system.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image as RNImage, Pressable, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { motion, radius, space, type as T, useTheme, type TypeVariant } from '@/theme';
import { Icon, type IconName } from './icons';

// ───────────── Text ─────────────
export function Txt({ v = 'body', color, style, children, ...rest }: TextProps & { v?: TypeVariant; color?: string; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return (
    <Text {...rest} style={[T[v], { color: color ?? c.ink }, style]}>
      {children}
    </Text>
  );
}

export const Label = (p: TextProps & { color?: string; style?: StyleProp<TextStyle> }) => {
  const { c } = useTheme();
  return <Txt v="label" color={p.color ?? c.muted} {...p} />;
};

// ───────────── Press with scale ─────────────
export function Press({ children, style, scaleTo = 0.97, onPress, onLongPress, hapticOn = 'tick', disabled, ...rest }:
  PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOn?: 'tick' | 'light' | 'medium' | null }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const outer: ViewStyle = {};
  for (const k of ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'position', 'top', 'left', 'right', 'bottom', 'zIndex'] as const) {
    if (flat[k] !== undefined) (outer as any)[k] = flat[k];
  }
  if (typeof flat.width === 'string') (outer as any).width = flat.width;
  const inner: ViewStyle = { ...flat };
  for (const k of Object.keys(outer)) delete (inner as any)[k];
  if (outer.flex !== undefined || outer.flexGrow !== undefined) (inner as any).width = '100%';
  return (
    <Pressable
      style={outer}
      {...rest}
      // Never hand `disabled` to the native view: on Android's new architecture a Pressable that flips from
      // disabled to enabled can stay unresponsive. Disabled is enforced here instead.
      accessibilityState={{ ...(rest.accessibilityState ?? {}), disabled: !!disabled }}
      onPressIn={(e) => { if (!disabled) s.value = withSpring(scaleTo, motion.springSnappy); rest.onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1, motion.springSnappy); rest.onPressOut?.(e); }}
      onPress={(e) => { if (disabled) return; try { if (hapticOn) haptic[hapticOn](); } catch { /* never block the action */ } onPress?.(e); }}
      onLongPress={onLongPress ? (e) => { if (disabled) return; try { haptic.medium(); } catch { /* ignore */ } onLongPress(e); } : undefined}
    >
      <Animated.View style={[inner, a, disabled && { opacity: 0.4 }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ───────────── Buttons ─────────────
type BtnKind = 'primary' | 'secondary' | 'ghost' | 'signal' | 'danger';
export function Button({ label, onPress, kind = 'primary', icon, loading, disabled, style, small, full, onLongPress, fg: fgOverride }: {
  label: string; onPress?: () => void; kind?: BtnKind; icon?: IconName; loading?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; small?: boolean; full?: boolean; onLongPress?: () => void; fg?: string;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.ink : kind === 'signal' ? c.signal : kind === 'danger' ? c.danger : 'transparent';
  const fg = fgOverride ?? (kind === 'primary' ? c.bg : kind === 'signal' ? c.signalInk : kind === 'danger' ? '#fff' : c.ink);
  const border = kind === 'secondary' ? fgOverride ?? c.ink : 'transparent';
  return (
    <Press
      onPress={loading || disabled ? undefined : onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hapticOn={kind === 'signal' ? 'medium' : 'light'}
      style={[
        {
          height: small ? 36 : 50, paddingHorizontal: small ? 14 : 20, backgroundColor: bg, borderWidth: 1, borderColor: border,
          borderRadius: radius.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        },
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Txt v="label" color={fg} style={{ fontSize: small ? 10.5 : 11.5, letterSpacing: 1.1 }}>{label}</Txt>
    </Press>
  );
}

export function IconButton({ name, onPress, size = 40, iconSize = 22, color, bg, style, onLongPress, accessibilityLabel, badge }: {
  name: IconName; onPress?: () => void; size?: number; iconSize?: number; color?: string; bg?: string; style?: StyleProp<ViewStyle>;
  onLongPress?: () => void; accessibilityLabel?: string; badge?: number;
}) {
  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityLabel={accessibilityLabel} accessibilityRole="button" scaleTo={0.9}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: radius.xs }, style]}>
      <Icon name={name} size={iconSize} color={color} />
      {!!badge && <Badge n={badge} />}
    </Press>
  );
}

function Badge({ n }: { n: number }) {
  const { c } = useTheme();
  return (
    <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, paddingHorizontal: 3, backgroundColor: c.signal, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="label" color={c.signalInk} style={{ fontSize: 9, lineHeight: 11 }}>{n}</Txt>
    </View>
  );
}

// ───────────── Chips ─────────────
export function Chip({ label, active, onPress, onLongPress, icon, swatch, small, count, style, tone }: {
  label: string; active?: boolean; onPress?: () => void; onLongPress?: () => void; icon?: IconName; swatch?: string; small?: boolean;
  count?: number; style?: StyleProp<ViewStyle>; tone?: 'signal';
}) {
  const { c } = useTheme();
  const fg = active ? (tone === 'signal' ? c.signalInk : c.bg) : c.ink;
  return (
    <Press onPress={onPress} onLongPress={onLongPress} scaleTo={0.94}
      style={[{
        height: small ? 28 : 34, paddingHorizontal: small ? 10 : 13, borderWidth: 1,
        borderColor: active ? (tone === 'signal' ? c.signal : c.ink) : c.lineStrong,
        backgroundColor: active ? (tone === 'signal' ? c.signal : c.ink) : 'transparent',
        flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill,
      }, style]}>
      {swatch && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: swatch, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong }} />}
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Txt v="label" color={fg} style={{ fontSize: small ? 9.5 : 10.5 }}>{label}</Txt>
      {count != null && <Txt v="label" color={active ? fg : c.muted} style={{ fontSize: 9.5 }}>{count}</Txt>}
    </Press>
  );
}

// ───────────── Layout ─────────────
export function Screen({ children, style, edges = ['top'], grain = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; edges?: ('top' | 'bottom')[]; grain?: boolean }) {
  const { c } = useTheme();
  const ins = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, backgroundColor: c.bg, paddingTop: edges.includes('top') ? ins.top : 0, paddingBottom: edges.includes('bottom') ? ins.bottom : 0 }, style]}>
      {children}
      {grain && <Grain />}
    </View>
  );
}

export function Grain({ opacity }: { opacity?: number }) {
  const { c } = useTheme();
  return (
    <RNImage
      source={require('@/../assets/images/grain.png')}
      resizeMode="repeat"
      style={[StyleSheet.absoluteFill, { opacity: opacity ?? c.grainOpacity, width: '100%', height: '100%' }]}
      pointerEvents="none"
    />
  );
}

export function Header({ title, kicker, right, left, compact }: { title: string; kicker?: string; right?: ReactNode; left?: ReactNode; compact?: boolean }) {
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: compact ? space.sm : space.md, paddingBottom: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{left}{kicker ? <Label>{kicker}</Label> : null}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{right}</View>
      </View>
      <Txt v={compact ? 'displaySm' : 'display'} numberOfLines={1} adjustsFontSizeToFit>{title}</Txt>
    </View>
  );
}

export function TopBar({ left, center, right, transparent }: { left?: ReactNode; center?: ReactNode; right?: ReactNode; transparent?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, backgroundColor: transparent ? 'transparent' : c.bg }}>
      <View style={{ minWidth: 44, flexDirection: 'row' }}>{left}</View>
      <View style={{ flex: 1, alignItems: 'center' }}>{center}</View>
      <View style={{ minWidth: 44, flexDirection: 'row', justifyContent: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.lineStrong, marginHorizontal: inset }, style]} />;
}

export function Section({ title, right, children, style }: { title: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.xl }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, marginBottom: space.md }}>
        <Label>{title}</Label>
        {right}
      </View>
      {children}
    </View>
  );
}

// ───────────── Inputs ─────────────
export function Field({ label, hint, ai, style, ref, ...rest }: TextInputProps & { label?: string; hint?: string; ai?: boolean; ref?: React.Ref<any> }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Label>{label}</Label>
          {ai ? <AiMark /> : null}
        </View>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.faint}
        selectionColor={c.signal}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        {...rest}
        style={[T.body, { color: c.ink, borderBottomWidth: 1, borderBottomColor: focus ? c.ink : c.lineStrong, paddingVertical: 10, minHeight: 44 }, style]}
      />
      {hint ? <Txt v="small" color={c.muted}>{hint}</Txt> : null}
    </View>
  );
}

export function AiMark() {
  const { c } = useTheme();
  return (
    <View style={{ paddingHorizontal: 4, height: 14, borderWidth: 1, borderColor: c.signal, justifyContent: 'center' }}>
      <Txt v="label" color={c.signal} style={{ fontSize: 8, lineHeight: 10 }}>AI</Txt>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, style }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', borderWidth: 1, borderColor: c.ink, borderRadius: radius.xs }, style]}>
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => { haptic.tick(); onChange(o.key); }}
            style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent', borderLeftWidth: i ? 1 : 0, borderLeftColor: c.ink }}>
            <Txt v="label" color={on ? c.bg : c.ink}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const { c } = useTheme();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => { x.value = withSpring(value ? 1 : 0, motion.springSnappy); }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 18 }] }));
  return (
    <Pressable onPress={() => { haptic.tick(); onChange(!value); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="bodyMedium">{label}</Txt>
        {hint ? <Txt v="small" color={c.muted}>{hint}</Txt> : null}
      </View>
      <View style={{ width: 42, height: 24, borderWidth: 1, borderColor: c.ink, backgroundColor: value ? c.ink : 'transparent', padding: 2 }}>
        <Animated.View style={[{ width: 18, height: 18, backgroundColor: value ? c.bg : c.ink }, knob]} />
      </View>
    </Pressable>
  );
}

/** 1–5 scale as square pips (warmth / formality). Tappable when onChange is provided. */
export function Pips({ value, onChange, max = 5, size = 10, label }: { value: number | null | undefined; onChange?: (v: number) => void; max?: number; size?: number; label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }} accessibilityLabel={label}>
      {Array.from({ length: max }).map((_, i) => (
        <Pressable key={i} disabled={!onChange} hitSlop={6} onPress={() => { haptic.tick(); onChange?.(i + 1); }}>
          <View style={{ width: onChange ? size + 14 : size, height: size, backgroundColor: (value ?? 0) > i ? c.ink : 'transparent', borderWidth: 1, borderColor: (value ?? 0) > i ? c.ink : c.lineStrong }} />
        </Pressable>
      ))}
    </View>
  );
}

// ───────────── Feedback ─────────────
export function Shimmer({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const o = useSharedValue(0.35);
  useEffect(() => { o.value = withRepeat(withSequence(withTiming(0.8, { duration: 700 }), withTiming(0.35, { duration: 700 })), -1); }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: c.surfaceAlt }, style, a]} />;
}

function Dot({ i, color }: { i: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1); }, [t]);
  const a = useAnimatedStyle(() => {
    const p = (t.value + i * 0.18) % 1;
    return { opacity: p < 0.5 ? 0.25 + p * 1.5 : 1 - (p - 0.5) * 1.5, transform: [{ translateY: p < 0.5 ? -p * 4 : -(1 - p) * 4 }] };
  });
  return <Animated.View style={[{ width: 5, height: 5, backgroundColor: color }, a]} />;
}

export function Thinking({ label, color }: { label: string; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[0, 1, 2].map((i) => <Dot key={i} i={i} color={color ?? c.signal} />)}
      </View>
      <Label color={color ?? c.muted}>{label}</Label>
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'flex-start', paddingHorizontal: space.lg, paddingVertical: space.xxxl, gap: space.md }}>
      <Txt v="editorial">{title}</Txt>
      {body ? <Txt v="body" color={c.muted} style={{ maxWidth: 320 }}>{body}</Txt> : null}
      {action}
    </View>
  );
}

export function Swatch({ hex, size = 14, selected, onPress, label }: { hex: string; size?: number; selected?: boolean; onPress?: () => void; label?: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityLabel={label} hitSlop={4}>
      <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? c.ink : 'transparent', borderRadius: (size + 8) / 2 }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hex, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong }} />
      </View>
    </Pressable>
  );
}

export function Spec({ label, children, ai }: { label: string; children: ReactNode; ai?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, gap: 12 }}>
      <View style={{ width: 96, flexDirection: 'row', gap: 5, alignItems: 'center' }}>
        <Label>{label}</Label>
        {ai ? <AiMark /> : null}
      </View>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Txt v="small">{children}</Txt> : children}</View>
    </View>
  );
}

export { Animated };

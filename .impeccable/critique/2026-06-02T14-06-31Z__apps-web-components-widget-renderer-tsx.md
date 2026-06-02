---
score: 14
p0: 0
p1: 2
p2: 0
timestamp: 2026-06-02T14-06-31Z
slug: apps-web-components-widget-renderer-tsx
---
# OBS Widget Output UX Critique

## Component Quality (3/5)
The OBS widget rendering layer (`WidgetRenderer.tsx`) is functioning properly but contains hardcoded styling that drifts from the core brutalist design system:
- **Rounded Corners**: Hardcoded `rounded` and `rounded-md` classes exist in `AlertWidget`, `GoalWidget`, `EventListWidget`, and `ChatWidget` (empty state). These violate the strict `rounded-none` constraint.
- **Brand Colors**: The `AlertWidget` and `GoalWidget` hardcode `bg-emerald-400` as the accent color instead of utilizing the `bg-primary` (acid yellow) brand token.

## Typography (3/5)
While the chat widget typography is user-configurable (which is correct), the base built-in widgets suffer from timid typography:
- Sub-headers in `AlertWidget` and `EventListWidget` use generic `text-sm text-white/60` and `font-medium` instead of the hardened `font-black uppercase tracking-widest`.
- The `ChatWidget` empty state uses `font-medium` instead of the brutalist label typography.

## Information Architecture (5/5)
The widget architecture correctly isolates configurable settings from the output view. Transparent backgrounds for OBS rendering are handled correctly.

## Micro-interactions (N/A)
As this is a static, read-only broadcast output, interactive states (hover/active) are intentionally absent, which is correct. Progress bars and text updates flow cleanly.

## Overall Verdict
**14/20 (Needs Polish)**
The dashboard has been heavily brutalized, but the actual OBS widgets still reflect the old "generic SaaS" look. 
Next steps: Adapt the `WidgetRenderer` to strip out all rounded corners, harden the typography, and replace `emerald-400` with the `primary` token for consistency.

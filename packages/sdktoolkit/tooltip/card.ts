import { escapeHtml } from '../dom';
import type { ThemeColors } from './theme';

// tooltip/card — pure builder for the step tooltip's markup (the <style> + card
// HTML). ALL tooltip styling lives here: card layout, progress segments, the
// Back / Next / Dismiss / Don't-show buttons, and the mobile bottom-sheet rules.
// It returns a string; the player wires up events and positioning.

export const TOOLTIP_WIDTH = 320;
export const TOOLTIP_HEIGHT = 200;

export interface TooltipCardOptions {
  colors: ThemeColors;
  theme?: string;
  width?: number;
  top: number;
  left: number;
  curStep: number;
  totStep: number;
  title: string;
  content: string;
  strings: any;
  isFirst: boolean;
  isLast: boolean;
}

export function buildTooltipCard(o: TooltipCardOptions): string {
  const { colors, theme, top, left, curStep, totStep, title, content, strings, isFirst, isLast } = o;
  const width = o.width ?? TOOLTIP_WIDTH;

  // Segmented progress bar from the "cur / tot" step counts.
  const segHtml = Array.from({ length: Math.min(totStep, 12) }, (_, i) =>
    `<span class="aitour-seg ${i < curStep ? 'aitour-seg-on' : ''}"></span>`).join('');

  return `
<style>
  .aitour-card {
    width: min(${width}px, calc(100vw - 24px));
    background: ${colors.themeBg};
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
    border: 1px solid ${colors.themeBorder};
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    position: fixed;
    top: ${top}px;
    left: ${left}px;
    z-index: 2147483647;
    pointer-events: all;
    animation: fadein 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes fadein {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .aitour-body     { padding: 18px 18px 14px; }
  .aitour-progress-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .aitour-segs     { display: flex; gap: 4px; flex-wrap: wrap; }
  .aitour-seg      { width: 16px; height: 4px; border-radius: 99px; background: ${colors.themeBorder}; transition: background 0.2s; }
  .aitour-seg-on   { background: ${colors.themeAccent}; }
  .aitour-step     { font-size: 11.5px; color: ${colors.themeMuted}; white-space: nowrap; }
  .aitour-title    { margin: 0 0 6px 0; font-size: 16px; font-weight: 600; color: ${colors.themeText}; }
  .aitour-content  { margin: 0 0 4px 0; font-size: 14px; color: ${colors.themeMuted}; line-height: 1.6; }
  .aitour-controls { display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px; }
  .aitour-nav-stack { display: flex; flex-direction: row; align-items: center; gap: 6px; }
  .aitour-nav-stack .btn { font-size: 11px; padding: 4px 9px; border-radius: 6px; }
  .aitour-dismiss-group { display: flex; flex-direction: row; align-items: center; gap: 2px; }
  .aitour-dismiss-group .btn { font-size: 11.5px; padding: 4px 6px; font-weight: 500; }
  .aitour-dontshow-btn[aria-pressed="true"] { color: ${colors.themeAccent}; }
  .btn             { padding: 8px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.15s; line-height: 1; white-space: nowrap; }
  .btn-ghost       { background: transparent; color: ${colors.themeMuted}; padding-left: 0; }
  .btn-ghost:hover { color: ${colors.themeText}; }
  .btn-outline     { background: transparent; color: ${colors.themeText}; border: 1px solid ${colors.themeBorder}; }
  .btn-outline:hover { background: ${theme === 'dark' ? '#374151' : '#f3f4f6'}; }
  .btn-primary     { background: ${colors.themeAccent}; color: ${theme === 'dark' ? '#111827' : 'white'}; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
  .btn-primary:hover { opacity: 0.9; }

  @media (prefers-reduced-motion: reduce) {
    .aitour-card {
      animation: none !important;
    }
  }
  /* Mobile: let JS positioning (computeTooltipPosition) place the card near
     the target element — same as desktop. Only adjust width and sizing. */
  @media (max-width: 600px) {
    .aitour-card {
      width: calc(100vw - 24px) !important;
      max-width: none !important;
      left: 12px !important;
    }
    .aitour-body { padding: 14px 16px; }
    .aitour-title { font-size: 15px; }
    .aitour-content { font-size: 13px; }
    .aitour-seg { width: 12px; height: 3px; }
    .btn { padding: 7px 14px; font-size: 12.5px; }
    .aitour-dismiss-group .btn { font-size: 11px; padding: 4px 5px; }
    .aitour-nav-stack .btn { font-size: 10.5px; padding: 4px 8px; }
  }
</style>
<div class="aitour-card" id="aitour-card">
  <div class="aitour-body">
  <div class="aitour-progress-row">
    <div class="aitour-segs">${segHtml}</div>
    <span class="aitour-step">Step ${curStep} of ${totStep}</span>
  </div>
  <h4 class="aitour-title">${escapeHtml(title)}</h4>
  <p class="aitour-content">${escapeHtml(content)}</p>
  <div class="aitour-controls">
    <div class="aitour-dismiss-group">
      <button id="skip-btn" class="btn btn-ghost">${escapeHtml(strings.dismiss)}</button>
      <button id="dont-show-btn" class="btn btn-ghost aitour-dontshow-btn" aria-pressed="false">${escapeHtml(strings.dontShowAgain)}</button>
    </div>
    <div class="aitour-nav-stack">
      ${isFirst ? '' : `<button id="back-btn" class="btn btn-outline">${escapeHtml(strings.back)}</button>`}
      <button id="next-btn" class="btn btn-primary">
        ${isLast ? escapeHtml(strings.finish) : escapeHtml(strings.next)}
      </button>
    </div>
  </div>
  </div>
</div>
    `;
}

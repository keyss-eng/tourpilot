import { escapeHtml } from '../dom';
import type { ThemeColors } from './theme';

// tooltip/gate-card — pure builder for the "Step Gating" modal shown when a
// step's target isn't visible yet (waiting for the user to perform an action).
// Returns markup only; the player wires up events and focus handling.

export interface GateCardOptions {
  colors: ThemeColors;
  theme?: string;
  stepNumber: string;
  title?: string;
  content?: string;
  strings: any;
}

export function buildGateCard(o: GateCardOptions): string {
  const { colors, theme, stepNumber, title, content, strings } = o;
  return `
<style>
  .aitour-gate {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(340px, calc(100vw - 24px));
    background: ${colors.themeBg};
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    border: 1px solid ${colors.themeBorder};
    padding: 24px;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 2147483647;
    pointer-events: all;
    animation: gate-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes gate-in {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  .gate-progress { font-size: 12px; color: ${colors.themeMuted}; margin: 0 0 12px 0; }
  .gate-icon { font-size: 28px; margin-bottom: 8px; display: block; }
  .gate-title { margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: ${colors.themeText}; }
  .gate-content { margin: 0 0 16px 0; font-size: 14px; color: ${colors.themeMuted}; line-height: 1.6; }
  .gate-waiting {
    font-size: 13px; color: ${colors.themeMuted};
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 16px;
  }
  .gate-dots span {
    display: inline-block; width: 6px; height: 6px;
    border-radius: 50%; background: ${colors.themeText};
    animation: pulse 1.5s infinite;
    margin-right: 3px;
  }
  .gate-dots span:nth-child(2) { animation-delay: 0.3s; }
  .gate-dots span:nth-child(3) { animation-delay: 0.6s; }
  .gate-controls { display: flex; justify-content: space-between; align-items: center; }
  .btn { padding: 8px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: 0.15s; }
  .btn-ghost { background: transparent; color: ${colors.themeMuted}; padding-left: 0; }
  .btn-ghost:hover { color: ${colors.themeText}; }
  .btn-secondary { background: ${theme === 'dark' ? '#374151' : '#f3f4f6'}; color: ${colors.themeText}; }
  .btn-secondary:hover { background: ${theme === 'dark' ? '#4b5563' : '#e5e7eb'}; }

  @media (prefers-reduced-motion: reduce) {
    .aitour-gate {
      animation: none !important;
    }
    .gate-dots span {
      animation: none !important;
    }
  }
</style>
<div class="aitour-gate" role="dialog" aria-label="Step Gate" aria-live="polite">
  <p class="gate-progress">${stepNumber}</p>
  <span class="gate-icon">👆</span>
  <h4 class="gate-title">${escapeHtml(title || 'Action Required')}</h4>
  <p class="gate-content">${escapeHtml(content || 'Perform the action above to continue the tour.')}</p>
  <div class="gate-waiting">
    <span class="gate-dots"><span></span><span></span><span></span></span>
    ${escapeHtml(strings.waiting)}
  </div>
  <div class="gate-controls">
    <button id="gate-skip-btn" class="btn btn-ghost">${escapeHtml(strings.maybeLater)}</button>
    <button id="gate-next-btn" class="btn btn-secondary">${escapeHtml(strings.skipStep)}</button>
  </div>
</div>
    `;
}

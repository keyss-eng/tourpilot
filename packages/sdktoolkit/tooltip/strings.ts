import type { AITourConfig } from '../api/types';

// tooltip/strings — localized UI labels for the tooltip & gate cards.
// Supports a built-in locale string (en/es/fr/de) or a custom object override.
const LOCALES: Record<string, any> = {
  en: { next: 'Next →', back: '← Back', finish: 'Finish ✓', maybeLater: 'Maybe Later', dismiss: 'Dismiss', dontShowAgain: "Don't show again", skipStep: 'Skip Step →', waiting: 'Waiting for you...' },
  es: { next: 'Siguiente →', back: '← Atrás', finish: 'Finalizar ✓', maybeLater: 'Más tarde', dismiss: 'Descartar', dontShowAgain: 'No mostrar de nuevo', skipStep: 'Saltar paso →', waiting: 'Esperándote...' },
  fr: { next: 'Suivant →', back: '← Retour', finish: 'Terminer ✓', maybeLater: 'Plus tard', dismiss: 'Ignorer', dontShowAgain: 'Ne plus afficher', skipStep: 'Sauter l\'étape →', waiting: 'En attente...' },
  de: { next: 'Weiter →', back: '← Zurück', finish: 'Fertig ✓', maybeLater: 'Vielleicht später', dismiss: 'Schließen', dontShowAgain: 'Nicht mehr anzeigen', skipStep: 'Schritt überspringen →', waiting: 'Warten auf Sie...' },
};

export function getStrings(config?: AITourConfig) {
  const localeVal = config?.locale;
  if (typeof localeVal === 'string') {
    return LOCALES[localeVal] || LOCALES.en;
  } else if (localeVal && typeof localeVal === 'object') {
    return { ...LOCALES.en, ...localeVal };
  }
  return LOCALES.en;
}

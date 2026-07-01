// storage/ — persistence layer for the SDK: storage-key naming (keys.ts) plus
// the safe localStorage wrapper that no-ops when storage is unavailable
// (private mode, blocked cookies). Resume-step and "don't show again" state all
// flow through these keys.
export { safeStorage } from '../dom';
export { storageSuffix, globalKey, tourKey } from './keys';

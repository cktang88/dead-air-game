import {parseProgress, SAVE_KEY} from './progression.js';

export function readSavedProgress(storage) {
  return parseProgress(storage.getItem(SAVE_KEY));
}

export function writeSavedProgress(storage, progress) {
  storage.setItem(SAVE_KEY, JSON.stringify(progress));
}

export function clearSavedProgress(storage) {
  storage.removeItem(SAVE_KEY);
}

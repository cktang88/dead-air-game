import test from 'node:test';
import assert from 'node:assert/strict';
import {trapDialogTab} from './dialog-focus.js';

function createDialog({disabled = [], hidden = []} = {}) {
  const buttons = ['first', 'middle', 'last'].map((name, index) => ({
    name,
    disabled: disabled.includes(name),
    closest: () => hidden.includes(name) ? {} : null,
    focus() { this.focused = true; },
    index,
  }));
  return {buttons, querySelectorAll: () => buttons.filter(button => !button.disabled), contains: element => buttons.includes(element)};
}

function tab(shiftKey = false) {
  return {shiftKey, prevented: false, preventDefault() { this.prevented = true; }};
}

test('Tab wraps from the final enabled control and skips a hidden control', () => {
  const panel = createDialog({hidden: ['middle']});
  const event = tab();

  trapDialogTab(event, panel, panel.buttons[2]);

  assert.equal(event.prevented, true);
  assert.equal(panel.buttons[0].focused, true);
});

test('Shift+Tab from the first control wraps to the last enabled control', () => {
  const panel = createDialog({disabled: ['middle']});
  const event = tab(true);

  trapDialogTab(event, panel, panel.buttons[0]);

  assert.equal(event.prevented, true);
  assert.equal(panel.buttons[2].focused, true);
});

test('Tab returns outside focus to the dialog and leaves interior movement alone', () => {
  const panel = createDialog();
  const outside = {};
  const outsideEvent = tab();
  trapDialogTab(outsideEvent, panel, outside);

  assert.equal(outsideEvent.prevented, true);
  assert.equal(panel.buttons[0].focused, true);

  const interiorEvent = tab();
  trapDialogTab(interiorEvent, panel, panel.buttons[1]);
  assert.equal(interiorEvent.prevented, false);
});

test('empty dialogs do not trap focus', () => {
  const panel = {querySelectorAll: () => [], contains: () => false};
  const event = tab();

  trapDialogTab(event, panel, {});

  assert.equal(event.prevented, false);
});

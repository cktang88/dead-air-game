export function trapDialogTab(event, panel, focused) {
  const focusable = [...panel.querySelectorAll('button:not(:disabled)')]
    .filter(button => !button.closest('[hidden]'));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first) return;

  if (!panel.contains(focused)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && focused === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && focused === last) {
    event.preventDefault();
    first.focus();
  }
}

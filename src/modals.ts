/* Modal open/close plumbing + generic [data-close] buttons + confirm dialogs. */
import { S } from './state';
import { $ } from './utils';
import { Snd } from './audio';

export function openModal(id: string): void {
  $(id).classList.add('open');
  S.modalOpen = true;
  Snd.init();
  /* focus the first button for keyboard players */
  var first = $(id).querySelector('button');
  if (first) {
    try { (first as HTMLElement).focus({ preventScroll: true }); } catch (e) { /* jsdom */ }
  }
}

export function closeModal(id: string): void {
  $(id).classList.remove('open');
  S.modalOpen = document.querySelector('.modal.open') ? true : false;
}

/** Close whichever modal is on top (ESC / backdrop behavior). */
export function closeTopModal(): void {
  var list = Array.prototype.slice.call(document.querySelectorAll('.modal.open')) as HTMLElement[];
  var top = list[list.length - 1];
  if (!top) return;
  if (top.id === 'endModal') return;      /* defeat/victory can't be ESC'd away */
  if (top.id === 'confirmModal') { confirmNo(); return; }
  top.classList.remove('open');
  S.modalOpen = document.querySelector('.modal.open') ? true : false;
}

document.querySelectorAll('[data-close]').forEach(function (b) {
  b.addEventListener('pointerdown', function () {
    closeModal(b.getAttribute('data-close')!);
  });
});

/* ---- generic confirm dialog ---- */
export function askConfirm(title: string, msg: string, okLabel: string, danger: boolean, onOk: () => void): void {
  S.pendingConfirm = { title: title, msg: msg, okLabel: okLabel, danger: danger, onOk: onOk };
  renderConfirm();
  openModal('confirmModal');
}

function renderConfirm(): void {
  var c = S.pendingConfirm;
  if (!c) return;
  $('confirmTitle').textContent = c.title;
  $('confirmMsg').textContent = c.msg;
  var ok = $('confirmOk');
  ok.textContent = c.okLabel;
  ok.classList.toggle('danger', c.danger);
}

export function confirmYes(): void {
  var c = S.pendingConfirm;
  S.pendingConfirm = null;
  closeModal('confirmModal');
  if (c) c.onOk();
}

export function confirmNo(): void {
  S.pendingConfirm = null;
  closeModal('confirmModal');
}

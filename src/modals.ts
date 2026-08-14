/* Modal open/close plumbing + generic [data-close] buttons. */
import { S } from './state';
import { $ } from './utils';
import { Snd } from './audio';

export function openModal(id: string): void {
  $(id).classList.add('open');
  S.modalOpen = true;
  Snd.init();
}

export function closeModal(id: string): void {
  $(id).classList.remove('open');
  S.modalOpen = document.querySelector('.modal.open') ? true : false;
}

document.querySelectorAll('[data-close]').forEach(function (b) {
  b.addEventListener('pointerdown', function () {
    closeModal(b.getAttribute('data-close')!);
  });
});

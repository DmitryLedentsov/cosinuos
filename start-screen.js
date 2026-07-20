(() => {
  'use strict';

  const screen = document.querySelector('#startScreen');
  const startButton = document.querySelector('#startButton');
  const launchButton = document.querySelector('#launchButton');

  if (!screen || !startButton || !launchButton) return;

  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    startButton.disabled = true;
    launchButton.click();
    screen.classList.add('is-leaving');
    window.setTimeout(() => screen.remove(), 460);
  };

  startButton.addEventListener('click', start);

  window.addEventListener('keydown', event => {
    if (started) return;
    if (event.code === 'Enter') {
      event.preventDefault();
      start();
    }
  });
})();

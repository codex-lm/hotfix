// Keep failed module loads visible instead of leaving an endless loading screen.
// This small bilingual fallback runs before the translated application is ready.
function bootError(event) {
  const message=String(event.message||event.reason?.message||event.reason||'');
  if(!message)return;
  document.documentElement.dataset.bootError=message;
  const boot=document.querySelector('.boot');
  if(!boot)return;
  const text=boot.querySelector('p');
  if(text)text.textContent='Le jeu n’a pas pu démarrer. Recharge la page. / The game could not start. Please reload.';
}
window.addEventListener('error',bootError);
window.addEventListener('unhandledrejection',bootError);

import { initViewport } from './viewport';

initViewport();
const ui = document.getElementById('ui')!;
ui.innerHTML = `<div id="lobby"><div class="card panel"><h1>Talwacht</h1><p class="sub">Verteidigt euer Tal – zu zweit.</p></div></div>`;

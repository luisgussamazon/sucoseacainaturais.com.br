import { STORAGE_KEY, createState, loadState, missions, redeem, transitionOrder, completeMission, grantCredit } from './model.js';

let storage;
try { storage = window.localStorage; } catch { /* A demo também funciona apenas em memória. */ }
let state = loadState(storage);
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let toastTimer;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = value => Number(value).toLocaleString('pt-BR');
const date = value => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const roles = { EMPLOYEE: 'Colaborador', HR: 'RH', ADMIN: 'Administrador' };
const statusNames = { RESERVED: 'Aguardando retirada', DELIVERED: 'Entregue', CANCELLED: 'Cancelado' };
const paths = {
  home: 'M3 10 12 3l9 7v10H3z M9 20v-7h6v7',
  bag: 'M5 7h14l1 14H4L5 7z M8 7V5a4 4 0 0 1 8 0v2',
  wallet: 'M3 6h17v15H3V6z M3 6V3h14 M15 11h6v5h-6z',
  star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  box: 'm3 7 9-4 9 4v12l-9 3-9-3V7z M3 7l9 4 9-4 M12 11v11 M8 5l9 4',
  people: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4',
  leaf: 'M20 3C8 2 2 7 5 15c3 8 17 5 15-12z M4 22 16 8',
  chart: 'M3 3v18h18 M7 16v-5 M12 16V6 M17 16V9',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
};
const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.star}"/></svg>`;
const brand = `<svg width="44" height="28" viewBox="0 0 90 44" fill="none" aria-hidden="true"><path d="M5 15C25 33 57 35 78 17M66 13c6-3 13-4 17-2 2 4-1 10-5 15" stroke="#ff9900" stroke-width="5" stroke-linecap="round"/></svg><strong>VBJ2 <small>SSD</small></strong>`;
const links = [['/', 'Visão geral', 'home'], ['/loja', 'SSD VBJ2', 'bag'], ['/carteira', 'Minha carteira', 'wallet'], ['/missoes', 'Missões e quizzes', 'star'], ['/resgates', 'Meus resgates', 'box'], ['/mural', 'Mural SSD VBJ2', 'people'], ['/momentos', 'Momentos VBJ2', 'leaf']];
const management = [['/comunidade', 'Comunidade e eventos', 'people'], ['/rh', 'Pessoas e campanhas', 'people'], ['/relatorios', 'Relatórios', 'chart'], ['/entregas', 'Entrega de produtos', 'box']];
function route() { return location.hash.slice(1).split('?')[0] || '/'; }
function notify(message) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
}
function save() {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { notify('A simulação funciona nesta aba, mas o navegador não permitiu salvar os dados.'); }
}
const button = (action, label, extra = '', classes = '') => `<button class="button ${classes}" data-action="${action}" ${extra}>${label}</button>`;
const heading = (title, subtitle) => `<div class="page-heading"><span class="eyebrow">PROGRAMA DE RECONHECIMENTO</span><h1>${title}</h1><p>${subtitle}</p></div>`;
const empty = (text, link = '/loja', label = 'Explorar a loja') => `<div class="empty">${icon('box')}<h3>${text}</h3><a class="button" href="#${link}">${label}</a></div>`;
function stats() {
  return `<div class="stats">${[
    ['Seu saldo disponível', num(state.balance), 'Amazonitos para novas escolhas', 'wallet'],
    ['Amazonitos conquistados', num(state.ledger.filter(l => l.amount > 0 && !l.description.startsWith('Estorno:')).reduce((s, l) => s + l.amount, 0)), 'Reconhecimento que vira possibilidades', 'star'],
    ['Seus resgates', state.orders.filter(o => o.status !== 'CANCELLED').length, 'Produtos reservados ou retirados', 'box'],
    ['Missões disponíveis', missions.length - state.completed.length, 'Novas chances de conquistar', 'leaf'],
  ].map(([label, value, detail, name]) => `<article class="stat"><span class="stat-icon">${icon(name)}</span><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('')}</div>`;
}
function feed(limit = 20) {
  return state.posts.slice(0, limit).map(p => `<article class="panel post"><div class="person"><span class="avatar">${esc(p.author?.slice(0, 2).toUpperCase())}</span><div><strong>${esc(p.author)}</strong><small>Comunidade SSD VBJ2 · Demonstração</small></div><span class="badge">Mural</span></div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p><div class="post-bottom"><button class="text-button ${p.liked ? 'liked' : ''}" data-action="like" data-id="${esc(p.id)}" aria-pressed="${p.liked}">♡ ${p.liked ? 'Curtido' : 'Curtir'} · ${num(p.likes)}</button><span>Juntos fazemos a diferença</span></div></article>`).join('');
}
function home() {
  return `<section class="hero"><div><span class="eyebrow">${icon('leaf')} CONSUMO CONSCIENTE, RECOMPENSAS REAIS</span><h1>Suas conquistas merecem<br>novas possibilidades.</h1><p>Transforme seus Amazonitos em produtos.<br>Você ganha. O planeta também.</p><a href="#/loja" class="button">Explorar a loja ${icon('arrow')}</a></div><img src="./images/amazonitos-hero.webp" alt="Caixas, produtos e uma moeda Amazonitos entre plantas" fetchpriority="high"></section>${stats()}<div class="welcome"><span>● BOM TER VOCÊ POR AQUI</span><span>${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' })}</span></div><h2>Bem-vindo ao SSD VBJ2, ${esc(state.name.split(' ')[0])}!</h2><p class="muted">Acompanhe nossas conquistas, participe das missões e faça parte das ações da nossa equipe.</p><div class="two-columns"><div>${feed(2)}</div><aside><article class="panel recognition">${icon('star')}<span class="eyebrow">SEU PRÓXIMO PASSO</span><h2>Boas atitudes.<br>Novas conquistas.</h2><p>Participe de um quiz e ganhe até 30 Amazonitos para o próximo resgate.</p><a href="#/missoes" class="button">Ver minhas missões ${icon('arrow')}</a></article><article class="panel"><h3>Como funciona?</h3><ol class="steps"><li>Participe das campanhas.</li><li>Conquiste Amazonitos.</li><li>Escolha sua surpresa na loja.</li><li>Retire seu produto com a equipe.</li></ol></article></aside></div>`;
}
function store() {
  return `<section class="store-hero"><div><span class="eyebrow">ESCOLHAS QUE VALEM MAIS</span><h1>SSD VBJ2</h1><h2>Surpresas que resgatam, inspiram e conectam.</h2><p>Troque seus Amazonitos por produtos e viva novas experiências.</p></div><img src="./images/store/hero.webp" alt="Caixa Misteriosa VBJ2"><strong>Surpresas<br>deliciosas<br>para você!</strong></section><form id="filters" class="filters"><input name="q" type="search" aria-label="Buscar produtos" placeholder="Buscar um produto..."><select name="category" aria-label="Categoria"><option value="">Todas as categorias</option>${state.products.map(p => `<option>${p.category}</option>`).join('')}</select><select name="price" aria-label="Faixa de preço"><option value="">Todos os preços</option><option value="20">Até 20 Amazonitos</option><option value="50">21 a 50 Amazonitos</option><option value="over">Acima de 50 Amazonitos</option></select><select name="sort" aria-label="Ordenação"><option value="asc">Menor preço</option><option value="desc">Maior preço</option><option value="name">Nome A–Z</option></select><button class="button">Buscar</button></form><div id="products"></div>`;
}
function renderProducts() {
  const target = document.querySelector('#products');
  if (!target) return;
  const filters = new FormData(document.querySelector('#filters'));
  const query = String(filters.get('q') || '').toLocaleLowerCase('pt-BR');
  const products = state.products.filter(p => (p.name + p.description).toLocaleLowerCase('pt-BR').includes(query) && (!filters.get('category') || p.category === filters.get('category')) && (!filters.get('price') || (filters.get('price') === '20' ? p.price <= 20 : filters.get('price') === '50' ? p.price > 20 && p.price <= 50 : p.price > 50)));
  products.sort((a, b) => filters.get('sort') === 'name' ? a.name.localeCompare(b.name) : filters.get('sort') === 'desc' ? b.price - a.price : a.price - b.price);
  target.innerHTML = `<p class="results"><strong>${products.length} produtos encontrados</strong> · Retirada presencial · Estoque demonstrativo</p><div class="product-grid">${products.map(p => `<article class="product-card"><div class="product-image"><img src="./images/store/${p.id}.webp" alt="${esc(p.name)}" loading="lazy"><span class="badge">${p.category}</span></div><div class="product-body"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><small>Validade do lote: ${date(p.expires)}</small><p class="stock">● ${p.stock ? `${p.stock} unidades disponíveis` : 'Esgotado no momento'}</p><div class="price"><strong>${p.price}</strong><span>Amazonitos</span></div>${button('redeem', !p.stock ? 'Esgotado' : p.price > state.balance ? 'Saldo insuficiente' : 'Resgatar agora', `data-id="${p.id}" ${!p.stock || p.price > state.balance ? 'disabled' : ''}`)}</div></article>`).join('')}</div>${!products.length ? '<div class="empty">Nenhum produto encontrado. Tente outra busca.</div>' : ''}`;
}
function ledger() {
  return `<div class="table-wrap"><table><thead><tr><th>Movimentação</th><th>Data</th><th>Amazonitos</th></tr></thead><tbody>${state.ledger.map(l => `<tr><td>${esc(l.description)}</td><td>${date(l.date)}</td><td class="${l.amount > 0 ? 'positive' : 'negative'}"><strong>${l.amount > 0 ? '+' : ''}${num(l.amount)}</strong></td></tr>`).join('')}</tbody></table></div>`;
}
function wallet() {
  return `${heading('Minha carteira', 'Seu reconhecimento, suas possibilidades. Acompanhe cada conquista.')}<section class="wallet"><div><span>SALDO DISPONÍVEL</span><h2>${num(state.balance)} <small>Amazonitos</small></h2><p>Você está a uma escolha da sua próxima surpresa.</p><a class="button" href="#/loja">Usar meus Amazonitos ${icon('arrow')}</a></div><div class="coin" aria-hidden="true">a<span>AMAZONITOS</span></div></section><article class="panel"><h2>Extrato da carteira</h2>${ledger()}</article>`;
}
function missionPage() {
  return `${heading('Missões e quizzes', 'Aprenda, participe e transforme suas atitudes em reconhecimento.')}<div class="mission-grid">${missions.map(m => `<article class="panel mission"><span class="mission-icon">${icon('star')}</span><span class="eyebrow">${m.category}</span><h2>${m.title}</h2><p>${m.description}</p><strong class="reward">+ ${m.reward} Amazonitos</strong>${button('quiz', state.completed.includes(m.id) ? 'Missão concluída ✓' : 'Participar da missão', `data-id="${m.id}" ${state.completed.includes(m.id) ? 'disabled' : ''}`)}</article>`).join('')}</div>`;
}
function ordersPage(delivery = false) {
  return `${heading(delivery ? 'Entrega de produtos' : 'Meus resgates', delivery ? 'Confirme a retirada dos produtos reservados nesta demonstração.' : 'Suas escolhas estão aqui. Acompanhe a retirada de cada surpresa.')}<div class="order-list">${state.orders.map(o => `<article class="panel order"><img src="./images/store/${o.productId}.webp" alt="${esc(o.name)}"><div><span class="eyebrow">RESGATE #${o.id.slice(0, 8).toUpperCase()}</span><h3>${esc(o.name)}</h3><p>${date(o.date)} · ${o.price} Amazonitos</p><span class="badge ${o.status === 'CANCELLED' ? 'neutral' : ''}">${statusNames[o.status]}</span></div><div class="order-actions">${o.status === 'RESERVED' ? `${delivery ? button('deliver', 'Confirmar entrega', `data-id="${o.id}"`) : '<small>Retirada: recepção SSD VBJ2<br>Apresente o código do resgate.</small>'}${button('cancel', 'Cancelar resgate', `data-id="${o.id}"`, 'secondary')}` : ''}</div></article>`).join('') || empty('Você ainda não fez um resgate.')}</div>`;
}
function mural() {
  return `${heading('Mural SSD VBJ2', 'Um espaço para compartilhar conquistas e reconhecer quem faz a diferença.')}<div class="two-columns"><div>${feed()}</div><aside class="panel recognition"><h2>Nossa equipe,<br>nossas conquistas.</h2><p>Curta as publicações e celebre boas atitudes. Cada participação conta.</p><a class="button" href="#/momentos">Ver momentos ${icon('arrow')}</a></aside></div>`;
}
function moments() {
  return `${heading('Momentos VBJ2', 'Atitudes que inspiram. Conquistas que conectam.')}<div class="moment-grid"><article class="panel moment"><img src="./images/amazonitos-hero.webp" alt="Produtos, plantas e moeda Amazonitos"><div><span class="badge">Sustentabilidade</span><h2>Um novo destino, muitas possibilidades</h2><p>Reconhecimento e consumo consciente caminham juntos no SSD VBJ2.</p></div></article><article class="panel recognition"><span class="eyebrow">MURAL DE CONQUISTAS</span><h2>Seu próximo momento começa aqui.</h2><p>Complete uma missão e acompanhe sua evolução nesta apresentação.</p><strong class="big-number">${state.completed.length} / ${missions.length}</strong><p>Missões concluídas por você</p><a href="#/missoes" class="button">Participar agora ${icon('arrow')}</a></article></div>`;
}
function people() {
  return `${heading('Pessoas e campanhas', 'Reconheça boas atitudes e incentive a participação da equipe.')}<div class="two-columns"><article class="panel"><h2>Conceder Amazonitos</h2><form id="credit" class="stack"><label>Colaborador<input value="${esc(state.name)} · Conta de demonstração" disabled></label><label>Quantidade de Amazonitos<input name="amount" type="number" min="1" max="10000" step="1" required placeholder="Ex.: 50"></label><label>Motivo do reconhecimento<input name="reason" required maxlength="160" placeholder="Ex.: colaboração com a equipe"></label><button class="button">Conceder reconhecimento</button></form></article><article class="panel"><h2>Campanhas em andamento</h2>${missions.map(m => `<div class="list-row"><div><strong>${m.title}</strong><small>${m.category}</small></div><span class="badge">+${m.reward}</span></div>`).join('')}<a href="#/missoes" class="text-link">Abrir central de missões →</a></article></div>`;
}
function stock() {
  return `${heading('Estoque e lotes', 'Acompanhe os produtos disponíveis e simule a entrada de novas unidades.')}<article class="panel"><div class="table-wrap"><table><thead><tr><th>Produto</th><th>Valor</th><th>Validade</th><th>Estoque</th><th>Ação</th></tr></thead><tbody>${state.products.map(p => `<tr><td><strong>${esc(p.name)}</strong></td><td>${p.price} Amazonitos</td><td>${date(p.expires)}</td><td>${p.stock} unidades</td><td>${button('restock', 'Adicionar 5 unidades', `data-id="${p.id}"`, 'secondary')}</td></tr>`).join('')}</tbody></table></div></article>`;
}
function reports() {
  const redeemed = state.orders.filter(o => o.status !== 'CANCELLED');
  return `${heading('Relatórios', 'Indicadores calculados a partir das suas interações nesta demonstração.')} ${stats()}<div class="two-columns"><article class="panel"><h2>Participação nas missões</h2>${missions.map(m => `<div class="list-row"><span>${m.title}</span><span class="badge">${state.completed.includes(m.id) ? 'Concluída' : 'Pendente'}</span></div>`).join('')}</article><article class="panel"><h2>Resumo dos resgates</h2>${[['Aguardando retirada', redeemed.filter(o => o.status === 'RESERVED').length], ['Entregues', redeemed.filter(o => o.status === 'DELIVERED').length], ['Cancelados', state.orders.filter(o => o.status === 'CANCELLED').length], ['Amazonitos utilizados', redeemed.reduce((s, o) => s + o.price, 0)]].map(([label, value]) => `<div class="list-row"><span>${label}</span><strong>${num(value)}</strong></div>`).join('')}</article></div>`;
}
function community() {
  return `${heading('Comunidade e eventos', 'Compartilhe uma novidade no mural da equipe.')}<article class="panel"><h2>Nova publicação</h2><form id="publication" class="stack"><label>Título<input name="title" required maxlength="100" placeholder="Uma conquista para compartilhar"></label><label>Mensagem<textarea name="text" required maxlength="1200" rows="4" placeholder="Conte à equipe o que aconteceu..."></textarea></label><button class="button">Publicar no mural de demonstração</button></form></article><div class="two-columns"><div>${feed()}</div></div>`;
}
function admin() {
  return `${heading('Administração', 'Explore os perfis e prepare a próxima apresentação.')}<article class="panel"><h2>Conta de demonstração</h2><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail fictício</th><th>Perfil em exibição</th><th>Status</th></tr></thead><tbody><tr><td>${esc(state.name)}</td><td>ana@exemplo.invalid</td><td>${roles[state.role]}</td><td><span class="badge">Ativo</span></td></tr></tbody></table></div><p class="muted">Use o seletor no topo para apresentar a experiência de colaborador, RH ou administrador. Todos os perfis usam os mesmos dados fictícios deste navegador.</p></article><article class="panel"><h2>Preparar uma nova apresentação</h2><p>Restaura os 250 Amazonitos iniciais, os produtos e as missões. Remove apenas as interações desta demonstração no seu navegador.</p>${button('reset', 'Reiniciar demonstração', '', 'secondary')}</article>`;
}
function profile() {
  return `${heading('Meu acesso', 'Personalize o nome usado nesta apresentação.')}<article class="panel narrow"><div class="person"><span class="avatar large">${esc(state.name.slice(0, 2).toUpperCase())}</span><div><h2>${esc(state.name)}</h2><p>${roles[state.role]} · Conta demonstrativa</p></div></div><form id="profile" class="stack"><label>Nome de exibição<input name="name" value="${esc(state.name)}" required maxlength="60"></label><button class="button">Salvar nome</button></form><p class="muted">Esta versão abre sem senha. Não há autenticação nem cadastro de contas reais.</p></article>`;
}
function render() {
  let page = route();
  const canManage = state.role !== 'EMPLOYEE';
  const adminRoutes = ['/estoque', '/admin'];
  if ((!canManage && management.some(([url]) => url === page)) || (state.role !== 'ADMIN' && adminRoutes.includes(page))) {
    location.hash = '/'; page = '/';
  }
  const pages = { '/': home, '/loja': store, '/carteira': wallet, '/missoes': missionPage, '/resgates': ordersPage, '/mural': mural, '/momentos': moments, '/rh': people, '/relatorios': reports, '/entregas': () => ordersPage(true), '/estoque': stock, '/comunidade': community, '/admin': admin, '/perfil': profile };
  const nav = items => items.map(([url, label, name]) => `<a href="#${url}" class="nav-link ${page === url ? 'active' : ''}" ${page === url ? 'aria-current="page"' : ''}>${icon(name)}${label}</a>`).join('');
  app.innerHTML = `<header class="topbar"><a class="brand" href="#/" aria-label="SSD VBJ2 — início">${brand}</a><span class="header-label">Programa de reconhecimento <b>•</b> Colaboradores</span><a class="balance-pill" href="#/carteira">${icon('wallet')} ${num(state.balance)} <span>Amazonitos</span></a><a class="profile-link" href="#/perfil"><span class="avatar">${esc(state.name.slice(0, 2).toUpperCase())}</span><span>${esc(state.name)}<small>${roles[state.role]}</small></span></a></header><aside class="sidebar"><nav aria-label="Menu principal"><div class="nav-caption">SEU ESPAÇO</div>${nav(links)}${canManage ? '<div class="nav-caption">GESTÃO</div>' + nav(management) : ''}${state.role === 'ADMIN' ? nav([['/estoque', 'Estoque e lotes', 'box'], ['/admin', 'Administração', 'settings']]) : ''}${nav([['/perfil', 'Meu acesso', 'settings']])}</nav><div class="sidebar-purpose">${icon('leaf')}<strong>Pequenas escolhas.<br>Grandes impactos.</strong><p>Menos desperdício,<br>mais possibilidades.</p></div><small class="sidebar-foot">FEITO PARA QUEM FAZ A DIFERENÇA</small></aside><div class="workspace"><div class="demo-toolbar"><span><strong>Modo demonstração</strong><span class="demo-detail"> · Dados fictícios salvos neste navegador</span></span><div><label for="role">Ver como</label><select id="role">${Object.entries(roles).map(([value, label]) => `<option value="${value}" ${state.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="text-button" data-action="reset">Reiniciar demo</button></div></div><main id="main" tabindex="-1">${pages[page] ? pages[page]() : empty('Página não encontrada.', '/', 'Voltar ao início')}</main><footer><span>© ${new Date().getFullYear()} SSD VBJ2</span><span>Amazonitos são moedas fictícias, sem valor monetário real.</span></footer></div>`;
  document.title = `${[...links, ...management, ['/estoque', 'Estoque'], ['/admin', 'Administração'], ['/perfil', 'Meu acesso']].find(([url]) => url === page)?.[1] || 'SSD VBJ2'} · Demonstração`;
  renderProducts();
}
function openDialog(title, content) {
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="close" data-action="close" aria-label="Fechar">×</button></div>${content}<p class="dialog-error" role="alert"></p>`;
  dialog.showModal();
}
document.addEventListener('change', event => {
  if (event.target.id === 'role') { state.role = event.target.value; save(); render(); }
  else if (event.target.closest('#filters')) renderProducts();
});
document.addEventListener('input', event => { if (event.target.closest('#filters')) renderProducts(); });
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  try {
    if (action === 'close') { dialog.close(); return; }
    if (action === 'reset') {
      openDialog('Reiniciar demonstração?', '<p>Os resgates, créditos, publicações e missões deste navegador serão restaurados para o cenário inicial.</p><div class="dialog-actions">' + button('close', 'Voltar', '', 'secondary') + button('confirm-reset', 'Sim, reiniciar') + '</div>'); return;
    }
    if (action === 'confirm-reset') { state = createState(); dialog.close(); location.hash = '/'; save(); render(); notify('Demonstração reiniciada. Tudo pronto para apresentar!'); return; }
    if (action === 'redeem') {
      const p = state.products.find(p => p.id === id);
      openDialog('Confirmar resgate', `<img class="dialog-product" src="./images/store/${p.id}.webp" alt="${esc(p.name)}"><h3>${esc(p.name)}</h3><div class="list-row"><span>Valor do resgate</span><strong>${p.price} Amazonitos</strong></div><div class="list-row"><span>Seu saldo após o resgate</span><strong>${state.balance - p.price} Amazonitos</strong></div><p>Retirada presencial na recepção SSD VBJ2. Este pedido é uma simulação.</p><div class="dialog-actions">${button('close', 'Voltar', '', 'secondary')}${button('confirm-redeem', 'Confirmar resgate', `data-id="${id}"`)}</div>`); return;
    }
    if (action === 'confirm-redeem') { redeem(state, id); dialog.close(); save(); location.hash = '/resgates'; render(); notify('Resgate realizado! Seu produto está reservado.'); return; }
    if (action === 'quiz') {
      const m = missions.find(m => m.id === id);
      openDialog(m.title, `<span class="badge">Recompensa: ${m.reward} Amazonitos</span><form id="quiz" data-id="${id}" class="stack"><fieldset><legend>${m.question}</legend>${m.options.map((option, i) => `<label class="quiz-option"><input type="radio" name="answer" value="${i}" required><span>${option}</span></label>`).join('')}</fieldset><button class="button">Enviar resposta</button></form>`); return;
    }
    if (action === 'cancel' || action === 'deliver') {
      openDialog(action === 'cancel' ? 'Cancelar este resgate?' : 'Confirmar a entrega?', `<p>${action === 'cancel' ? 'Os Amazonitos serão devolvidos à carteira e a unidade voltará ao estoque.' : 'O resgate será marcado como entregue nesta demonstração.'}</p><div class="dialog-actions">${button('close', 'Voltar', '', 'secondary')}${button(action === 'cancel' ? 'confirm-cancel' : 'confirm-deliver', 'Confirmar', `data-id="${id}"`)}</div>`); return;
    }
    if (action === 'confirm-cancel' || action === 'confirm-deliver') { transitionOrder(state, id, action === 'confirm-cancel' ? 'CANCELLED' : 'DELIVERED'); dialog.close(); notify(action === 'confirm-cancel' ? 'Resgate cancelado e saldo estornado.' : 'Entrega confirmada!'); }
    if (action === 'like') { const post = state.posts.find(p => p.id === id); post.likes += post.liked ? -1 : 1; post.liked = !post.liked; }
    if (action === 'restock') { if (state.role !== 'ADMIN') throw new Error('Selecione o perfil Administrador.'); state.products.find(p => p.id === id).stock += 5; notify('5 unidades adicionadas ao estoque demonstrativo.'); }
    save(); render();
  } catch (error) { if (dialog.open) dialog.querySelector('.dialog-error').textContent = error.message; else notify(error.message); }
});
document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === 'filters') { renderProducts(); return; }
    if (form.id === 'quiz') { completeMission(state, form.dataset.id, data.get('answer')); dialog.close(); notify('Parabéns! Recompensa adicionada à sua carteira.'); }
    if (form.id === 'credit') { grantCredit(state, Number(data.get('amount')), String(data.get('reason'))); notify('Reconhecimento concedido! Confira o saldo na carteira.'); }
    if (form.id === 'profile') { const name = String(data.get('name')).trim(); if (!name) throw new Error('Informe um nome.'); state.name = name.slice(0, 60); notify('Nome de apresentação atualizado.'); }
    if (form.id === 'publication') {
      if (state.role === 'EMPLOYEE') throw new Error('Selecione um perfil de gestão.');
      const title = String(data.get('title')).trim(), text = String(data.get('text')).trim();
      if (!title || !text) throw new Error('Preencha o título e a mensagem.');
      state.posts.unshift({ id: crypto.randomUUID(), author: state.name, title: title.slice(0, 100), text: text.slice(0, 1200), likes: 0, liked: false }); notify('Publicação adicionada ao mural da demonstração.');
    }
    save(); render();
  } catch (error) { if (dialog.open) dialog.querySelector('.dialog-error').textContent = error.message; else notify(error.message); }
});
window.addEventListener('hashchange', () => { dialog.close(); render(); window.scrollTo(0, 0); document.querySelector('#main').focus({ preventScroll: true }); });
render();

export const STORAGE_KEY = 'ssd-vbj2-demo-v1';
export const missions = [
  { id: 'sustentabilidade', title: 'Pequenas escolhas, grandes impactos', category: 'Sustentabilidade', reward: 30, description: 'Descubra como reduzir o desperdício no nosso dia a dia.', question: 'Qual atitude ajuda a reduzir o desperdício de alimentos?', options: ['Descartar produtos pela aparência', 'Planejar o consumo e observar a validade', 'Comprar sempre em grandes quantidades'], answer: 1 },
  { id: 'equipe', title: 'Juntos fazemos a diferença', category: 'Nossa cultura', reward: 25, description: 'Colaboração transforma a rotina e fortalece nossa equipe.', question: 'Como podemos fortalecer a colaboração?', options: ['Compartilhando conhecimento com a equipe', 'Evitando pedir ajuda', 'Trabalhando sempre de forma isolada'], answer: 0 },
  { id: 'seguranca', title: 'Cuidar também é reconhecer', category: 'Segurança', reward: 20, description: 'Um ambiente seguro começa com cada um de nós.', question: 'Ao identificar uma situação de risco, o que fazer?', options: ['Ignorar e continuar a tarefa', 'Esperar outra pessoa resolver', 'Comunicar à liderança e seguir o procedimento'], answer: 2 },
];
export function createState() {
  const now = Date.now();
  return {
    version: 1, role: 'EMPLOYEE', name: 'Ana Oliveira', balance: 250,
    products: ['Mini', 'Bronze', 'Prata', 'Ouro', 'Premium', 'Master'].map((tier, i) => ({ id: tier.toLowerCase(), name: 'Caixa Misteriosa ' + tier, category: tier.toUpperCase(), price: [15, 25, 40, 60, 80, 120][i], stock: [18, 12, 10, 8, 6, 3][i], description: `${i + 2} a ${i + 4} produtos alimentícios selecionados para surpreender você.`, expires: new Date(now + (30 + i * 5) * 86400000).toISOString() })),
    orders: [], completed: [],
    ledger: [{ id: 'welcome', description: 'Reconhecimento pela participação', amount: 150, date: new Date(now).toISOString() }, { id: 'team', description: 'Campanha: juntos vamos mais longe', amount: 100, date: new Date(now - 86400000 * 3).toISOString() }],
    posts: [{ id: 'welcome', author: 'Equipe SSD VBJ2', title: 'Cada conquista merece ser celebrada!', text: 'Nosso espaço de reconhecimento conecta pessoas, valoriza atitudes e transforma conquistas em novas possibilidades. Participe das missões e descubra as surpresas da loja.', likes: 24, liked: false }, { id: 'impact', author: 'Pessoas e Cultura', title: 'Menos desperdício. Mais possibilidades.', text: 'Pequenas escolhas fazem a diferença. Nesta semana, nossa equipe se une para compartilhar boas práticas e dar um novo destino a produtos. Vamos juntos?', likes: 18, liked: false }],
  };
}
const id = () => globalThis.crypto.randomUUID();
function record(state, description, amount) {
  state.balance += amount;
  state.ledger.unshift({ id: id(), description, amount, date: new Date().toISOString() });
}
export function redeem(state, productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product || product.stock < 1) throw new Error('Produto sem estoque disponível.');
  if (product.price > state.balance) throw new Error('Saldo insuficiente para este resgate.');
  product.stock -= 1;
  const order = { id: id(), productId, name: product.name, price: product.price, date: new Date().toISOString(), status: 'RESERVED' };
  state.orders.unshift(order);
  record(state, 'Resgate: ' + product.name, -product.price);
  return order;
}
export function transitionOrder(state, orderId, status) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || order.status !== 'RESERVED') throw new Error('Este resgate já foi finalizado.');
  if (!['CANCELLED', 'DELIVERED'].includes(status)) throw new Error('Situação inválida.');
  if (status === 'DELIVERED' && state.role === 'EMPLOYEE') throw new Error('Alterne para RH ou administrador para confirmar a entrega.');
  if (status === 'CANCELLED') {
    state.products.find(p => p.id === order.productId).stock += 1;
    record(state, 'Estorno: ' + order.name, order.price);
  }
  order.status = status;
}
export function completeMission(state, missionId, answer) {
  const mission = missions.find(m => m.id === missionId);
  if (!mission) throw new Error('Missão não encontrada.');
  if (state.completed.includes(missionId)) throw new Error('Você já recebeu a recompensa desta missão.');
  if (Number(answer) !== mission.answer) throw new Error('Ainda não! Reflita sobre a pergunta e tente novamente.');
  state.completed.push(missionId);
  record(state, 'Missão: ' + mission.title, mission.reward);
}
export function grantCredit(state, amount, reason) {
  if (state.role === 'EMPLOYEE') throw new Error('Alterne para um perfil de gestão.');
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000) throw new Error('Informe de 1 a 10.000 Amazonitos inteiros.');
  if (!reason.trim()) throw new Error('Informe o motivo do reconhecimento.');
  record(state, reason.trim().slice(0, 160), amount);
}
export function loadState(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    const valid = saved?.version === 1 && ['EMPLOYEE', 'HR', 'ADMIN'].includes(saved.role)
      && typeof saved.name === 'string' && Number.isSafeInteger(saved.balance) && saved.balance >= 0
      && ['products', 'orders', 'completed', 'ledger', 'posts'].every(key => Array.isArray(saved[key]))
      && saved.products.length === 6
      && saved.products.every((p, i) => p.id === createState().products[i].id && Number.isSafeInteger(p.stock) && p.stock >= 0 && Number.isSafeInteger(p.price) && p.price > 0)
      && saved.orders.every(o => typeof o.name === 'string' && saved.products.some(p => p.id === o.productId) && ['RESERVED', 'CANCELLED', 'DELIVERED'].includes(o.status))
      && saved.ledger.every(l => Number.isSafeInteger(l.amount) && typeof l.description === 'string')
      && saved.posts.every(p => typeof p.text === 'string' && typeof p.title === 'string' && Number.isSafeInteger(p.likes));
    return valid ? saved : createState();
  } catch { return createState(); }
}

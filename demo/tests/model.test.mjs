import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, redeem, transitionOrder, completeMission, grantCredit, loadState } from '../model.js';

test('resgate desconta saldo, reserva estoque e cancelamento estorna apenas uma vez', () => {
  const state = createState(), stock = state.products[0].stock;
  const order = redeem(state, 'mini');
  assert.equal(state.balance, 235);
  assert.equal(state.products[0].stock, stock - 1);
  transitionOrder(state, order.id, 'CANCELLED');
  assert.equal(state.balance, 250);
  assert.equal(state.products[0].stock, stock);
  assert.throws(() => transitionOrder(state, order.id, 'CANCELLED'));
  assert.equal(state.balance, 250);
});
test('não permite resgates sem saldo ou estoque nem altera dados em falhas', () => {
  const state = createState();
  state.balance = 10;
  assert.throws(() => redeem(state, 'mini'), /Saldo insuficiente/);
  state.balance = 250;
  state.products[0].stock = 0;
  assert.throws(() => redeem(state, 'mini'), /sem estoque/);
  assert.equal(state.orders.length, 0);
  assert.equal(state.balance, 250);
});
test('quiz aceita somente resposta correta e concede recompensa uma vez', () => {
  const state = createState();
  assert.throws(() => completeMission(state, 'sustentabilidade', 0));
  assert.equal(state.balance, 250);
  completeMission(state, 'sustentabilidade', 1);
  assert.equal(state.balance, 280);
  assert.throws(() => completeMission(state, 'sustentabilidade', 1));
  assert.equal(state.balance, 280);
});
test('entrega exige perfil de gestão e encerra o resgate', () => {
  const state = createState(), order = redeem(state, 'ouro');
  assert.throws(() => transitionOrder(state, order.id, 'DELIVERED'));
  state.role = 'HR';
  transitionOrder(state, order.id, 'DELIVERED');
  assert.equal(state.balance, 190);
  assert.equal(order.status, 'DELIVERED');
  assert.throws(() => transitionOrder(state, order.id, 'CANCELLED'));
});
test('créditos validam perfil, quantidade e motivo', () => {
  const state = createState();
  assert.throws(() => grantCredit(state, 50, 'Equipe'));
  state.role = 'ADMIN';
  for (const value of [-1, 0, 1.5, NaN, 10001]) assert.throws(() => grantCredit(state, value, 'Equipe'));
  assert.throws(() => grantCredit(state, 50, ' '));
  grantCredit(state, 50, 'Colaboração');
  assert.equal(state.balance, 300);
  assert.equal(state.ledger[0].description, 'Colaboração');
});
test('persistência recupera sessão válida e restaura dados ausentes, inválidos ou inacessíveis', () => {
  const state = createState();
  redeem(state, 'bronze');
  assert.deepEqual(loadState({ getItem: () => JSON.stringify(state) }), state);
  for (const value of [null, '{', '{}', JSON.stringify({ ...state, products: [{}] })]) {
    assert.equal(loadState({ getItem: () => value }).balance, 250);
  }
  assert.equal(loadState(undefined).balance, 250);
  assert.equal(loadState({ getItem() { throw new Error('blocked'); } }).balance, 250);
});

import test from "node:test";
import assert from "node:assert/strict";
import { parseEmployeeCsv, csvCell } from "../src/lib/employee-csv";
test("CSV preserva nomes e emails, suporta BOM e aspas", () => {
  const rows = parseEmployeeCsv(
    '\uFEFFnome,email,perfil\r\n"Pessoa, QA",Pessoa.QA@example.invalid,COLABORADOR\r\n',
  );
  assert.equal(rows[0].name, "Pessoa, QA");
  assert.equal(rows[0].email, "Pessoa.QA@example.invalid");
  assert.equal(rows[0].status, "NEW");
});
test("CSV semicolon e duplicatas insensíveis a caixa", () => {
  const rows = parseEmployeeCsv(
    "nome;email;perfil\nPessoa QA;Pessoa@example.invalid;EMPLOYEE\nOutra QA;pessoa@example.invalid;EMPLOYEE",
  );
  assert.equal(rows[1].status, "INVALID");
});
test("RH, ADMIN e emails inválidos não são importados", () => {
  for (const perfil of ["ADMIN", "HR", "RH"]) {
    assert.equal(
      parseEmployeeCsv(
        "nome,email,perfil\nPessoa QA,qa@example.invalid," + perfil,
      )[0].status,
      "INVALID",
    );
  }
  assert.equal(
    parseEmployeeCsv("nome,email\nPessoa QA,invalido")[0].status,
    "INVALID",
  );
});
test("CSV malformado, vazio e excessivo é recusado", () => {
  for (const csv of [
    'nome,email\n"não fechado',
    "sem,cabecalho",
    "nome,email",
    "nome,email\n" + "x".repeat(300000),
  ])
    assert.throws(() => parseEmployeeCsv(csv));
});
test("Exportação de credenciais neutraliza fórmulas CSV", () => {
  assert.equal(
    csvCell("=CMD()"),
    String.fromCharCode(34, 39) + "=CMD()" + String.fromCharCode(34),
  );
});

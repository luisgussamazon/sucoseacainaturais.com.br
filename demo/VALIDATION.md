# Validação da demonstração — 26/10/2026

- Build `node demo/build.mjs`: passou, gerando os arquivos estáticos em `demo/dist` sem instalar dependências e sem conectar a banco.
- Sintaxe do JavaScript: verificada com `node --check`.
- Seis testes automatizados de regras: passaram (resgate/estorno, saldo/estoque insuficiente, recompensa única do quiz, entrega, créditos e recuperação do armazenamento).
- Neste ambiente Windows, o isolamento padrão do executor de testes foi bloqueado com `spawn EPERM`; os mesmos testes passaram com `node --test --experimental-test-isolation=none demo/tests/*.test.mjs`.
- Navegador Microsoft Edge em modo headless, servido por HTTP local: busca de produtos, resgate, persistência após recarregar, cancelamento, resposta incorreta/correta do quiz, concessão de créditos, entrega, reposição de estoque, publicação, curtida, alteração de nome, troca de perfis e reinicialização passaram.
- As 14 telas foram verificadas em larguras de 1440, 390 e 320 pixels: 42 combinações, sem overflow horizontal da página e com imagens carregadas.
- Nenhuma exceção de JavaScript foi registrada pelo navegador. Capturas da home em desktop e da loja no celular foram inspecionadas visualmente.
- O cenário de teste foi reiniciado ao concluir a validação.

Esta validação é local. Nenhum serviço foi criado ou publicado no Render, e os testes da aplicação original com PostgreSQL não foram executados, pois ela não foi modificada.

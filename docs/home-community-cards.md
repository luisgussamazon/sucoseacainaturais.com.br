# Visão Geral simplificada

A integração dos cards Próximos eventos e Reconhecimento foi cancelada. Ambos foram removidos da Visão Geral, incluindo consultas, contêineres e estilos exclusivos.

A análise do commit 78fc06d permitiu retirar somente as dependências exclusivas: CommunityLiveUpdates, seu temporizador/sinal entre abas e a rota /eventos/[id], que era referenciada apenas pelo card removido. Não foi feito rollback do commit inteiro.

## Preservado

- Capa no topo e quatro indicadores reais.
- Mural SSD VBJ2 e Momentos VBJ2 na Visão Geral, com mais largura no desktop e coluna única no celular.
- Missões disponíveis e acessos à loja/carteira.
- Comunidade e Eventos: cadastros, publicações, fotos, eventos e fila Publicar conquista continuam existentes e autorizados pelas permissões individuais.
- Reconhecimentos continuam sendo publicações no mural. Nenhum registro de evento, reconhecimento, missão ou imagem foi excluído do banco.
- Interações do mural continuam usando seus eventos locais de atualização. Autenticação, PWA e regras de saldo, resgates e estoque não foram modificadas.

## Validação

npm run typecheck; npm test; npm run build; node scripts/validate-home-cards.mjs.
A suíte usa PostgreSQL isolado, verifica ausência dos dois cards em 320, 375, 390, 768, 1366 e 1920px, preservação das seções restantes, cadastro de eventos e fila de conquistas, publicações de reconhecimento no mural e integridade dos registros, além das regressões existentes.

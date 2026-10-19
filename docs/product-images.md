# Imagens de produtos

Em Estoque e lotes, o cadastro e a edição aceitam Selecionar imagem ou Foto (URL HTTPS). O arquivo selecionado tem prioridade; sem nova seleção ou endereço, a edição mantém a imagem atual.

- JPG, PNG e WEBP; até 4 MB de entrada e 16 megapixels. O servidor decodifica o conteúdo real, rejeita arquivos falsos/animações e remove metadados ao converter para WEBP de até 1200 × 1200 e 1 MB.
- O WEBP é armazenado como data URI no campo Product.imageUrl existente. A persistência usa o PostgreSQL, não o disco temporário do Railway. Nenhuma migração ou reescrita de registros antigos é necessária.
- URLs HTTPS anteriores permanecem compatíveis. Dados binários não são enviados ao formulário de edição: a imagem usa /api/products/[id]/image, com sessão obrigatória, cache privado/no-store e versão derivada do conteúdo para refletir substituições.
- Apenas ADMIN continua podendo cadastrar/editar produtos. Preços, estoque, FEFO, saldo e resgates mantêm suas regras.
- A prévia é local; arquivos e campos permanecem selecionados quando o salvamento falha. O limite de Server Actions é 6 MB para acomodar o arquivo de 4 MB e os demais campos.

Validação: npm run typecheck, npm test, npm run build e node scripts/validate-product-photo.mjs. A suíte integrada usa PostgreSQL isolado e inclui regressões financeiras, rejeição de imagem inválida, criação sem URL, persistência, edição, troca de foto, exibição na loja e preservação dos produtos existentes.

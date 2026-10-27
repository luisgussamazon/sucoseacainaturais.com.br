# SSD VBJ2 — versão de apresentação para o Render

Versão independente e estática, sem PostgreSQL, Prisma, servidor de aplicação, login ou variáveis de ambiente. Usa a identidade visual e as imagens da loja, com telas simplificadas para demonstração. O código da aplicação original continua em `src/`.

## Publicar no Render

Envie esta pasta `demo/`, a pasta `public/` e o arquivo `render.yaml` junto com o projeto para seu repositório GitHub.

No Render, escolha **New → Static Site**, conecte o repositório e configure:

| Campo | Valor |
| --- | --- |
| Name | `ssd-vbj2-apresentacao` (ou outro nome disponível) |
| Root Directory | Deixe vazio se `render.yaml` estiver na raiz do repositório |
| Build Command | `node demo/build.mjs` |
| Publish Directory | `demo/dist` |
| Environment Variable | `SKIP_INSTALL_DEPS` = `true` |

Se o seu repositório incluir a pasta externa `sucoseacainaturais.com.br/`, use `sucoseacainaturais.com.br` em **Root Directory**. Os outros dois campos ficam iguais.

Clique em **Create Static Site**. Não adicione banco, credenciais ou comando de inicialização. A variável `SKIP_INSTALL_DEPS=true` evita a instalação automática das dependências da aplicação original, que a demonstração não utiliza. Não use o Dockerfile nem o build Next.js para esta demonstração. A navegação usa `#/loja`, `#/carteira` etc., por isso atualizar ou compartilhar uma tela não exige regra de rewrite.

Como alternativa, com `render.yaml` na raiz do repositório, use **New → Blueprint**. O arquivo configura apenas o site estático, sem banco. Se o repositório incluir a pasta externa, prefira o cadastro manual acima; o Blueprint fornecido pressupõe que a raiz do repositório seja a própria pasta do projeto.

Referências: [Static Sites no Render](https://render.com/docs/static-sites) e [campos do render.yaml](https://render.com/docs/blueprint-spec).

### Erro: `pip install -r requirements.txt`

Esse log indica que o serviço está executando um build Python. A demonstração não usa Python e não precisa de `requirements.txt`.

No painel do Render, crie **New → Static Site**, selecione o mesmo repositório e a branch `main`, e preencha os campos da tabela acima. Se você já estiver em um Static Site, corrija o Build Command para `node demo/build.mjs`, o Publish Directory para `demo/dist` e faça um novo deploy. Um formulário com campos de runtime Python e Start Command corresponde a um serviço de aplicação; use o cadastro de Static Site para esta versão.

Ter `render.yaml` no repositório não substitui automaticamente os campos de um serviço criado manualmente. Para aplicar esse arquivo, use o fluxo **New → Blueprint** descrito acima.

## Apresentar

1. O site abre na visão do colaborador, com **250 Amazonitos** e seis caixas misteriosas.
2. Na loja, filtre produtos e confirme um resgate. Confira o pedido em **Meus resgates** e a movimentação em **Minha carteira**.
3. Responda uma missão para ganhar Amazonitos. A recompensa é concedida uma vez por missão.
4. Use **Ver como** no topo para alternar entre **Colaborador**, **RH** e **Administrador**.
5. Em RH/Admin, conceda créditos, publique no mural e confirme entregas. Em Admin, simule reposição de estoque.
6. Use **Reiniciar demo** para voltar ao cenário inicial antes de outra apresentação.

As alterações ficam em `localStorage`, apenas neste navegador e domínio. Não são compartilhadas entre pessoas ou dispositivos. Limpar os dados do navegador ou reiniciar a demo restaura o cenário. Se o navegador bloquear armazenamento, a demonstração funciona em memória até recarregar.

Os perfis são modos de apresentação, sem autenticação real. Não use dados pessoais ou credenciais reais. Uploads, importação de colaboradores, gestão completa de campanhas e demais operações do backend original não fazem parte desta versão. Amazonitos e pedidos são fictícios.

## Executar localmente

Com Node.js 22 ou superior, na raiz do projeto:

```sh
node demo/build.mjs
node demo/serve.mjs
```

Abra **http://localhost:4173**. Não é necessário `npm install`. Para executar os testes das interações:

```sh
node --test demo/tests/*.test.mjs
```

O build gera somente HTML, CSS, JavaScript, o favicon e as imagens locais em `demo/dist/`. A pasta gerada não contém banco, variáveis de ambiente, dados reais ou código do servidor original.

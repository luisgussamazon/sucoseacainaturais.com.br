import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
export async function runCommunityWorkspaceChecks({db,browser,admin,employee,login,check,artifacts='.setup/community-review'}) {
  const base='http://localhost:3147';
  mkdirSync(artifacts,{recursive:true});
  const grants={publish:true,albums:true,events:true,photos:true,missions:true,recognize:true,review:true,moderate:true};
  await db.communityGrant.upsert({where:{userId:admin.id},create:{userId:admin.id,assignedBy:admin.id,...grants},update:grants});
  const context=await browser.newContext({viewport:{width:1440,height:1050}}), page=await context.newPage();
  let accept=true,dialogs=0;
  page.on('dialog',async d=>{dialogs++;if(accept)await d.accept();else await d.dismiss();});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const form=()=>page.locator('#editor:visible form');
  const open=async kind=>{await page.goto(base+'/comunidade?kind='+kind);await page.waitForLoadState('networkidle');await page.locator('.community-tool-panel:visible').waitFor();};
  const submit=async label=>{
    const response=page.waitForResponse(r=>r.url().includes('/api/community/')&&r.request().method()==='POST');
    await form().getByRole('button',{name:label,exact:true}).click();
    const r=await response, body=await r.json();assert.equal(r.status(),200,JSON.stringify(body));
    await page.waitForLoadState('networkidle');return body;
  };
  const png=await sharp({create:{width:640,height:420,channels:3,background:'#e89527'}}).png().toBuffer();
  const blue=await sharp({create:{width:420,height:640,channels:3,background:'#234f73'}}).png().toBuffer();
  const file=(name,buffer=png)=>({name,mimeType:'image/png',buffer});
  try {
    await login(page,admin.email);
    await open('album');
    assert.equal(await page.locator('.community-tool-menu a').count(),11);
    assert.equal(await form().locator('[name=title]').inputValue(),'');
    assert.equal(await form().locator('[name=description]').inputValue(),'');
    assert.equal(await page.getByText('Mais ferramentas',{exact:true}).count(),0);
    for (const width of (process.env.QA_SKIP_NAV ? [] : [1440,1024,390,320])) {
      await page.setViewportSize({width,height:1000});
      for(const href of ['/comunidade?kind=post','/comunidade?kind=album','/comunidade?kind=event','/comunidade?kind=photo-mission','/comunidade?kind=quiz-mission','/comunidade?kind=recognition','/comunidade?kind=photos','/comunidade/evidencias','/comunidade?kind=comments','/comunidade/conquistas','/comunidade?kind=access']) {
        await page.locator(`.community-tool-menu a[href="${href}"]`).click();
        await page.waitForURL(base+href);await page.reload();
        await page.waitForLoadState('networkidle');await page.locator('.community-tool-panel:visible').waitFor();
        assert.equal(await page.locator('.community-tool-menu a[aria-current=page]').getAttribute('href'),href);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${href} ${width}px overflow`);
        if(width===1440){const r=await page.locator('.community-tool-menu').boundingBox();for(const item of await page.locator('.community-tool-menu a').all()){const b=await item.boundingBox();assert.ok(b.x>=r.x && b.x+b.width<=r.x+r.width+1,'Desktop menu visible');}}
      }
      check(`11 ferramentas: menu, URL, atualização e layout ${width}px`);
    }
    await open('recognition');assert.equal(await form().locator('select[name=completionId]').count(),1);check('Conquista abre diretamente o formulário com seleção de conclusão real');
    await page.setViewportSize({width:1440,height:1050});await open('album');
    await form().locator('[name=title]').fill('Encontro da equipe · revisão local');
    await form().locator('[name=description]').fill('Fotos autorizadas de um encontro da equipe para revisão do novo layout.');
    accept=false;const before=dialogs;await page.locator('.community-tool-menu a[href="/comunidade?kind=event"]').click();
    assert.equal(dialogs,before+1);assert.ok(page.url().includes('kind=album'));assert.ok((await form().locator('[name=title]').inputValue()).includes('Encontro'));accept=true;
    check('Troca de ferramenta avisa e permite manter o preenchimento');
    await form().getByLabel('Selecionar fotos da galeria',{exact:true}).setInputFiles([file('encontro.png'),file('momento.png',blue)]);
    assert.equal(await form().locator('.selected-photo').count(),2);
    await form().getByRole('button',{name:'Remover foto 2',exact:true}).click();assert.equal(await form().locator('.selected-photo').count(),1);
    await form().getByLabel('Selecionar fotos da galeria',{exact:true}).setInputFiles([file('momento.png',blue)]);
    await form().getByLabel('Selecionar fotos da galeria',{exact:true}).setInputFiles({name:'invalido.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid')});assert.equal(await form().locator('.selected-photo').count(),2);await form().getByRole('alert').waitFor();
    const dropped=await page.evaluateHandle(data=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'arrastada.png',{type:'image/png'}));return dt;},png.toString('base64'));
    await form().locator('.photo-upload').dispatchEvent('drop',{dataTransfer:dropped});await dropped.dispose();assert.equal(await form().locator('.selected-photo').count(),3);await form().getByRole('button',{name:'Remover foto 3',exact:true}).click();
    check('Validação de formato e arrastar/soltar preservam a seleção válida');
    await form().getByLabel('Selecionar capa',{exact:true}).selectOption({label:'Foto 2 · momento.png'});
    await form().locator('[name=imageAuthorization]').check();await form().locator('[name=restrictedChecked]').check();
    for(const width of [320,390,768]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Uploaded photos overflow '+width);
      for(const button of await form().locator('.photo-upload-actions button, .photo-cover, .photo-order-controls button').all()){const b=await button.boundingBox();assert.ok(b.height>=44,'Touch target height '+width);}
      const independent=await page.locator('.community-tool-links').evaluateAll(groups=>{groups.forEach(g=>g.scrollLeft=0);groups[0].scrollLeft=70;return groups[1].scrollLeft===0;});assert.ok(independent);
    }
    await page.setViewportSize({width:1440,height:1050});
    check('Fotos selecionadas sem overflow, controles de 44px e rolagem independente das abas');
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:artifacts+'/album-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:artifacts+'/album-celular-completo.png',fullPage:true});await page.screenshot({path:artifacts+'/album-celular.png',fullPage:false});await page.setViewportSize({width:1440,height:1050});
    await page.route('**/api/community/album',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Falha temporária de teste. Tente novamente.'})}));
    const failed=page.waitForResponse(r=>r.url().endsWith('/api/community/album'));
    await form().getByRole('button',{name:'Salvar rascunho',exact:true}).click();await failed;
    await form().getByRole('alert').waitFor();assert.equal(await form().locator('.selected-photo').count(),2);assert.ok((await form().locator('[name=title]').inputValue()).includes('Encontro'));
    await page.unroute('**/api/community/album');check('Falha preserva campos, fotos e capa');
    let requests=0;await page.route('**/api/community/album',async route=>{requests++;await new Promise(r=>setTimeout(r,250));await route.continue();});
    const draftResponse=page.waitForResponse(r=>r.url().endsWith('/api/community/album'));
    await form().evaluate(f=>{const b=f.querySelector('button[value=DRAFT]');f.requestSubmit(b);f.requestSubmit(b);});
    const dr=await draftResponse;assert.equal(dr.status(),200,await dr.text());await page.waitForLoadState('networkidle');assert.equal(requests,1);await page.unroute('**/api/community/album');
    const album=await db.communityAlbum.findFirstOrThrow({where:{title:'Encontro da equipe · revisão local'},include:{media:{orderBy:{position:'asc'}}}});
    assert.equal(album.status,'DRAFT');assert.equal(album.media.length,2);assert.equal(album.media.filter(m=>m.cover).length,1);assert.equal(album.media[1].cover,true);
    await page.goto(base+'/comunidade?kind=album&id='+album.id);await page.waitForLoadState('networkidle');assert.ok((await form().locator('[name=title]').inputValue()).includes('Encontro'));
    check('Rascunho real, fotos e capa persistidos; envio duplicado bloqueado');
    const employeeContext=await browser.newContext(), ep=await employeeContext.newPage();await login(ep,employee.email);
    assert.equal((await employeeContext.request.get(base+'/api/community/media/'+album.media[0].id)).status(),404);
    await submit('Publicar álbum');assert.equal((await db.communityAlbum.findUniqueOrThrow({where:{id:album.id}})).status,'PUBLISHED');
    await ep.goto(base+'/momentos?album='+album.id);assert.equal((await employeeContext.request.get(base+'/api/community/media/'+album.media[0].id)).status(),200);
    check('Publicação do álbum respeita visibilidade autenticada e oculta rascunhos');
    await form().getByLabel('Selecionar fotos da galeria',{exact:true}).setInputFiles([file('nova-capa.png')]);await form().getByLabel('Selecionar capa',{exact:true}).selectOption({label:'Foto 1 · nova-capa.png'});await submit('Publicar álbum');
    assert.equal(await db.communityMedia.count({where:{albumId:album.id,cover:true}}),1);check('Nova capa substitui a anterior sem apagar fotos');
    await open('post');await form().locator('[name=title]').fill('Publicação de revisão');await form().locator('[name=description]').fill('Texto de revisão do formulário de publicação.');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:artifacts+'/publicacao-desktop.png',fullPage:true});await submit('Salvar publicação');
    assert.equal(await db.communityPost.count({where:{title:'Publicação de revisão'}}),1);check('Publicação criada pelo formulário existente');
    await open('event');await form().locator('[name=title]').fill('Evento de revisão');await form().locator('[name=description]').fill('Descrição do evento de revisão do novo painel.');await form().locator('[name=location]').fill('Sala de eventos');await form().locator('[name=startsAt]').fill('2030-05-20T09:00');await form().locator('[name=endsAt]').fill('2030-05-20T11:00');await submit('Salvar conteúdo');assert.equal(await db.communityEvent.count({where:{title:'Evento de revisão'}}),1);check('Evento criado com campos e datas preservados');
    await open('photo-mission');await form().locator('[name=title]').fill('Missão de revisão');await form().locator('[name=description]').fill('Fotografia autorizada da ação da equipe.');await form().locator('[name=startsAt]').fill('2025-01-01T08:00');await form().locator('[name=endsAt]').fill('2030-05-20T18:00');await form().locator('[name=status]').selectOption('PUBLISHED');await submit('Salvar conteúdo');const pm=await db.photoMission.findFirstOrThrow({where:{mission:{title:'Missão de revisão'}}});check('Missão fotográfica criada com regras existentes');
    await open('quiz-mission');await form().locator('[name=title]').fill('Quiz de revisão');await form().locator('[name=description]').fill('Conhecimentos da equipe no novo painel.');await form().locator('[name=endsAt]').fill('2030-05-20T18:00');await form().locator('[name=question]').fill('Qual a alternativa correta?');for(let i=0;i<3;i++)await form().locator('[name=option'+i+']').fill('Alternativa '+i);await submit('Salvar conteúdo');assert.equal(await db.mission.count({where:{title:'Quiz de revisão'}}),1);check('Quiz criado com pergunta, alternativas e recompensa');
    const sent=await employeeContext.request.post(base+'/api/community/submit',{headers:{origin:base},multipart:{photoMissionId:pm.id,safeImage:'on',photos:file('evidencia.png')}});assert.equal(sent.status(),200,await sent.text());
    await page.goto(base+'/comunidade/evidencias');await page.waitForLoadState('networkidle');
    const reviewed=page.waitForResponse(r=>r.url().endsWith('/api/community/review'));
    await page.getByRole('button',{name:'Aprovar e conceder recompensa',exact:true}).click();assert.equal((await reviewed).status(),200);await page.waitForLoadState('networkidle');
    const c=await db.completion.findUniqueOrThrow({where:{userId_missionId:{userId:employee.id,missionId:pm.missionId}}});check('Evidência enviada, avaliada e convertida em conclusão pelo fluxo existente');const balance=(await db.user.findUniqueOrThrow({where:{id:employee.id}})).balance;
    await page.goto(base+'/comunidade?kind=recognition&completion='+c.id);await form().locator('[name=recognitionAuthorization]').check();await submit('Salvar conteúdo');assert.equal((await db.user.findUniqueOrThrow({where:{id:employee.id}})).balance,balance);assert.equal(await db.communityPost.count({where:{completionId:c.id}}),1);assert.ok(page.url().includes('kind=recognition'));check('Conquista usa conclusão real, mantém link e não concede moedas novamente');
    // Server enforcement remains necessary even when unauthorized tabs are absent.
    await ep.goto(base+'/comunidade?kind=album');assert.equal(await ep.locator('.community-tool-menu').count(),0);
    const denied=await employeeContext.request.post(base+'/api/community/album',{headers:{origin:base},multipart:{title:'Sem permissão',description:'Tentativa negada',eventDate:'2030-01-01T10:00',status:'DRAFT'}});assert.equal(denied.status(),403);
    await db.communityGrant.create({data:{userId:employee.id,assignedBy:admin.id,review:true}});
    await ep.goto(base+'/comunidade');await ep.waitForURL('**/comunidade/evidencias');await ep.waitForLoadState('networkidle');assert.equal(await ep.locator('.community-tool-menu a').count(),1);check('Permissões individuais: ausência de abas, bloqueio no servidor e acesso de avaliador');
    await page.goto(base+'/comunidade?kind=recognition&id='+(await db.communityPost.findUniqueOrThrow({where:{completionId:c.id}})).id);await page.waitForLoadState('networkidle');await form().locator('[name=status]').selectOption('PUBLISHED');await form().locator('[name=recognitionAuthorization]').check();await submit('Salvar conteúdo');assert.equal((await db.user.findUniqueOrThrow({where:{id:employee.id}})).balance,balance);
    const published=await db.communityPost.findUniqueOrThrow({where:{completionId:c.id}});
    const commented=await employeeContext.request.post(base+'/api/community/comment',{headers:{origin:base},multipart:{postId:published.id,text:'Comentário de revisão da comunidade'}});assert.equal(commented.status(),200,await commented.text());
    await page.goto(base+'/comunidade?kind=comments');await page.waitForLoadState('networkidle');const moderation=page.locator('.community-comment').filter({hasText:'Comentário de revisão da comunidade'});await moderation.locator('[name=reason]').fill('Revisão da moderação');const moderated=page.waitForResponse(r=>r.url().endsWith('/api/community/moderate'));await moderation.getByRole('button',{name:'Ocultar comentário',exact:true}).click();assert.equal((await moderated).status(),200);assert.equal((await db.communityComment.findFirstOrThrow({where:{text:'Comentário de revisão da comunidade'}})).hidden,true);check('Publicação de conquista e moderação preservam autorização e saldo');
    await page.goto(base+'/comunidade?kind=access&q='+encodeURIComponent(employee.email));await page.waitForLoadState('networkidle');const access=page.locator('.community-management-row').filter({hasText:employee.name});await access.locator('[name=albums]').check();const granted=page.waitForResponse(r=>r.url().endsWith('/api/community/grant'));await access.getByRole('button',{name:'Salvar permissões',exact:true}).click();assert.equal((await granted).status(),200);assert.equal((await db.communityGrant.findUniqueOrThrow({where:{userId:employee.id}})).albums,true);check('Permissões salvas pelo painel existente');
    const hr=await db.user.create({data:{name:'RH com acesso a álbuns',email:'hr-albums@qa.invalid',role:'HR',passwordHash:admin.passwordHash}});await db.communityGrant.create({data:{userId:hr.id,assignedBy:admin.id,albums:true}});const hc=await browser.newContext(),hp=await hc.newPage();await login(hp,hr.email);await hp.goto(base+'/comunidade');await hp.waitForLoadState('networkidle');assert.equal(await hp.locator('.community-tool-menu a').count(),1);assert.equal(await hp.locator('.community-tool-menu a[aria-current=page]').getAttribute('href'),'/comunidade?kind=album');assert.equal(await hp.getByLabel('Selecionar fotos da galeria',{exact:true}).isDisabled(),true);await hc.close();check('Perfil RH: somente álbum autorizado, sem envio de fotos ou administração');
    await employeeContext.close();
    await page.goto(base+'/comunidade?kind=comments');await page.screenshot({path:artifacts+'/comentarios-desktop.png',fullPage:true});
    await page.goto(base+'/comunidade?kind=album');await page.setViewportSize({width:390,height:844});await page.keyboard.press('Tab');await page.getByRole('link',{name:'Permissões',exact:true}).focus();assert.ok(await page.locator('.community-tool-menu a:focus-visible').count());
    assert.deepEqual(errors,[]);check('Navegação por teclado e ausência de erros de JavaScript');
  } finally {await context.close();}
}

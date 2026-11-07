import { CommunityForm, PhotoUpload } from "./community-client";
import { categories } from "@/lib/community-options";
import { photoGuidance } from "@/lib/community";
type Album = {id:string; title:string; description:string; eventDate:Date; category:string; status:string; eventId:string|null; imageAuthorization:boolean|null; restrictedChecked:boolean|null; media:{id:string}[]};
export function AlbumEditor({album,events,photos}:{album?:Album;events:{id:string;title:string}[];photos:boolean}) {
  const iso=(d:Date)=>new Date(d.getTime()-3*3600000).toISOString().slice(0,16);
  return <section className="panel community-creation-editor album-editor" id="editor">
    <header className="community-editor-heading"><h2>{album ? 'Editar álbum' : 'Criar álbum'}</h2><p>Organize as fotos e escolha a capa de um momento especial.</p></header>
    <CommunityForm action="album" key={album?.id ?? 'new'} publishLabel="Publicar álbum" archive={!!album}>
      <input type="hidden" name="id" value={album?.id ?? ''}/>
      <PhotoUpload compact enabled={photos} max={Math.max(0,8-(album?.media.length??0))} existingPhotos={album?.media} editorFields={<>
        <label className="field">Nome do álbum<input name="title" minLength={3} maxLength={150} required defaultValue={album?.title} placeholder="Dê um nome ao seu álbum"/></label>
        <label className="field">Descrição<textarea name="description" minLength={5} maxLength={5000} required defaultValue={album?.description} placeholder="Conte a história deste momento" rows={4}/></label>
        <div className="form-two"><label className="field">Data do momento (Brasília)<input type="datetime-local" name="eventDate" required defaultValue={iso(album?.eventDate??new Date())}/></label>
        <label className="field">Categoria do álbum<select name="category" defaultValue={album?.category??categories[0]}>{Array.from(new Set([...(album ? [album.category]:[]),...categories])).map(c=><option key={c}>{c}</option>)}</select></label></div>
        <label className="field">Evento relacionado<select name="eventId" defaultValue={album?.eventId??''}><option value="">Nenhum</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        {album?.status==='ARCHIVED' && <p className="notice">Este álbum está arquivado. Salve como rascunho ou publique para reativá-lo.</p>}
        <h3>Fotos do álbum</h3>
      </>}/>
      <div className="community-editor-confirmations"><p>{photoGuidance}</p><label className="check"><input type="checkbox" name="imageAuthorization" defaultChecked={album?.imageAuthorization??false}/><span>Confirmo autorização válida para uso de todas as imagens.</span></label><label className="check"><input type="checkbox" name="restrictedChecked" defaultChecked={album?.restrictedChecked??false}/><span>Revisei a ausência de informações restritas.</span></label></div>
    </CommunityForm>
  </section>;
}

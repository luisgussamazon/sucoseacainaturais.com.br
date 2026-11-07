"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { FileText, Images, CalendarDays, Camera, ListChecks, Award, Image, ClipboardCheck, MessageCircle, ShieldCheck, Trophy } from "lucide-react";
const tools = [
  { key: "post", label: "Publicação", Icon: FileText, permission: "publish", group: "CRIAR" },
  { key: "album", label: "Álbum", Icon: Images, permission: "albums", group: "CRIAR" },
  { key: "event", label: "Evento", Icon: CalendarDays, permission: "events", group: "CRIAR" },
  { key: "photo-mission", label: "Missão com foto", Icon: Camera, permission: "missions", group: "CRIAR" },
  { key: "quiz-mission", label: "Quiz", Icon: ListChecks, permission: "missions", group: "CRIAR" },
  { key: "recognition", label: "Conquista", Icon: Award, permission: "recognize", group: "CRIAR" },
  { key: "photos", label: "Fotos", Icon: Image, permission: "photos", group: "GERENCIAR" },
  { key: "evidencias", label: "Evidências pendentes", Icon: ClipboardCheck, permission: "review", group: "GERENCIAR" },
  { key: "comments", label: "Comentários", Icon: MessageCircle, permission: "moderate", group: "GERENCIAR" },
  { key: "conquistas", label: "Conquistas pendentes", Icon: Trophy, permission: "recognize", group: "GERENCIAR" },
  { key: "access", label: "Permissões", Icon: ShieldCheck, permission: "manage", group: "GERENCIAR" },
];
export function CommunityWorkspace({ permissions, children }: { permissions: Record<string, boolean>; children: React.ReactNode }) {
  const path = usePathname(), params = useSearchParams(), root = useRef<HTMLDivElement>(null);
  const available = tools.filter(t => permissions[t.permission]);
  const active = path.endsWith('/evidencias') ? 'evidencias' : path.endsWith('/conquistas') ? 'conquistas' : ((params.has('completion') || params.has('evidence')) ? 'recognition' : available.find(t=>t.key===params.get('kind'))?.key) ?? available[0]?.key;
  useEffect(() => {
    const area = root.current;
    const dirty = () => !!area?.querySelector('form[data-dirty="true"]');
    const confirm = () => window.confirm('Você tem alterações não salvas. Deseja sair e descartar o preenchimento?');
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]');
      if (!link || !dirty() || event.defaultPrevented) return;
      const url = new URL(link.getAttribute('href')!, location.href);
      if (url.href === location.href || (url.pathname === location.pathname && url.search === location.search)) return;
      if (!confirm()) { event.preventDefault(); event.stopPropagation(); }
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
    const submit = (event: Event) => {
      if (!(event.target as Element).matches('.community-form') && dirty() && !confirm()) { event.preventDefault(); event.stopPropagation(); }
    };
    // Navigation API covers browser Back/Forward in supporting browsers.
    const navigation = (window as unknown as {navigation?: EventTarget}).navigation;
    const navigate = (event: Event) => {
      const e=event as Event & {navigationType?:string;canIntercept?:boolean;destination?:{url:string}};
      if(e.navigationType==='traverse' && e.canIntercept && dirty() && !confirm()) e.preventDefault();
    };
    navigation?.addEventListener('navigate', navigate);
    document.addEventListener('submit', submit, true);
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => { navigation?.removeEventListener('navigate', navigate); document.removeEventListener('submit', submit, true); document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => {
    root.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [path, params]);
  return <div ref={root} className="community-workspace">
    <header className="community-workspace-heading"><span>SSD VBJ2 · CONEXÕES QUE INSPIRAM</span><h1>Comunidade e Eventos</h1><p>Crie, compartilhe e cuide dos momentos da nossa comunidade.</p></header>
    <nav className="community-tool-menu" aria-label="Ferramentas de Comunidade e Eventos">
      {['CRIAR', 'GERENCIAR'].map(group => available.some(t => t.group === group) && <div className="community-tool-group" key={group}>
        <h2>{group}</h2><div className="community-tool-links" aria-label={group} role="group">{available.filter(t => t.group === group).map(({key,label,Icon}) => <Link key={key} href={['evidencias','conquistas'].includes(key) ? '/comunidade/'+key : '/comunidade?kind='+key} aria-current={active===key ? 'page' : undefined}><Icon size={18} aria-hidden="true"/><span>{label}</span></Link>)}</div>
      </div>)}
    </nav>
    <div className="community-tool-panel" key={path+'?'+params.toString()}>{children}</div>
  </div>;
}

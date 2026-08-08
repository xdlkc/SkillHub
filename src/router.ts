import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'skills' }
  | { name: 'agents' }
  | { name: 'topics' }
  | { name: 'topic'; tag: string }
  | { name: 'packs' }
  | { name: 'pack'; owner: string }
  | { name: 'official' }
  | { name: 'docs' }
  | { name: 'skill'; id: number }
  | { name: 'notfound' };

export function parseHash(h: string): Route {
  const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  switch (parts[0]) {
    case 'skills': return { name: 'skills' };
    case 'agents': return { name: 'agents' };
    case 'topics': return { name: 'topics' };
    case 'topic': return parts[1] ? { name: 'topic', tag: decodeURIComponent(parts[1]) } : { name: 'topics' };
    case 'packs': return { name: 'packs' };
    case 'pack': return parts[1] ? { name: 'pack', owner: decodeURIComponent(parts[1]) } : { name: 'packs' };
    case 'official': return { name: 'official' };
    case 'docs': return { name: 'docs' };
    case 'skill': {
      const id = Number(parts[1]);
      return Number.isFinite(id) && id > 0 ? { name: 'skill', id } : { name: 'notfound' };
    }
    default: return { name: 'notfound' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  window.location.hash = to;
};

export function routeLabel(r: Route): string {
  switch (r.name) {
    case 'home': return '排行榜';
    case 'skills': return 'Skills';
    case 'agents': return 'Agents';
    case 'topics': return 'Topics';
    case 'topic': return `Topic · ${r.tag}`;
    case 'packs': return 'Packs';
    case 'pack': return `Pack · ${r.owner}`;
    case 'official': return 'Official';
    case 'docs': return 'Docs';
    case 'skill': return '详情';
    default: return '';
  }
}

export function activeTab(r: Route): string | null {
  if (r.name === 'home') return 'home';
  if (r.name === 'skills') return 'skills';
  if (r.name === 'agents') return 'agents';
  if (r.name === 'topic' || r.name === 'topics') return 'topics';
  if (r.name === 'pack' || r.name === 'packs') return 'packs';
  if (r.name === 'official') return 'official';
  if (r.name === 'docs') return 'docs';
  return null;
}

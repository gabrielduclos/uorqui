import { useState } from 'react';
import { X } from 'lucide-react';
import { isCommunityGifUrl } from './CommunityMediaPicker';

/** Display the original text without silently cutting it at a character limit. */
export function replyExcerpt(body: string | null | undefined, deleted: boolean, locale: string) {
  const pt = locale === 'pt-BR';
  if (deleted) return pt ? 'Mensagem excluída' : 'Deleted message';
  const text = (body ?? '').trim();
  if (!text) return pt ? 'Mídia ou arquivo' : 'Media or file';
  if (isCommunityGifUrl(body ?? null)) return 'GIF';
  return text.replace(/\s+/g, ' ');
}

type ReferenceProps = {
  author: string;
  body?: string | null;
  deleted?: boolean;
  locale: string;
  onJump: () => void;
};

/** Compact reply with a readable multiline preview and optional full expansion. */
export function ReplyReference({ author, body, deleted = false, locale, onJump }: ReferenceProps) {
  const [expanded, setExpanded] = useState(false);
  const excerpt = replyExcerpt(body, deleted, locale);
  const pt = locale === 'pt-BR';
  const canExpand = !deleted && excerpt.length > 64;
  return <div className="uorqui-reply-reference" role="group"
    aria-label={pt ? 'Referência à mensagem original' : 'Original message reference'}>
    <span aria-hidden="true" className="uorqui-reply-reference__connector"/>
    <div className="uorqui-reply-reference__content">
      <button type="button" className="uorqui-reply-reference__link" data-expanded={expanded ? 'true' : 'false'} onClick={onJump}
        aria-label={(pt ? 'Ir para mensagem de ' : 'Jump to message from ') + author}>
        <strong className="uorqui-reply-reference__author">{author}:</strong>{' '}
        <span className="uorqui-reply-reference__excerpt">{excerpt}</span>
      </button>
      {canExpand && <button type="button" className="uorqui-reply-reference__toggle"
        onClick={() => setExpanded(previous => !previous)}
        aria-expanded={expanded}>
        {expanded ? (pt ? 'Mostrar menos' : 'Show less') : (pt ? 'Ler mais' : 'Read more')}
      </button>}
    </div>
  </div>;
}

/** The same author-then-preview reading order above either type of composer. */
export function ReplyComposerPreview({ author, body, deleted = false, locale, onCancel }: {
  author: string;
  body?: string | null;
  deleted?: boolean;
  locale: string;
  onCancel: () => void;
}) {
  const pt = locale === 'pt-BR';
  const [expanded, setExpanded] = useState(false);
  const excerpt = replyExcerpt(body, deleted, locale);
  const canExpand = !deleted && excerpt.length > 45;
  return <div className="uorqui-reply-draft mb-2 flex min-w-0 items-start gap-2 px-2.5 py-2 text-xs">
    <span className="uorqui-reply-reference__connector" aria-hidden="true"/>
    <div className="min-w-0 flex-1">
      <div className="uorqui-reply-draft__line" data-expanded={expanded ? 'true' : 'false'}>
        <strong className="uorqui-reply-draft__author">{pt ? 'Respondendo a ' : 'Replying to '}{author}:</strong>{' '}
        <span className="uorqui-reply-draft__preview">{excerpt}</span>
      </div>
      {canExpand && <button type="button" className="uorqui-reply-reference__toggle"
        onClick={() => setExpanded(previous => !previous)}
        aria-expanded={expanded}>
        {expanded ? (pt ? 'Mostrar menos' : 'Show less') : (pt ? 'Ler mais' : 'Read more')}
      </button>}
    </div>
    <button type="button" onClick={onCancel} aria-label={pt ? 'Cancelar resposta' : 'Cancel reply'}
      className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
      <X className="size-4"/>
    </button>
  </div>;
}

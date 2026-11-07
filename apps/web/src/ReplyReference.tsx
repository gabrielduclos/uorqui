import { CornerDownRight, X } from 'lucide-react';
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
  onJump?: () => void;
};

/** One-line channel reply reference. The full original opens via onJump. */
export function ReplyReference({ author, body, deleted = false, locale, onJump }: ReferenceProps) {
  const excerpt = replyExcerpt(body, deleted, locale);
  const pt = locale === 'pt-BR';
  const label = <>
    <strong className="uorqui-reply-reference__author">{author}:</strong>
    <span className="uorqui-reply-reference__excerpt">{excerpt}</span>
  </>;
  return <div className="uorqui-reply-reference" role={onJump ? 'group' : 'note'}
    aria-label={pt ? 'Referência à mensagem original' : 'Original message reference'}>
    <CornerDownRight aria-hidden="true" className="uorqui-reply-reference__connector"/>
    {onJump
      ? <button type="button" className="uorqui-reply-reference__link" onClick={onJump}
          title={author + ': ' + excerpt}
          aria-label={(pt ? 'Ir para mensagem de ' : 'Jump to message from ') + author}>{label}</button>
      : <span className="uorqui-reply-reference__link uorqui-reply-reference--legacy"
          title={author + ': ' + excerpt}>{label}</span>}
  </div>;
}

/** One-line channel reply context above the composer. */
export function ReplyComposerPreview({ author, body, deleted = false, locale, onCancel }: {
  author: string;
  body?: string | null;
  deleted?: boolean;
  locale: string;
  onCancel: () => void;
}) {
  const pt = locale === 'pt-BR';
  const excerpt = replyExcerpt(body, deleted, locale);
  return <div className="uorqui-reply-draft mb-2 flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-xs">
    <CornerDownRight className="uorqui-reply-reference__connector" aria-hidden="true"/>
    <div className="uorqui-reply-draft__line min-w-0 flex-1" title={author + ': ' + excerpt}>
      <strong className="uorqui-reply-draft__author">{author}:</strong>
      <span className="uorqui-reply-draft__preview">{excerpt}</span>
    </div>
    <button type="button" onClick={onCancel} aria-label={pt ? 'Cancelar resposta' : 'Cancel reply'}
      className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
      <X className="size-4"/>
    </button>
  </div>;
}

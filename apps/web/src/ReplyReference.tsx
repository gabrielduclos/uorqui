import { X } from 'lucide-react';
import { isCommunityGifUrl } from './CommunityMediaPicker';

/** A single-line reference shared by channel messages and direct chats. */
export function replyExcerpt(body: string | null | undefined, deleted: boolean, locale: string) {
  const pt = locale === 'pt-BR';
  if (deleted) return pt ? 'Mensagem excluída' : 'Deleted message';
  const text = (body ?? '').trim();
  if (!text) return pt ? 'Mídia ou arquivo' : 'Media or file';
  if (isCommunityGifUrl(text)) return 'GIF';
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

type ReferenceProps = {
  author: string;
  body?: string | null;
  deleted?: boolean;
  locale: string;
  onJump: () => void;
};

/** Discord-style reply context: connector + author + one-line snippet, no nested card. */
export function ReplyReference({ author, body, deleted = false, locale, onJump }: ReferenceProps) {
  const excerpt = replyExcerpt(body, deleted, locale);
  return <button type="button" className="uorqui-reply-reference"
    onClick={onJump} aria-label={(locale === 'pt-BR' ? 'Ir para mensagem de ' : 'Jump to message from ') + author + ': ' + excerpt}
    title={excerpt}>
    <span aria-hidden="true" className="uorqui-reply-reference__connector"/>
    <strong className="uorqui-reply-reference__author">{author}</strong>
    <span aria-hidden="true" className="uorqui-reply-reference__excerpt">{excerpt}</span>
  </button>;
}

/** Compact, dismissible context above either type of message composer. */
export function ReplyComposerPreview({ author, body, deleted = false, locale, onCancel }: {
  author: string;
  body?: string | null;
  deleted?: boolean;
  locale: string;
  onCancel: () => void;
}) {
  const pt = locale === 'pt-BR';
  return <div className="uorqui-reply-draft mb-2 flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-xs">
    <span className="uorqui-reply-reference__connector" aria-hidden="true"/>
    <div className="min-w-0 flex flex-1 items-center gap-1.5">
      <span className="min-w-0 max-w-[62%] truncate font-semibold">{pt ? 'Respondendo a' : 'Replying to'} <strong>{author}</strong></span>
      <span className="uorqui-reply-draft__preview min-w-0 flex-1 truncate">{replyExcerpt(body, deleted, locale)}</span>
    </div>
    <button type="button" onClick={onCancel} aria-label={pt ? 'Cancelar resposta' : 'Cancel reply'}
      className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
      <X className="size-4"/>
    </button>
  </div>;
}

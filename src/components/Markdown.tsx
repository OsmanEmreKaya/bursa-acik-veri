import { Fragment, type ReactNode } from "react";

// LLM yanıtları için küçük, güvenli bir Markdown alt kümesi:
// paragraflar, madde/numara listeleri, **kalın**, *italik*, `kod` ve bağlantılar.
// HTML hiçbir zaman doğrudan basılmaz.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(<a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>);
    } else if (t.startsWith("http")) out.push(<a key={key} href={t} target="_blank" rel="noreferrer">bağlantı</a>);
    else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(
        <p key={k}>
          {para.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l, `${k}-${i}`)}
            </Fragment>
          ))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(<p key={`h${blocks.length}`}><strong>{inline(heading[1], `h${blocks.length}`)}</strong></p>);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks}</div>;
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { faqItems } from '../src/pages/faqContent';

// The server puts this into /faq's HTML for crawlers that don't run JavaScript; it lives outside dist so it's never served on its own.
const html = faqItems
  .map((item) => `<h2>${renderToStaticMarkup(<>{item.question}</>)}</h2>\n<div>${renderToStaticMarkup(<>{item.answer}</>)}</div>`)
  .join('\n')
  .replace(/ style="[^"]*"/g, '');

mkdirSync('dist-prerender', { recursive: true });
writeFileSync('dist-prerender/faq.html', html + '\n');

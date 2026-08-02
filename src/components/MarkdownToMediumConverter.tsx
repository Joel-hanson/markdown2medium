"use client"

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/hooks/use-toast";
import DOMPurify from 'dompurify';
import html2canvas from 'html2canvas';
import {
    Check,
    ChevronDown,
    Code2,
    Copy,
    Download,
    Eye,
    Github,
    HelpCircle,
    Info,
    Loader2,
    Maximize,
    X
} from 'lucide-react';
import { marked } from 'marked';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

type TableMode = 'plain' | 'image' | 'gist';

interface TableData {
    id: string;
    content: string;
    filename: string;
}

interface TableImage {
    dataUrl: string;
    tableIndex: string;
}

const SAMPLE_MARKDOWN = `# Your Medium draft

Write in Markdown, then copy and paste into Medium.

## Formatting that works

**Bold**, *italic*, and [links](https://medium.com) all come through.

> Blockquotes look like this.

\`\`\`javascript
function hello() {
  return "Hello, Medium";
}
\`\`\`

### Nested section

Medium only has two heading styles. Your top heading level becomes Header (large T); the next level down becomes Subheader (small T).

### Tables

Medium does not support HTML tables. By default they paste as readable text:

| Feature | Works |
| ------- | ----- |
| Headings | Yes |
| Lists | Yes |
| Code | Yes |
| Tables | As text |

Start editing, or clear this and paste your own Markdown.
`;

const stripFrontmatter = (content: string): string =>
    content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

const isMarkdownTableSeparator = (line: string): boolean =>
    /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line.trim());

const extractTablesFromMarkdown = (markdownText: string): string[][] => {
    const lines = markdownText.split('\n');
    const tables: string[][] = [];
    let currentTable: string[] = [];
    let inTable = false;
    let inFence = false;

    const flushTable = () => {
        if (
            currentTable.length >= 2 &&
            currentTable.some(isMarkdownTableSeparator)
        ) {
            tables.push([...currentTable]);
        }
        currentTable = [];
        inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
            if (inTable) flushTable();
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;

        if (trimmed.includes('|')) {
            if (!inTable) {
                inTable = true;
                currentTable = [];
            }
            currentTable.push(trimmed);
        } else if (inTable) {
            flushTable();
        }
    }

    if (inTable) flushTable();
    return tables;
};

const parseMarkdownTableRows = (tableRows: string[]): string[][] =>
    tableRows
        .map((row) => row.trim())
        .filter((row) => row.length > 0 && !/^\|?\s*[-:| ]+\s*\|?$/.test(row))
        .map((row) =>
            row
                .replace(/^\||\|$/g, '')
                .split('|')
                .map((cell) => cell.trim())
        );

const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const isUsableImageSrc = (src: string): boolean => {
    const value = src.trim();
    if (!value) return false;
    if (/^(javascript|data|blob|vbscript):/i.test(value)) return false;
    if (/^https?:\/\//i.test(value)) return true;
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true;
    // Relative path without a scheme (e.g. images/cover.png)
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
    return false;
};

/** Plain text for labels / image-mode table cells. */
const stripCellMarkdown = (cell: string): string =>
    cell
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/(^|[\s(])_([^_]+)_([\s).,!?]|$)/g, '$1$2$3')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

/** Keep links, bold, italic, and code in table cells as HTML. */
const cellMarkdownToHtml = (cell: string): string => {
    let s = cell.trim();
    if (!s) return '';

    const tokens: string[] = [];
    const stash = (html: string): string => {
        tokens.push(html);
        return `\u0000${tokens.length - 1}\u0000`;
    };

    s = s.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_m, alt: string, src: string) => {
        const label = (alt || 'Image').trim();
        if (!isUsableImageSrc(src)) {
            return stash(`<em>[${escapeHtml(label)}]</em>`);
        }
        return stash(
            `<img src="${escapeHtml(src.trim())}" alt="${escapeHtml(label)}" />`
        );
    });

    s = s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_m, text: string, href: string) => {
        const label = text.trim();
        const url = href.trim();
        if (!url) return escapeHtml(label);
        return stash(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, (_m, text: string) =>
        stash(`<strong>${escapeHtml(text)}</strong>`)
    );
    s = s.replace(/__([^_]+)__/g, (_m, text: string) =>
        stash(`<strong>${escapeHtml(text)}</strong>`)
    );
    s = s.replace(/\*([^*]+)\*/g, (_m, text: string) =>
        stash(`<em>${escapeHtml(text)}</em>`)
    );
    s = s.replace(/(^|[\s(])_([^_]+)_([\s).,!?]|$)/g, (_m, before: string, text: string, after: string) =>
        `${before}${stash(`<em>${escapeHtml(text)}</em>`)}${after}`
    );
    s = s.replace(/`([^`]+)`/g, (_m, text: string) =>
        stash(`<code>${escapeHtml(text)}</code>`)
    );

    s = escapeHtml(s);
    s = s.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => tokens[Number(index)] || '');
    return s;
};

const imageMissingPlaceholder = (alt: string): string =>
    `<p class="image-missing"><em>[${escapeHtml(alt || 'Image unavailable')}]</em></p>`;

/** Replace empty / data / unusable images with a readable placeholder. */
const normalizeDocumentImages = (html: string): string =>
    html.replace(/<img\b([^>]*)\/?>/gi, (_match, attrs: string) => {
        const src = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const alt = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const srcValue = (src?.[1] || src?.[2] || src?.[3] || '').trim();
        const altValue = (alt?.[1] || alt?.[2] || alt?.[3] || 'Image unavailable').trim();

        if (!isUsableImageSrc(srcValue)) {
            return imageMissingPlaceholder(altValue);
        }

        return `<img src="${escapeHtml(srcValue)}" alt="${escapeHtml(altValue)}" class="graf graf--image" />`;
    });

/**
 * Medium can't show HTML tables, and wide ASCII grids truncate in code blocks.
 * Emit stacked paragraphs that read cleanly and wrap on Medium.
 */
const formatTableAsMediumHtml = (rows: string[][]): string => {
    if (!rows.length) return '';

    const headers = rows[0].map(stripCellMarkdown);
    const rawBody = rows.slice(1);

    if (!rawBody.length) return '';

    // Two columns → bold label + description (most common Medium case)
    if (headers.length === 2) {
        return rawBody
            .map((row) => {
                const key = cellMarkdownToHtml(row[0] || '');
                const val = cellMarkdownToHtml(row[1] || '');
                if (!key && !val) return '';
                if (!val) return `<p class="table-row"><span class="table-row-label">${key}</span></p>`;
                return `<p class="table-row"><span class="table-row-label">${key}</span><br>${val}</p>`;
            })
            .filter(Boolean)
            .join('\n');
    }

    // 3+ columns → labeled lines per row
    return rawBody
        .map((row) => {
            const lines = headers
                .map((header, i) => {
                    const value = cellMarkdownToHtml(row[i] || '');
                    if (!value) return '';
                    return `<strong>${escapeHtml(header)}:</strong> ${value}`;
                })
                .filter(Boolean);
            if (!lines.length) return '';
            return `<p>${lines.join('<br>')}</p>`;
        })
        .filter(Boolean)
        .join('\n');
};

const markdownTableToPlainHtml = (tableRows: string[]): string =>
    formatTableAsMediumHtml(parseMarkdownTableRows(tableRows));

const replaceTablesWithPlain = (html: string, tables: string[][]): string => {
    let tableIndex = 0;
    return html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, () => {
        const tableRows = tables[tableIndex++];
        if (!tableRows) return '';
        return markdownTableToPlainHtml(tableRows);
    });
};

const processTablesForGist = (tables: string[][]): TableData[] =>
    tables.map((tableRows, index) => ({
        id: `table-${index + 1}`,
        content: tableRows.join('\n'),
        filename: `table-${index + 1}.md`,
    }));

const createTableHtml = (tableRows: string[]): string => {
    if (!tableRows || tableRows.length < 2) return '';

    const rows = parseMarkdownTableRows(tableRows).map((row) =>
        row.map(stripCellMarkdown)
    );
    if (rows.length < 1) return '';

    const headerRow = rows[0];
    let html = '<table><thead><tr>';
    headerRow.forEach((cell) => {
        html += `<th>${escapeHtml(cell)}</th>`;
    });
    html += '</tr></thead><tbody>';

    for (let i = 1; i < rows.length; i++) {
        html += '<tr>';
        headerRow.forEach((_, col) => {
            html += `<td>${escapeHtml(rows[i][col] || '')}</td>`;
        });
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
};

const generateGistPlaceholder = (tableIndex: number): string => `
<div class="gist-embed-placeholder rounded border border-dashed border-neutral-300 bg-neutral-50 p-4 my-6 text-center">
  <p class="font-medium text-neutral-800 m-0"><strong>Table ${tableIndex}</strong> — create a GitHub Gist</p>
  <p class="text-sm text-neutral-500 mt-2 mb-0">Replace this placeholder with a Gist embed after creating it.</p>
</div>`;

const convertTableToImage = async (tableHtml: string, tableIndex: string): Promise<TableImage | null> => {
    try {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.padding = '20px';
        container.style.background = 'white';
        container.style.width = '800px';
        container.style.fontFamily = 'Arial, sans-serif';
        container.innerHTML = `
            <style>
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; font-weight: bold; }
                tr:nth-child(even) { background-color: #f9f9f9; }
            </style>
            ${tableHtml}
        `;

        document.body.appendChild(container);
        const canvas = await html2canvas(container);
        document.body.removeChild(container);

        return {
            dataUrl: canvas.toDataURL('image/png'),
            tableIndex,
        };
    } catch (error) {
        console.error('Error converting table to image:', error);
        return null;
    }
};

// Medium splits a single <pre> into multiple code blocks when it sees blank
// lines inside. Replace empty lines with a non-breaking space so paste stays one block.
const preserveCodeBlockBlankLines = (html: string): string =>
    html.replace(/<pre(\b[^>]*)>([\s\S]*?)<\/pre>/gi, (_match, attrs: string, content: string) => {
        const fixed = content
            .split('\n')
            .map((line) => (line.trim() === '' ? '&nbsp;' : line))
            .join('\n');
        return `<pre${attrs}>${fixed}</pre>`;
    });

const applyMediumClasses = (html: string): string =>
    html
        .replace(/<h1/g, '<h1 class="graf graf--h1"')
        .replace(/<h2/g, '<h2 class="graf graf--h2"')
        .replace(/<h3/g, '<h3 class="graf graf--h3"')
        .replace(/<p>/g, '<p class="graf graf--p">')
        .replace(/<blockquote>/g, '<blockquote class="graf graf--blockquote">')
        .replace(/<pre>/g, '<pre class="graf graf--pre">')
        .replace(/<code/g, '<code class="markup--code markup--pre-code"')
        .replace(/<ul>/g, '<ul class="postList graf graf--ul">')
        .replace(/<li>/g, '<li class="graf graf--li">')
        .replace(/<strong>/g, '<strong class="markup--strong markup--p-strong">')
        .replace(/<em>/g, '<em class="markup--em markup--p-em">')
        .replace(/<img/g, '<img class="graf graf--image"');

/**
 * Medium only has two heading styles in the editor:
 *   large T (Header)  ← pasted as h1
 *   small T (Subheader) ← pasted as h4
 * (Pasted h2/h3 are collapsed into Header, same as h1.)
 *
 * Map the shallowest heading level in the doc to Header, and deeper
 * levels to Subheader — so both `#`/`##` and `##`/`###` documents work.
 */
const remapHeadingsForMediumPaste = (root: ParentNode): void => {
    const headings = Array.from(
        root.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ) as HTMLHeadingElement[];

    if (headings.length === 0) return;

    const levels = headings.map((el) => Number(el.tagName.charAt(1)));
    const topLevel = Math.min(...levels);

    headings.forEach((el) => {
        const level = Number(el.tagName.charAt(1));
        const tag = level === topLevel ? 'h1' : 'h4';
        if (el.tagName.toLowerCase() === tag) return;

        const replacement = document.createElement(tag);
        replacement.innerHTML = el.innerHTML;
        el.replaceWith(replacement);
    });
};

const parseStoredTableMode = (value: string | null): TableMode => {
    if (value === 'image' || value === 'gist' || value === 'plain') return value;
    if (value === 'html') return 'plain';
    return 'plain';
};

const MarkdownToMediumConverter: React.FC = () => {
    const [markdown, setMarkdown] = useState<string>('');
    const [htmlOutput, setHtmlOutput] = useState<string>('');
    const [mobileTab, setMobileTab] = useState<string>('editor');
    const [wordCount, setWordCount] = useState<number>(0);
    const [addMediumClasses, setAddMediumClasses] = useState<boolean>(true);
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
    const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
    const [showQuickGuide, setShowQuickGuide] = useState<boolean>(false);
    const [showGistInstructions, setShowGistInstructions] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    const [isCopying, setIsCopying] = useState<boolean>(false);
    const [isConverting, setIsConverting] = useState<boolean>(false);
    const [tableMode, setTableMode] = useState<TableMode>('plain');
    const [tableData, setTableData] = useState<TableData[]>([]);
    const [isPending, startTransition] = useTransition();
    const previewRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const hasTables = useMemo(
        () => extractTablesFromMarkdown(stripFrontmatter(markdown)).length > 0,
        [markdown]
    );

    const tableTip = useMemo(() => {
        if (!hasTables) return null;
        if (tableMode === 'image') {
            return 'Preview shows tables as images. Copy for Medium still pastes them as readable text — Medium rejects embedded images.';
        }
        if (tableMode === 'gist') {
            return 'Preview shows Gist placeholders. Copy pastes tables as readable text; use the Gist helper to embed them on Medium.';
        }
        return "Medium doesn't support tables — they'll paste as readable text (not a grid).";
    }, [hasTables, tableMode]);

    const openNewPagePreview = (): void => {
        const cleanHtml = htmlOutput.replace(/^<div>|<\/div>$/g, '');
        const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Medium Post Preview</title>
          <style>
            body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #fff; color: #242424; }
            main { max-width: 680px; margin: 0 auto; padding: 2rem 1.25rem; }
            .graf--h1 { font-size: 2.5rem; line-height: 1.2; margin: 2rem 0; font-weight: 700; }
            .graf--h2 { font-size: 2rem; margin: 1.8rem 0; font-weight: 600; }
            .graf--h3 { font-size: 1.5rem; margin: 1.4rem 0; font-weight: 600; }
            .graf--p { font-size: 1.25rem; line-height: 1.7; margin: 1.5rem 0; }
            .graf--blockquote { border-left: 3px solid #242424; padding-left: 1.25rem; margin: 2rem 0; color: #6b6b6b; font-style: italic; }
            .graf--pre { background: #f2f2f2; padding: 1.25rem; border-radius: 4px; overflow: auto; font-family: ui-monospace, monospace; font-size: 0.9rem; }
            .graf--li { margin: 0.35rem 0; }
            .postList { padding-left: 1.5rem; }
            .graf--image { max-width: 100%; height: auto; margin: 2rem 0; }
            table { border-collapse: collapse; width: 100%; margin: 2rem 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <main>${cleanHtml}</main>
        </body>
      </html>
    `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
            newWindow.onload = () => URL.revokeObjectURL(url);
        }
    };

    const convertMarkdown = useCallback(async (content: string): Promise<{ html: string; tables: TableData[] }> => {
        try {
            if (!content) return { html: '', tables: [] };

            const processed = stripFrontmatter(content);
            let html = await marked.parse(processed);
            const extracted = extractTablesFromMarkdown(processed);
            const tables = extracted.length > 0 ? processTablesForGist(extracted) : [];

            if (extracted.length > 0) {
                if (tableMode === 'plain') {
                    html = replaceTablesWithPlain(html, extracted);
                } else if (tableMode === 'gist') {
                    let tableIndex = 0;
                    html = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, () =>
                        generateGistPlaceholder(++tableIndex)
                    );
                } else if (tableMode === 'image') {
                    const images = await Promise.all(
                        tables.map((table) =>
                            convertTableToImage(createTableHtml(table.content.split('\n')), table.id)
                        )
                    );

                    let imageIndex = 0;
                    html = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, () => {
                        const image = images[imageIndex++];
                        if (!image) return '';
                        return `<div class="table-image-container">
                            <img src="${image.dataUrl}" alt="Table ${image.tableIndex}" class="graf graf--image" />
                        </div>`;
                    });
                }
            }

            if (addMediumClasses) {
                html = applyMediumClasses(html);
            }

            html = preserveCodeBlockBlankLines(html);
            html = normalizeDocumentImages(html);
            return { html: DOMPurify.sanitize(html), tables };
        } catch (error) {
            console.error('Error parsing markdown:', error);
            return { html: '<div class="text-red-500">Error parsing markdown</div>', tables: [] };
        }
    }, [addMediumClasses, tableMode]);

    useEffect(() => {
        const firstVisit = localStorage.getItem('firstVisit') == null;
        if (firstVisit) {
            localStorage.setItem('firstVisit', 'false');
            setShowOnboarding(true);
            setMarkdown(SAMPLE_MARKDOWN);
        }

        setTableMode(parseStoredTableMode(localStorage.getItem('tablehandlingMethod')));
    }, []);

    useEffect(() => {
        localStorage.setItem('tablehandlingMethod', tableMode);
    }, [tableMode]);

    useEffect(() => {
        const words = markdown.trim() ? markdown.split(/\s+/).length : 0;
        setWordCount(words);

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            setIsConverting(true);
            try {
                const { html, tables } = await convertMarkdown(markdown);
                if (cancelled) return;
                startTransition(() => {
                    setTableData(tables);
                    setHtmlOutput(html);
                });
            } finally {
                if (!cancelled) setIsConverting(false);
            }
        }, 180);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [markdown, convertMarkdown]);

    // Replace broken preview images with a readable placeholder
    useEffect(() => {
        const root = previewRef.current;
        if (!root) return;

        const handleError = (event: Event) => {
            const img = event.target as HTMLImageElement;
            if (!img || img.tagName !== 'IMG' || img.dataset.failed === '1') return;
            img.dataset.failed = '1';
            const alt = img.getAttribute('alt')?.trim() || 'Image unavailable';
            const placeholder = document.createElement('p');
            placeholder.className = 'image-missing';
            placeholder.innerHTML = `<em>[${escapeHtml(alt)}]</em>`;
            img.replaceWith(placeholder);
        };

        const images = Array.from(root.querySelectorAll('img'));
        images.forEach((img) => {
            img.addEventListener('error', handleError);
            if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
                handleError({ target: img } as unknown as Event);
            }
        });

        return () => {
            images.forEach((img) => img.removeEventListener('error', handleError));
        };
    }, [htmlOutput]);

    const downloadHtml = useCallback((): void => {
        const blob = new Blob([htmlOutput], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'medium-post.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [htmlOutput]);

    const loadSample = useCallback((): void => {
        setMarkdown(SAMPLE_MARKDOWN);
    }, []);

    const clearEditor = useCallback((): void => {
        setMarkdown('');
    }, []);

    // Copy uses stacked plain paragraphs for tables — Medium rejects HTML tables and data: images
    const prepareHtmlForMediumPaste = useCallback(async (content: string): Promise<string> => {
        if (!content) return '';

        const processed = stripFrontmatter(content);
        let html = await marked.parse(processed);
        const tables = extractTablesFromMarkdown(processed);
        html = replaceTablesWithPlain(html, tables);
        html = preserveCodeBlockBlankLines(html);
        html = normalizeDocumentImages(html);
        html = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr',
                'strong', 'b', 'em', 'i', 'u', 'a',
                'ul', 'ol', 'li',
                'blockquote', 'pre', 'code',
                'img', 'figure', 'figcaption',
                'span',
            ],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
            ALLOW_DATA_ATTR: false,
        });

        const container = document.createElement('div');
        container.innerHTML = html;

        remapHeadingsForMediumPaste(container);

        container.querySelectorAll('img').forEach((img) => {
            const src = (img.getAttribute('src') || '').trim();
            const alt = (img.getAttribute('alt') || 'Image unavailable').trim();
            if (!isUsableImageSrc(src)) {
                const placeholder = document.createElement('p');
                placeholder.innerHTML = `<em>[${escapeHtml(alt)}]</em>`;
                img.replaceWith(placeholder);
            }
        });

        container.querySelectorAll('p, blockquote, li').forEach((el) => {
            if (!el.textContent?.trim() && !el.querySelector('img')) {
                el.remove();
            }
        });

        container.querySelectorAll('blockquote').forEach((quote) => {
            const onlyChild = quote.children.length === 1 ? quote.children[0] : null;
            if (onlyChild && onlyChild.tagName === 'P') {
                quote.innerHTML = onlyChild.innerHTML;
            }
        });

        return container.innerHTML;
    }, []);

    const copyRichContentFallback = (html: string): boolean => {
        const container = document.createElement('div');
        container.innerHTML = html;
        container.setAttribute('contenteditable', 'true');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        document.body.appendChild(container);

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(container);
        selection?.removeAllRanges();
        selection?.addRange(range);

        let success = false;
        try {
            success = document.execCommand('copy');
        } catch {
            success = false;
        }

        selection?.removeAllRanges();
        document.body.removeChild(container);
        return success;
    };

    const copyHtmlToClipboard = useCallback(async (): Promise<void> => {
        if (!markdown.trim() || isCopying) return;

        setIsCopying(true);
        try {
            const pasteHtml = await prepareHtmlForMediumPaste(markdown);
            if (!pasteHtml) return;

            const temp = document.createElement('div');
            temp.innerHTML = pasteHtml;
            const plainText = temp.textContent || temp.innerText || '';

            let success = false;

            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([pasteHtml], { type: 'text/html' }),
                        'text/plain': new Blob([plainText], { type: 'text/plain' }),
                    }),
                ]);
                success = true;
            } catch {
                success = copyRichContentFallback(pasteHtml);
            }

            if (success) {
                setCopied(true);
                let description = "Paste into Medium with Cmd/Ctrl+V.";
                if (hasTables) {
                    if (tableMode === 'image') {
                        description = "Tables pasted as readable text (Medium rejects embedded images). Use Download HTML if you need the image versions.";
                    } else if (tableMode === 'gist') {
                        description = "Tables pasted as readable text. Use the Gist helper if you want to embed them.";
                    } else {
                        description = "Paste into Medium (Cmd/Ctrl+V). Tables paste as readable text.";
                    }
                }
                toast({
                    title: "Copied for Medium",
                    description,
                    duration: 4500,
                });
                setTimeout(() => setCopied(false), 2000);
            } else {
                toast({
                    title: "Copy failed",
                    description: "Could not copy. Try Full Preview and copy from there.",
                    variant: "destructive",
                    duration: 4000,
                });
            }
        } finally {
            setIsCopying(false);
        }
    }, [markdown, prepareHtmlForMediumPaste, toast, hasTables, tableMode, isCopying]);

    const downloadTableAsMarkdown = (tableContent: string, filename: string): void => {
        const blob = new Blob([tableContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const createGistForTable = useCallback((tableIndex: number): void => {
        if (!tableData[tableIndex]) return;
        const table = tableData[tableIndex];

        navigator.clipboard.writeText(table.content).then(() => {
            toast({
                title: "Table content copied",
                description: `Table ${tableIndex + 1} is ready to paste into a new GitHub Gist`,
                duration: 4000,
            });
        });

        window.open('https://gist.github.com/', '_blank');
    }, [tableData, toast]);

    const openGistHelper = useCallback((): void => {
        if (!tableData.length) {
            toast({
                title: "No tables found",
                description: "Add a Markdown table first",
                variant: "destructive",
                duration: 3000,
            });
            return;
        }
        setShowGistInstructions(true);
    }, [tableData, toast]);

    const editorPane = (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-sm">
            <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Code2 className="h-4 w-4 text-muted-foreground" />
                    Markdown
                </CardTitle>
                <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={loadSample}>
                        Sample
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearEditor}>
                        <X />
                        Clear
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
                <Textarea
                    placeholder="Paste or write your Markdown here…"
                    className="h-full min-h-0 resize-none rounded-none border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                />
            </CardContent>
            {tableTip ? (
                <CardFooter className="shrink-0 animate-in fade-in slide-in-from-bottom-1 border-t px-4 py-3 duration-200">
                    <Alert className="w-full py-2">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-muted-foreground">
                            {tableTip}{' '}
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(true)}
                                className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
                            >
                                Change in Advanced
                            </button>
                        </AlertDescription>
                    </Alert>
                </CardFooter>
            ) : null}
        </Card>
    );

    const previewUpdating = isConverting || isPending;

    const previewPane = (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-sm transition-shadow duration-200">
            <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    Preview
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {previewUpdating && (
                        <span className="inline-flex items-center gap-1.5 animate-in fade-in duration-200">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Updating
                        </span>
                    )}
                    <span className="tabular-nums">
                        {wordCount} {wordCount === 1 ? 'word' : 'words'}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
                <div
                    ref={previewRef}
                    className={`transition-opacity duration-300 ease-out ${
                        previewUpdating ? 'opacity-50' : 'opacity-100'
                    }`}
                >
                    {htmlOutput ? (
                        <div
                            className="prose prose-neutral max-w-none text-[1.05rem] leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
                            dangerouslySetInnerHTML={{ __html: htmlOutput }}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">Preview appears here as you type.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-muted/40 text-foreground">
            <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Markdown → Medium</DialogTitle>
                        <DialogDescription className="pt-2 text-left">
                            Write in Markdown, copy, then paste into Medium. That&apos;s it.
                        </DialogDescription>
                    </DialogHeader>
                    <ol className="list-decimal space-y-3 py-2 pl-5 text-sm text-muted-foreground">
                        <li>Paste or write your Markdown on the left.</li>
                        <li>Check the preview on the right.</li>
                        <li>Click <span className="font-medium text-foreground">Copy for Medium</span>, then paste in Medium.</li>
                    </ol>
                    <DialogFooter>
                        <Button onClick={() => setShowOnboarding(false)} className="w-full">
                            Get started
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showQuickGuide} onOpenChange={setShowQuickGuide}>
                <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Markdown reference</DialogTitle>
                        <DialogDescription>
                            Common syntax you can use in the editor
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-6 py-2 md:grid-cols-2">
                        <div>
                            <h3 className="mb-2 text-sm font-medium">Text</h3>
                            <div className="space-y-1.5 font-mono text-sm text-muted-foreground">
                                <p># or ## → Header <span className="font-sans">(large T)</span></p>
                                <p>Next level down → Subheader <span className="font-sans">(small T)</span></p>
                                <p>**bold** or __bold__</p>
                                <p>*italic* or _italic_</p>
                            </div>
                        </div>
                        <div>
                            <h3 className="mb-2 text-sm font-medium">Lists & blocks</h3>
                            <div className="space-y-1.5 font-mono text-sm text-muted-foreground">
                                <p>- Unordered item</p>
                                <p>1. Ordered item</p>
                                <p>&gt; Blockquote</p>
                                <p>{'``` code ```'}</p>
                            </div>
                        </div>
                        <div>
                            <h3 className="mb-2 text-sm font-medium">Media & links</h3>
                            <div className="space-y-1.5 font-mono text-sm text-muted-foreground">
                                <p>![alt](url)</p>
                                <p>[text](url)</p>
                            </div>
                        </div>
                        <div>
                            <h3 className="mb-2 text-sm font-medium">Other</h3>
                            <div className="space-y-1.5 font-mono text-sm text-muted-foreground">
                                <p>---</p>
                                <p>`inline code`</p>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <h3 className="mb-2 text-sm font-medium">Tables</h3>
                            <pre className="overflow-auto rounded-md bg-muted p-3 text-sm leading-5">
{`| Name  | Role     |
| ----- | -------- |
| John  | Manager  |
| Alice | Engineer |`}
                            </pre>
                            <p className="mt-2 text-sm text-muted-foreground">
                                By default tables paste as readable text (not a grid). Change how preview handles them under Advanced.
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showGistInstructions} onOpenChange={setShowGistInstructions}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Github className="h-5 w-5" />
                            GitHub Gist helper
                        </DialogTitle>
                        <DialogDescription>
                            Create a Gist for each table, then paste the embed into Medium.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {tableData.map((table, index) => (
                            <div
                                key={table.id}
                                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                            >
                                <div>
                                    <p className="text-sm font-medium">Table {index + 1}</p>
                                    <p className="text-xs text-muted-foreground">{table.filename}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            navigator.clipboard.writeText(table.content);
                                            toast({
                                                title: "Copied",
                                                description: `Table ${index + 1} copied`,
                                                duration: 2000,
                                            });
                                        }}
                                    >
                                        <Copy />
                                        Copy
                                    </Button>
                                    <Button size="sm" onClick={() => createGistForTable(index)}>
                                        Create Gist
                                    </Button>
                                </div>
                            </div>
                        ))}
                        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                            <li>Click Create Gist — content is copied and gist.github.com opens.</li>
                            <li>Paste, name the file, and create the gist.</li>
                            <li>Copy the Embed script and replace the placeholder in your Medium draft.</li>
                        </ol>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                                tableData.forEach((table) =>
                                    downloadTableAsMarkdown(table.content, table.filename)
                                );
                            }}
                        >
                            <Download />
                            Download table files
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button size="sm" onClick={() => setShowGistInstructions(false)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <header className="sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <Image src="/markdown2medium.png" alt="Markdown2Medium" width={32} height={32} />
                        <div className="leading-tight">
                            <h1 className="text-base font-semibold tracking-tight">Markdown2Medium</h1>
                            <p className="hidden text-xs text-muted-foreground sm:block">
                                Paste Markdown · Copy · Paste into Medium
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowQuickGuide(true)}
                    >
                        <HelpCircle />
                        Help
                    </Button>
                </div>
            </header>

            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        onClick={copyHtmlToClipboard}
                        disabled={!markdown.trim() || isCopying}
                        className="min-w-[10.25rem] transition-all duration-200"
                    >
                        {isCopying ? (
                            <>
                                <Loader2 className="animate-spin" />
                                Copying…
                            </>
                        ) : copied ? (
                            <>
                                <Check className="animate-in zoom-in-50 duration-200" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy />
                                Copy for Medium
                            </>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadHtml}
                        disabled={!htmlOutput || isCopying}
                    >
                        <Download />
                        Download HTML
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={openNewPagePreview}
                        disabled={!htmlOutput || isCopying}
                    >
                        <Maximize />
                        Full Preview
                    </Button>
                </div>

                <div className="hidden min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-2">
                    {editorPane}
                    {previewPane}
                </div>

                <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                    <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col">
                        <TabsList className="mb-3 grid w-full shrink-0 grid-cols-2">
                            <TabsTrigger value="editor">Markdown</TabsTrigger>
                            <TabsTrigger value="preview">Preview</TabsTrigger>
                        </TabsList>
                        <TabsContent value="editor" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                            <div className="flex h-full min-h-0 flex-col">{editorPane}</div>
                        </TabsContent>
                        <TabsContent value="preview" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                            <div className="flex h-full min-h-0 flex-col">{previewPane}</div>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="shrink-0 space-y-3 border-t pt-3">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform duration-300 ease-out ${showAdvanced ? 'rotate-180' : ''}`} />
                        Advanced
                    </button>
                    <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                            showAdvanced ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                    >
                        <div className="overflow-hidden">
                            <Card className="max-w-xl shadow-sm">
                                <CardContent className="space-y-6 p-4 sm:p-6">
                                    <div>
                                        <p className="mb-3 text-sm font-medium">Table handling</p>
                                        <RadioGroup
                                            value={tableMode}
                                            onValueChange={(value) => setTableMode(value as TableMode)}
                                            className="space-y-3"
                                        >
                                            <div className="flex items-start gap-3">
                                                <RadioGroupItem value="plain" id="table-plain" className="mt-0.5" />
                                                <div>
                                                    <Label htmlFor="table-plain" className="cursor-pointer font-medium">
                                                        Readable text
                                                    </Label>
                                                    <p className="text-sm text-muted-foreground">
                                                        Preview and paste match. Stacked text that wraps on Medium.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <RadioGroupItem value="image" id="table-image" className="mt-0.5" />
                                                <div>
                                                    <Label htmlFor="table-image" className="cursor-pointer font-medium">
                                                        Images
                                                    </Label>
                                                    <p className="text-sm text-muted-foreground">
                                                        Preview and Download HTML show table images. Copy still pastes readable text.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <RadioGroupItem value="gist" id="table-gist" className="mt-0.5" />
                                                <div>
                                                    <Label htmlFor="table-gist" className="cursor-pointer font-medium">
                                                        GitHub Gist
                                                    </Label>
                                                    <p className="text-sm text-muted-foreground">
                                                        Preview shows placeholders. Use the helper to create embeds for Medium.
                                                    </p>
                                                </div>
                                            </div>
                                        </RadioGroup>
                                        {tableMode === 'gist' && hasTables && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="mt-3 animate-in fade-in duration-200"
                                                onClick={openGistHelper}
                                            >
                                                <Github />
                                                Open Gist helper
                                            </Button>
                                        )}
                                    </div>

                                    <Separator />

                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="medium-classes"
                                            checked={addMediumClasses}
                                            onCheckedChange={setAddMediumClasses}
                                        />
                                        <Label htmlFor="medium-classes" className="cursor-pointer text-sm text-muted-foreground">
                                            Medium CSS classes in preview HTML
                                        </Label>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        <a
                            href="https://github.com/Joel-hanson/markdown2medium"
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-4 transition-colors hover:underline"
                        >
                            GitHub
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MarkdownToMediumConverter;

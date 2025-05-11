"use client"

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from "@/hooks/use-toast";
import { elementToSVG } from 'dom-to-svg';
import DOMPurify from 'dompurify';
import html2canvas from 'html2canvas';
import {
    AlertCircle,
    Code2,
    Copy,
    Download,
    Eye,
    Github,
    HelpCircle,
    Image as ImageIcon,
    Maximize,
    Rocket,
    Table,
    X
} from 'lucide-react';
import { marked } from 'marked';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

// Define TypeScript interfaces
interface TableData {
    id: string;
    content: string;
    filename: string;
}

interface TableImage {
    dataUrl: string;
    svg: string;
    tableIndex: string;
}

type TableHandlingMethod = 'html' | 'gist' | 'image';

const MarkdownToMediumConverter: React.FC = () => {
    const [markdown, setMarkdown] = useState<string>('');
    const [htmlOutput, setHtmlOutput] = useState<string>('');
    const [activeTab, setActiveTab] = useState<string>('editor');
    const [darkMode] = useState<boolean>(false);
    const [wordCount, setWordCount] = useState<number>(0);
    const [charCount, setCharCount] = useState<number>(0);
    const [addMediumClasses, setAddMediumClasses] = useState<boolean>(true);
    const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
    const [showQuickGuide, setShowQuickGuide] = useState<boolean>(false);
    const [showTableOptions, setShowTableOptions] = useState<boolean>(false);
    const [tableHandlingMethod, setTableHandlingMethod] = useState<TableHandlingMethod>('image');
    const [copied, setCopied] = useState<boolean>(false);
    const [tableData, setTableData] = useState<TableData[]>([]);
    const [showGistInstructions, setShowGistInstructions] = useState<boolean>(false);
    const { toast } = useToast();

    const sampleMarkdown = `# Welcome to Markdown2Medium Converter!

## Getting Started

Here's a sample post to show you how it works:

### Features Highlight

- ✨ Clean editor with live preview
- 🎨 Medium-specific formatting
- 💾 Export to HTML file
- 📊 Table support (partial)

## Try These Elements

**Bold text** and *italic text*

> A meaningful blockquote

\`\`\`javascript
// Code block example
function hello() {
  return "Medium readers!";
}
\`\`\`

### Sample Table

| Feature | Description | Status |
| ------- | ----------- | ------ |
| Headings | H1, H2, H3 formatting | ✅ |
| Lists | Ordered and unordered lists | ✅ |
| Code | Syntax highlighting | ✅ |
| Tables | Properly formatted tables | ✅ |

![Sample Image](https://placehold.co/800x400)

## Happy Writing!

Start editing this text or paste your own Markdown content.
`;

    const openNewPagePreview = (): void => {
        // Get clean HTML without wrapper divs
        const cleanHtml = htmlOutput.replace(/^<div>|<\/div>$/g, '');

        // Create complete HTML document with proper Medium styling
        const htmlContent = `
      <!DOCTYPE html>
      <html class="${darkMode ? 'dark' : ''}">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Medium Post Preview</title>
          <style>
            /* Medium-like styling */
            .graf--h1 { font-size: 2.5rem; line-height: 1.2; margin: 2rem 0; font-weight: 700; }
            .graf--h2 { font-size: 2rem; margin: 1.8rem 0; font-weight: 600; }
            .graf--p { font-size: 1.1rem; line-height: 1.7; margin: 1.5rem 0; color: #292929; }
            .graf--blockquote { border-left: 4px solid #e6e6e6; padding-left: 1.5rem; margin: 2rem 0; color: #666; }
            .graf--pre { background: #f8f8f8; padding: 1.5rem; border-radius: 4px; overflow: auto; }
            .graf--image { max-width: 100%; height: auto; margin: 2rem 0; border-radius: 4px; }
            .postList { list-style-type: disc; padding-left: 2rem; }
            body.dark { background: #1a1a1a; color: #e6e6e6; }
            body.dark .graf--p { color: #e6e6e6; }
            
            /* Table styling */
            table { border-collapse: collapse; width: 100%; margin: 2rem 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            
            /* Gist embed styling */
            .gist-embed { margin: 2rem 0; padding: 1rem; background: #f8f8f8; border-radius: 4px; }
            .gist-embed-placeholder { border: 1px dashed #ccc; padding: 1rem; margin: 2rem 0; text-align: center; }
          </style>
        </head>
        <body class="${darkMode ? 'dark bg-gray-900' : 'bg-white'}">
          <main class="max-w-2xl mx-auto p-6">
            ${cleanHtml}
          </main>
        </body>
      </html>
    `;

        // Create blob and open in new window
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');

        // Clean up URL object after window opens
        if (newWindow) {
            newWindow.onload = () => URL.revokeObjectURL(url);
        }
    };

    // Functions to handle tables
    const extractTablesFromMarkdown = (markdownText: string): string[][] => {
        const lines = markdownText.split('\n');
        const tables: string[][] = [];
        let currentTable: string[] = [];
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.includes('|')) {
                if (!inTable) {
                    inTable = true;
                }
                currentTable.push(line);
            } else if (inTable) {
                tables.push([...currentTable]);
                currentTable = [];
                inTable = false;
            }
        }

        // Don't forget the last table if the text ends with a table
        if (inTable && currentTable.length > 0) {
            tables.push([...currentTable]);
        }

        return tables;
    };

    const processTablesForGist = (tables: string[][]): TableData[] => {
        if (!tables || tables.length === 0) return [];

        return tables.map((tableRows, index) => {
            return {
                id: `table-${index + 1}`,
                content: tableRows.join('\n'),
                filename: `table-${index + 1}.md`
            };
        });
    };

    const createTableHtml = (tableRows: string[]): string => {
        // Skip if empty or not enough rows
        if (!tableRows || tableRows.length < 2) return '';

        // Process header
        const headerRow = tableRows[0]
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map(cell => cell.trim());

        // Check if second row is separator
        const isSeparator = /^\|?\s*[-:]+\s*\|/.test(tableRows[1]);
        const startContentRowIndex = isSeparator ? 2 : 1;

        // Build HTML table
        let html = '<table><thead><tr>';
        headerRow.forEach(cell => {
            html += `<th>${cell}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Add data rows
        for (let i = startContentRowIndex; i < tableRows.length; i++) {
            const cells = tableRows[i]
                .trim()
                .replace(/^\||\|$/g, '')
                .split('|')
                .map(cell => cell.trim());

            html += '<tr>';
            cells.forEach(cell => {
                html += `<td>${cell}</td>`;
            });
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    };

    const generateGistPlaceholder = (tableIndex: number): string => {
        return `
<div class="gist-embed-placeholder">
  <p><strong>Table ${tableIndex}</strong> - Create a GitHub Gist with this content</p>
  <p class="text-sm text-muted-foreground">Replace this placeholder with a GitHub Gist embed</p>
</div>`;
    };

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

    const convertTableToImage = async (tableHtml: string, tableIndex: string): Promise<TableImage | null> => {
        try {
            // Create a temporary container
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

            // Use html2canvas to convert to image
            const canvas = await html2canvas(container);
            const svg = elementToSVG(container);
            // Serialize the SVG to a string
            const svgString = new XMLSerializer().serializeToString(svg);
            document.body.removeChild(container);

            // Convert canvas to data URL
            return {
                dataUrl: canvas.toDataURL('image/png'),
                svg: svgString,
                tableIndex
            };

        } catch (error) {
            console.error('Error converting table to image:', error);
            return null;
        }
    };

    // Convert markdown to HTML with Medium classes
    const convertMarkdown = useCallback(async (content: string): Promise<string> => {
        try {
            if (!content) return '';

            const rawHtml = await marked.parse(content);
            let mediumHtml = rawHtml;

            // Process tables based on the selected method
            if (tableHandlingMethod !== 'html') {
                const tables = extractTablesFromMarkdown(content);

                if (tables.length > 0) {
                    setTableData(processTablesForGist(tables));

                    // Replace tables in the HTML based on the selected method
                    tables.forEach((tableRows, index) => {
                        const tableHtml = createTableHtml(tableRows);

                        if (tableHandlingMethod === 'gist') {
                            // Replace with Gist placeholder
                            const gistPlaceholder = generateGistPlaceholder(index + 1);
                            mediumHtml = mediumHtml.replaceAll("\n", "").replace(tableHtml, gistPlaceholder);

                        } else if (tableHandlingMethod === 'image') {
                            // We'll handle image conversion separately
                            // Just mark the tables for now
                            const imagePlaceholder = `<div data-table-index="table-${index + 1}" class="table-image-placeholder">
                                <p>Table ${index + 1} will be converted to an image</p>
                            </div>`;

                            mediumHtml = mediumHtml.replaceAll("\n", "").replace(tableHtml, imagePlaceholder);
                        }
                    });
                }
            }

            if (addMediumClasses) {
                mediumHtml = mediumHtml
                    .replace(/<h1/g, '<h1 class="graf graf--h1"')
                    .replace(/<h2/g, '<h2 class="graf graf--h2"')
                    .replace(/<h3/g, '<h3 class="graf graf--h3"')
                    .replace(/<p>/g, '<p class="graf graf--p">')
                    .replace(/<blockquote>/g, '<blockquote class="graf graf--blockquote graf--pullquote">')
                    .replace(/<pre>/g, '<pre class="graf graf--pre">')
                    .replace(/<code/g, '<code class="markup--code markup--pre-code"')
                    .replace(/<ul>/g, '<ul class="postList graf graf--ul">')
                    .replace(/<li>/g, '<li class="graf graf--li">')
                    .replace(/<strong>/g, '<strong class="markup--strong markup--p-strong">')
                    .replace(/<em>/g, '<em class="markup--em markup--p-em">')
                    .replace(/<img/g, '<img class="graf graf--image"');
            }

            // Handle image conversion for tables if needed
            if (tableHandlingMethod === 'image') {
                // We'll handle this in the useEffect after HTML is set
                // For now, just return the HTML with placeholders
            }

            return DOMPurify.sanitize(mediumHtml);
        } catch (error) {
            console.error('Error parsing markdown:', error);
            return '<div class="text-red-500">Error parsing markdown</div>';
        }
    }, [addMediumClasses, tableHandlingMethod]);


    useEffect(() => {
        // Only runs once
        const firstVisit = localStorage.getItem('firstVisit') == null;
        if (firstVisit) {
            localStorage.setItem('firstVisit', 'false');
            setShowOnboarding(true);
            setMarkdown(sampleMarkdown);
        }

        const method = localStorage.getItem("tablehandlingMethod");
        const isValidMethod = (val: string): val is TableHandlingMethod =>
            val === 'html' || val === 'gist' || val === 'image';

        if (method && isValidMethod(method)) {
            setTableHandlingMethod(method);
        }
    }, [sampleMarkdown]);

    useEffect(() => {
        if (tableHandlingMethod) {
            localStorage.setItem('tablehandlingMethod', tableHandlingMethod);
        }
    }, [tableHandlingMethod]);

    useEffect(() => {
        const convertAndSetHtml = async () => {
            const converted = await convertMarkdown(markdown);
            setHtmlOutput(converted);
        };
        convertAndSetHtml();

        const words = markdown.trim() ? markdown.split(/\s+/).length : 0;
        setWordCount(words);
        setCharCount(markdown.length);
    }, [markdown, convertMarkdown]);


    // Handle image conversion for tables after HTML is set
    useEffect(() => {
        const processTableImages = async () => {
            if (tableHandlingMethod === 'image' && htmlOutput) {
                // Create a temporary DOM element to find table placeholders
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlOutput;

                const placeholders = tempDiv.querySelectorAll('.table-image-placeholder');
                if (placeholders.length === 0) return;

                // Process each table placeholder
                const imagePromises: Promise<TableImage | null>[] = [];

                tableData.forEach(table => {
                    const tableHtml = createTableHtml(table.content.split('\n'));
                    imagePromises.push(convertTableToImage(tableHtml, table.id));
                });

                // Wait for all image conversions and update HTML
                const images = await Promise.all(imagePromises);
                let updatedHtml = htmlOutput;

                images.forEach(image => {
                    if (!image) return;


                    const placeholder = `<div class="table-image-placeholder" data-table-index="${image.tableIndex}">`;
                    const imageHtml = `<div class="table-image-container">
                        <img src="${image.dataUrl}" alt="Table ${image.tableIndex}" class="graf graf--image" />
                    </div>`;

                    // const svgBase64 = btoa(unescape(encodeURIComponent(image.svg)));
                    // const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

                    // const placeholder = `<div class="table-image-placeholder" data-table-index="${image.tableIndex}">`;
                    // const imageHtml = `<div class="table-image-container">
                    //     <img src="${dataUrl}" alt="Table ${image.tableIndex}" class="graf graf--image" />
                    // </div>`;

                    updatedHtml = updatedHtml.replaceAll("\n", "").replace(
                        new RegExp(placeholder + '.*?</div>', 's'),
                        imageHtml
                    );
                });

                setHtmlOutput(updatedHtml);
            }
        };

        processTableImages();
    }, [htmlOutput, tableHandlingMethod, tableData]);

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
        setMarkdown(sampleMarkdown);
    }, [sampleMarkdown]);

    const clearEditor = useCallback((): void => {
        setMarkdown('');
    }, []);

    const copyHtmlToClipboard = useCallback((): void => {
        navigator.clipboard.writeText(htmlOutput);
        setCopied(true);
        toast({
            title: "HTML copied to clipboard",
            description: "You can now paste it into Medium's editor",
            duration: 3000,
        });
        setTimeout(() => setCopied(false), 2000);
    }, [htmlOutput, toast]);

    const downloadAllTablesAsGist = useCallback((): void => {
        if (!tableData.length) {
            toast({
                title: "No tables found",
                description: "No table content to download",
                variant: "destructive",
                duration: 3000,
            });
            return;
        }

        tableData.forEach(table => {
            downloadTableAsMarkdown(table.content, table.filename);
        });

        setShowGistInstructions(true);
    }, [tableData, toast]);

    return (
        <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
            {/* Onboarding Dialog */}
            <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
                <DialogContent className="sm:max-w-2xl p-10">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <Rocket className="h-8 w-8 text-blue-600" />
                            <DialogTitle className="text-2xl">Welcome to Markdown2Medium Converter!</DialogTitle>
                        </div>
                        <DialogDescription className="text-left pt-4">
                            Let&apos;s get you started with this simple 3-step guide:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="flex items-start gap-4">
                            <span className="bg-blue-100 text-blue-600 text-xs font-medium me-2 px-2.5 py-1 mt-1 dark:bg-blue-700 dark:text-blue-300 rounded-full">1</span>
                            <div>
                                <h3 className="font-semibold">Write or paste your Markdown</h3>
                                <p className="text-sm text-muted-foreground my-2">
                                    Use the editor to write your content with Markdown syntax. We&apos;ve preloaded a sample for you.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <span className="bg-blue-100 text-blue-600 text-xs font-medium me-2 px-2.5 py-1 mt-1 dark:bg-blue-700 dark:text-blue-300 rounded-full">2</span>
                            <div>
                                <h3 className="font-semibold">Preview your Medium post</h3>
                                <p className="text-sm text-muted-foreground my-2">
                                    Switch to the preview tab to see how it will look on Medium.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <span className="bg-blue-100 text-blue-600 text-xs font-medium me-2 px-2.5 py-1 mt-1 dark:bg-blue-700 dark:text-blue-300 rounded-full">3</span>
                            <div>
                                <h3 className="font-semibold">Copy or export HTML</h3>
                                <p className="text-sm text-muted-foreground my-2">
                                    Get the formatted HTML or copy the content to paste directly into Medium&apos;s editor.
                                </p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowOnboarding(false)} className="w-full">
                            Get Started
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Guide Dialog */}
            <Dialog open={showQuickGuide} onOpenChange={setShowQuickGuide}>
                <DialogContent className="max-w-[95vw] sm:max-w-2xl overflow-y-auto max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Markdown Quick Reference</DialogTitle>
                        <DialogDescription>
                            Common formatting syntax you can use in the editor
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                        <div>
                            <h3 className="font-semibold mb-3">Text Formatting</h3>
                            <div className="space-y-2 text-sm">
                                <p><code># Heading 1</code></p>
                                <p><code>## Heading 2</code></p>
                                <p><code>**bold**</code> or <code>__bold__</code></p>
                                <p><code>*italic*</code> or <code>_italic_</code></p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Lists & Blocks</h3>
                            <div className="space-y-2 text-sm">
                                <p><code>- Unordered item</code></p>
                                <p><code>1. Ordered item</code></p>
                                <p><code>&gt; Blockquote</code></p>
                                <p><code>``` Code block ```</code></p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Media & Links</h3>
                            <div className="space-y-2 text-sm">
                                <p><code>![alt](url)</code> (images)</p>
                                <p><code>[text](url)</code> (links)</p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Tables</h3>
                            <div className="space-y-2 text-sm">
                                <p><code>| Header | Header |</code></p>
                                <p><code>| ------ | ------ |</code></p>
                                <p><code>| Cell   | Cell   |</code></p>
                            </div>
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <h3 className="font-semibold mb-3">Table Example</h3>
                            <div className="space-y-2 text-sm">
                                <pre className="bg-gray-100 p-2 rounded dark:bg-gray-800 overflow-auto text-sm leading-5 whitespace-pre">
                                    | Name  | Role     | Department |
                                    | ----- | -------- | ---------- |
                                    | John  | Manager  | Sales      |
                                    | Alice | Engineer | DevOps     |
                                </pre>
                                <p className="text-muted-foreground mt-2">
                                    💡 Tip: Make sure there are at least 3 dashes in each column of the separator row.
                                </p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Advanced</h3>
                            <div className="space-y-2 text-sm">
                                <p><code>---</code> (horizontal rule)</p>
                                <p><code>`inline code`</code></p>
                                <p><code>~~strikethrough~~</code></p>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Table Options Dialog */}
            <Dialog open={showTableOptions} onOpenChange={setShowTableOptions}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Table className="h-5 w-5" />
                            Table Handling Options
                        </DialogTitle>
                        <DialogDescription>
                            Choose how to handle tables for better Medium compatibility
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <RadioGroup value={tableHandlingMethod} onValueChange={(value: TableHandlingMethod) => setTableHandlingMethod(value)} className="space-y-4">
                            <div className="flex items-start space-x-3 space-y-0">
                                <RadioGroupItem value="html" id="html" />
                                <div className="grid gap-1.5">
                                    <Label htmlFor="html" className="font-medium">
                                        HTML Tables
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        Convert markdown tables to HTML tables with Medium-friendly styling
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start space-x-3 opacity-60">
                                <RadioGroupItem value="gist" id="gist" />
                                <div className="grid gap-1.5">
                                    <Label htmlFor="gist" className="font-medium flex items-center gap-2">
                                        GitHub Gist Embed <Github className="h-4 w-4" />
                                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
                                            Under Development
                                        </span>
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        Extract tables as GitHub Gists and embed them in your Medium post
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3 space-y-0">
                                <RadioGroupItem value="image" id="image" />
                                <div className="grid gap-1.5">
                                    <Label htmlFor="image" className="font-medium flex items-center gap-2">
                                        Convert to Images <ImageIcon className="h-4 w-4" /> <span className="text-muted-foreground font-normal">(Default)</span>
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        Convert tables to images that display perfectly on Medium
                                    </p>
                                </div>
                            </div>
                        </RadioGroup>

                        {tableHandlingMethod === 'gist' && (
                            <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-amber-800 dark:text-amber-300">GitHub Gist Instructions</h4>
                                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                                            You&apos;ll need to create GitHub Gists for your tables and replace the placeholders in the HTML output.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowTableOptions(false)}>
                            Apply Selection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* GitHub Gist Instructions Dialog */}
            <Dialog open={showGistInstructions} onOpenChange={setShowGistInstructions}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Github className="h-5 w-5" />
                            GitHub Gist Embedding Instructions
                        </DialogTitle>
                        <DialogDescription>
                            Follow these steps to embed your tables as GitHub Gists
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <span className="bg-blue-100 text-blue-600 text-xs font-medium me-2 px-2.5 py-1 mt-1 dark:bg-blue-700 dark:text-blue-300 rounded-full">1</span>
                                <div>
                                    <h3 className="font-semibold">Create GitHub Gists</h3>
                                    <p className="text-sm text-muted-foreground my-2">
                                        Go to <a href="https://gist.github.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">gist.github.com</a> and create a new gist for each table markdown file you downloaded.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <span className="bg-blue-100 text-blue-600 text-xs font-medium me-2 px-2.5 py-1 mt-1 dark:bg-blue-700 dark:text-blue-300 rounded-full">2</span>
                                <div>
                                    <h3 className="font-semibold">Get the embed code</h3>
                                    <p className="text-sm text-muted-foreground my-2">
                                        After creating each gist, click the &quot;Embed&quot; button and copy the <code>&lt;script&gt;</code> tag provided.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <span className="bg-blue-100 text-blue-600 text-xs font-medium me-2 px-2.5 py-1 mt-1 dark:bg-blue-700 dark:text-blue-300 rounded-full">3</span>
                                <div>
                                    <h3 className="font-semibold">Replace the placeholders</h3>
                                    <p className="text-sm text-muted-foreground my-2">
                                        In the copied HTML, find the placeholder divs for tables and replace them with the gist embed code.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                            <h4 className="font-medium mb-2">Example of placeholder to replace:</h4>
                            <pre className="text-xs p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto">
                                {'<div class="gist-embed-placeholder">\n  <p><strong>Table 1</strong> - Create a GitHub Gist with this content</p>\n  <p class="text-sm text-muted-foreground">\n    Replace this placeholder with a GitHub Gist embed\n  </p>\n</div>'}
                            </pre>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowGistInstructions(false)}>
                            Got it
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Header */}
            <header className="border-b bg-white dark:bg-gray-950 dark:border-gray-800">
                <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <Image src={"/markdown2medium.png"} alt="markdown2medium" width={50} height={50}></Image>
                        <h1 className="text-xl font-bold">Markdown2Medium</h1>
                    </div>
                    <div className="flex gap-3">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={() => setShowQuickGuide(true)}>
                                        <HelpCircle className="h-4 w-4 mr-2" />
                                        Guide
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Show quick reference guide</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={() => setShowTableOptions(true)}>
                                        <Table className="h-4 w-4 mr-2" />
                                        Tables
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Configure table handling options</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                    <Card className="w-full">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <CardHeader className="pb-2">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <TabsList className="flex-wrap">
                                        <TabsTrigger value="editor" className="flex items-center gap-2">
                                            <Code2 className="h-4 w-4" />
                                            Editor
                                        </TabsTrigger>
                                        <TabsTrigger value="preview" className="flex items-center gap-2">
                                            <Eye className="h-4 w-4" />
                                            Preview
                                        </TabsTrigger>
                                    </TabsList>

                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground">
                                        <span>{wordCount} words</span>
                                        <Separator orientation="vertical" className="hidden sm:block h-4" />
                                        <span>{charCount} characters</span>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent>
                                <TabsContent value="editor" className="mt-0">
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                id="medium-classes"
                                                checked={addMediumClasses}
                                                onCheckedChange={setAddMediumClasses}
                                            />
                                            <Label htmlFor="medium-classes" className="text-sm cursor-pointer">Medium Classes</Label>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" size="sm" onClick={loadSample} className="text-xs">
                                                Load Sample
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={clearEditor} className="text-xs">
                                                <X className="h-3 w-3 mr-1" />
                                                Clear
                                            </Button>
                                        </div>
                                    </div>

                                    <Textarea
                                        placeholder="Write or paste your markdown here..."
                                        className="font-mono text-sm min-h-[60vh] sm:min-h-[70vh] resize-none focus-visible:ring-1"
                                        value={markdown}
                                        onChange={(e) => setMarkdown(e.target.value)}
                                    />
                                </TabsContent>

                                <TabsContent value="preview" className="mt-0">
                                    <div className="bg-white dark:bg-gray-950 p-4 sm:p-6 rounded-md border min-h-[60vh] sm:min-h-[70vh] prose prose-blue dark:prose-invert max-w-none overflow-auto">
                                        <div dangerouslySetInnerHTML={{ __html: htmlOutput }} />
                                    </div>
                                </TabsContent>
                            </CardContent>
                        </Tabs>
                    </Card>

                    {/* Actions Sidebar */}
                    <div className="lg:w-64 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Export Options</CardTitle>
                                <CardDescription>Get your content ready for Medium</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button onClick={copyHtmlToClipboard} className="w-full flex items-center gap-2 hidden" disabled={!htmlOutput}>
                                    <Copy className="h-4 w-4" />
                                    {copied ? "Copied!" : "Copy HTML"}
                                </Button>
                                <Button onClick={downloadHtml} variant="outline" className="w-full flex items-center gap-2" disabled={!htmlOutput}>
                                    <Download className="h-4 w-4" />
                                    Download HTML
                                </Button>
                                <Button onClick={openNewPagePreview} variant="outline" className="w-full flex items-center gap-2" disabled={!htmlOutput}>
                                    <Maximize className="h-4 w-4" />
                                    Full Preview
                                </Button>

                                {tableHandlingMethod === 'gist' && tableData.length > 0 && (
                                    <Button
                                        onClick={downloadAllTablesAsGist}
                                        variant="secondary"
                                        className="w-full flex items-center gap-2"
                                    >
                                        <Github className="h-4 w-4" />
                                        Export Tables for Gist
                                    </Button>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">About</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                <p className="mb-4">Convert Markdown to Medium-friendly HTML with proper styling and formatting.</p>
                                <div className="flex items-center gap-2">
                                    <Github className="h-4 w-4" />
                                    <a href="https://github.com/Joel-hanson/markdown2medium" target="_blank" className="text-blue-600 hover:underline">View on GitHub</a>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default MarkdownToMediumConverter;
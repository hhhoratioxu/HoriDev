import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
globalThis.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === 'typescript' || label === 'javascript'
      ? new TsWorker()
      : label === 'json'
        ? new JsonWorker()
        : label === 'css'
          ? new CssWorker()
          : label === 'html'
            ? new HtmlWorker()
            : new EditorWorker(),
};
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/language/json/monaco.contribution.js';
import 'monaco-editor/language/typescript/monaco.contribution.js';
import 'monaco-editor/language/css/monaco.contribution.js';
import 'monaco-editor/language/html/monaco.contribution.js';

export default function CodeEditor({
  path,
  language,
  value,
  onChange,
  original,
  readOnly = false,
}: {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  original?: string;
  readOnly?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<
    monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor | null
  >(null);
  const modifiedRef = useRef<monaco.editor.ITextModel | null>(null);
  const originalRef = useRef<monaco.editor.ITextModel | null>(null);
  const changeRef = useRef(onChange);
  const applyingExternalValue = useRef(false);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  const diff = original !== undefined;
  useEffect(() => {
    if (!container.current) return;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'light';
    const options: monaco.editor.IStandaloneEditorConstructionOptions = {
      fontSize: 13,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      lineHeight: 23,
      minimap: { enabled: false },
      padding: { top: 20 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      tabSize: 2,
      readOnly,
      accessibilitySupport: 'on',
      renderLineHighlight: 'line',
      smoothScrolling: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      theme,
    };
    const uri = monaco.Uri.parse(`inmemory://horidev/${crypto.randomUUID()}/${path}`);
    const modified = monaco.editor.createModel(value, language, uri);
    modifiedRef.current = modified;
    let editor: monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor;
    if (diff) {
      const before = monaco.editor.createModel(original ?? '', language);
      originalRef.current = before;
      editor = monaco.editor.createDiffEditor(container.current, {
        ...options,
        renderSideBySide: true,
        originalEditable: false,
      });
      editor.setModel({ original: before, modified });
    } else editor = monaco.editor.create(container.current, { ...options, model: modified });
    editorRef.current = editor;
    const subscription = modified.onDidChangeContent(() => {
      if (!applyingExternalValue.current) changeRef.current(modified.getValue());
    });
    return () => {
      subscription.dispose();
      editor.setModel(null);
      editor.dispose();
      modified.dispose();
      originalRef.current?.dispose();
      editorRef.current = null;
      modifiedRef.current = null;
      originalRef.current = null;
    };
    // Models belong to this editor instance. Content and options update independently below.
  }, [path, diff]);
  useEffect(() => {
    const model = modifiedRef.current;
    if (model && model.getValue() !== value) {
      applyingExternalValue.current = true;
      try {
        model.setValue(value);
      } finally {
        applyingExternalValue.current = false;
      }
    }
  }, [value]);
  useEffect(() => {
    const model = originalRef.current;
    if (model && model.getValue() !== (original ?? '')) model.setValue(original ?? '');
  }, [original]);
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);
  useEffect(() => {
    if (modifiedRef.current) monaco.editor.setModelLanguage(modifiedRef.current, language);
  }, [language]);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      monaco.editor.setTheme(
        document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'light',
      ),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={container}
      className="code-editor-container"
      style={{ height: '100%', width: '100%' }}
      aria-label={`${path} 源码编辑器`}
    />
  );
}

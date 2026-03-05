'use client';

import { useEffect, useState } from 'react';
import { FileText, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

interface MemoryFile {
  name: string;
  path: string;
  content: string;
}

export function OscarMemoryBrowser() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/oscar/memory');
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files ?? []);
          if ((data.files ?? []).length > 0) {
            setSelected(data.files[0].path);
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectedFile = files.find((f) => f.path === selected);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-mc-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading memory files…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-mc-text-secondary text-sm">
        <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
        No memory files found
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* File list */}
      <div className="w-64 flex-shrink-0 border border-mc-border rounded-lg overflow-y-auto bg-mc-bg">
        {files.map((file) => (
          <button
            key={file.path}
            onClick={() => setSelected(file.path)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-mc-border last:border-b-0 transition-colors ${
              selected === file.path
                ? 'bg-mc-bg-tertiary text-mc-text'
                : 'text-mc-text-secondary hover:bg-mc-bg-secondary hover:text-mc-text'
            }`}
          >
            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs font-mono truncate">{file.name}</span>
            {selected === file.path ? (
              <ChevronDown className="w-3 h-3 ml-auto flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* File content */}
      <div className="flex-1 border border-mc-border rounded-lg overflow-hidden flex flex-col">
        {selectedFile && (
          <>
            <div className="px-4 py-2 border-b border-mc-border bg-mc-bg-secondary flex items-center gap-2">
              <FileText className="w-4 h-4 text-mc-accent" />
              <span className="text-sm font-mono text-mc-text">{selectedFile.path}</span>
              <span className="ml-auto text-xs text-mc-text-secondary">
                {selectedFile.content.split('\n').length} lines
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-mc-bg">
              <pre className="text-xs text-mc-text font-mono whitespace-pre-wrap leading-relaxed">
                {selectedFile.content}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

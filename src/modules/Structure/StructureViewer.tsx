import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { StructureResult, StructureViewerHandle } from "./structureTypes";

export const StructureViewer = forwardRef<StructureViewerHandle, { result: StructureResult }>(
  ({ result }, ref) => {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const exportRequests = useRef(new Map<string, (markup: string | null) => void>());
    const [status, setStatus] = useState("Loading local structure renderer...");

    const postResult = () => {
      frameRef.current?.contentWindow?.postMessage({
        type: "rnameta-structure-render",
        ...result
      }, "*");
    };

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.source !== frameRef.current?.contentWindow) return;
        const payload = event.data as {
          type?: string;
          message?: string;
          requestId?: string;
          markup?: string;
        };
        if (payload.type === "rnameta-structure-svg" && payload.requestId) {
          exportRequests.current.get(payload.requestId)?.(payload.markup || null);
          exportRequests.current.delete(payload.requestId);
          return;
        }
        if (payload.type === "rnameta-structure-status") {
          setStatus(payload.message || "");
          if (payload.message === "Ready.") postResult();
        }
      };
      window.addEventListener("message", handleMessage);
      postResult();
      return () => window.removeEventListener("message", handleMessage);
    }, [result]);

    useImperativeHandle(ref, () => ({
      getSvgMarkup() {
        return new Promise((resolve) => {
          const requestId = `structure-export-${Date.now()}-${Math.random()}`;
          exportRequests.current.set(requestId, resolve);
          frameRef.current?.contentWindow?.postMessage({
            type: "rnameta-structure-export-source",
            requestId
          }, "*");
          window.setTimeout(() => {
            if (!exportRequests.current.has(requestId)) return;
            exportRequests.current.delete(requestId);
            resolve(null);
          }, 3000);
        });
      }
    }));

    return (
      <div className="structure-viewer">
        <iframe
          ref={frameRef}
          className="structure-viewer__frame"
          src="/structure/preview.html"
          title={`RNA structure for ${result.transcriptId}`}
          onLoad={postResult}
        />
        <div className="structure-viewer__status">{status}</div>
      </div>
    );
  }
);

StructureViewer.displayName = "StructureViewer";

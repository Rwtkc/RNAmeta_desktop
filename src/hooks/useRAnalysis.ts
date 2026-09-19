import { Channel, invoke } from "@tauri-apps/api/core";
import { useLogStore } from "@/store/useLogStore";

const activeChildren = new Map<number, (reason: Error) => void>();
const abortedPids = new Set<number>();

type REngineEvent =
  | { event: "stdout"; line: string }
  | { event: "stderr"; line: string }
  | { event: "close"; code: number | null }
  | { event: "error"; message: string };

interface RunShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  encoding?: string;
  label?: string;
  showConsole?: boolean;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
  captureOutput?: boolean;
}

export const abortAnalysis = async () => {
  const { addLog } = useLogStore.getState();
  if (activeChildren.size === 0) {
    return;
  }

  addLog("command", `[Engine] Aborting ${activeChildren.size} active process(es).`);
  const children = Array.from(activeChildren.entries());
  activeChildren.clear();

  await Promise.all(
    children.map(async ([pid, rejecter]) => {
      abortedPids.add(pid);
      rejecter(new Error("Aborted"));
      await invoke("terminate_process_tree", { pid }).catch(() => null);
      abortedPids.delete(pid);
    })
  );
};

export function useRAnalysis() {
  const {
    activeProcessCount,
    addLog,
    incrementProcess,
    decrementProcess
  } = useLogStore();
  const isRunning = activeProcessCount > 0;

  async function runShellCommand(
    commandName: string,
    args: string[] = [],
    options: RunShellOptions = {}
  ) {
    if (commandName !== "r-engine") {
      throw new Error(`Unsupported native analysis command: ${commandName}`);
    }
    const env = {
        LANG: "Chinese (Simplified)_China.utf8",
        LC_ALL: "Chinese (Simplified)_China.utf8",
        ...options.env
    };
    incrementProcess();
    addLog("command", `[Engine] Dispatching ${options.label ?? commandName}`);

    return new Promise<void>(async (resolve, reject) => {
      let childPid: number | null = null;
      let finished = false;

      const done = (error?: Error) => {
        if (finished) return;
        finished = true;
        if (childPid !== null) {
          activeChildren.delete(childPid);
        }
        decrementProcess(Boolean(error));
        if (error) reject(error);
        else resolve();
      };

      const onEvent = new Channel<REngineEvent>();
      onEvent.onmessage = (event) => {
        if (childPid !== null && abortedPids.has(childPid)) return;
        if (event.event === "stdout") {
          if (options.captureOutput !== false) addLog("info", `[stdout] ${event.line}`);
          options.onStdout?.(event.line);
        } else if (event.event === "stderr") {
          if (options.captureOutput !== false) {
            const normalized = event.line.toLowerCase();
            addLog(normalized.includes("error") || normalized.includes("failed") ? "error" : "info", `[stderr] ${event.line}`);
          }
          options.onStderr?.(event.line);
        } else if (event.event === "close") {
          if (event.code === 0) done();
          else done(new Error(`Exit code ${event.code ?? "unknown"}`));
        } else {
          done(new Error(event.message));
        }
      };

      try {
        childPid = await invoke<number>("spawn_r_engine", {
          args,
          cwd: options.cwd ?? null,
          env,
          onEvent
        });
        if (!finished) activeChildren.set(childPid, (reason) => done(reason));
      } catch (error) {
        done(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  return { isRunning, runShellCommand };
}

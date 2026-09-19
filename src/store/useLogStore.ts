import { create } from "zustand";

type LogType = "info" | "error" | "success" | "command";

interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  timestamp: string;
}

interface LogState {
  logs: LogEntry[];
  isExpanded: boolean;
  activeProcessCount: number;
  processBatchFailed: boolean;
  addLog: (type: LogType, message: string) => void;
  clearLogs: () => void;
  setExpanded: (expanded: boolean) => void;
  incrementProcess: () => void;
  decrementProcess: (failed?: boolean) => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  isExpanded: false,
  activeProcessCount: 0,
  processBatchFailed: false,
  addLog: (type, message) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type,
          message,
          timestamp: new Date().toLocaleTimeString()
        }
      ].slice(-500),
      isExpanded: type === "error" ? true : state.isExpanded
    })),
  clearLogs: () => set({ logs: [] }),
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  incrementProcess: () =>
    set((state) => ({
      activeProcessCount: state.activeProcessCount + 1,
      processBatchFailed: state.activeProcessCount === 0 ? false : state.processBatchFailed,
      isExpanded: true
    })),
  decrementProcess: (failed = false) =>
    set((state) => {
      const activeProcessCount = Math.max(0, state.activeProcessCount - 1);
      const processBatchFailed = state.processBatchFailed || failed;
      return {
        activeProcessCount,
        processBatchFailed: activeProcessCount === 0 ? false : processBatchFailed,
        isExpanded: activeProcessCount === 0 ? processBatchFailed : state.isExpanded
      };
    })
}));

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { X } from "lucide-react";
import {
  ANALYSIS_EXPORT_FORMATS,
  isDataExportFormat,
  type AnalysisExportFormat,
  type AnalysisExportState
} from "@/lib/exportFormats";

export type FigureExportFormat = AnalysisExportFormat;
export type FigureExportState = AnalysisExportState;

interface FigureExportDialogProps {
  ariaLabel: string;
  badgeIcon: ReactNode;
  description: string;
  onClose: () => void;
  onStateChange: Dispatch<SetStateAction<FigureExportState>>;
  onSubmit: () => void;
  state: FigureExportState;
  submitLabel?: string;
  title?: string;
  formats?: readonly AnalysisExportFormat[];
  scales?: readonly number[];
  selectedScale?: number;
  onScaleChange?: (scale: number) => void;
  noWrapDescription?: boolean;
  sentenceCaseTitle?: boolean;
}

export function FigureExportDialog({
  ariaLabel,
  badgeIcon,
  description,
  onClose,
  onStateChange,
  onSubmit,
  state,
  submitLabel = "Download Figure",
  title = "Figure Export",
  formats = ANALYSIS_EXPORT_FORMATS,
  scales,
  selectedScale,
  onScaleChange,
  noWrapDescription = false,
  sentenceCaseTitle = false
}: FigureExportDialogProps) {
  const isDataFormat = isDataExportFormat(state.format);
  const resolvedTitle = isDataFormat ? "Data Export" : title;
  const resolvedDescription = isDataFormat
    ? "Export the current normalized analysis table in CSV or tab-delimited TXT format."
    : description;
  const resolvedSubmitLabel = isDataFormat ? "Download Data" : submitLabel;

  return (
    <div className="export-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="export-modal__backdrop" onClick={onClose} />
      <div className="export-modal__panel">
        <div className="export-modal__head">
          <div className="export-modal__title-row">
            <div className="export-modal__badge">{badgeIcon}</div>
            <div>
              <h3 className={sentenceCaseTitle ? "export-modal__title--sentence" : undefined}>{resolvedTitle}</h3>
              <p className={noWrapDescription ? "export-modal__description--nowrap" : undefined}>{resolvedDescription}</p>
            </div>
          </div>
          <button
            type="button"
            className="export-modal__close"
            onClick={onClose}
            aria-label="Close export dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="export-modal__body">
          <div className="export-menu__field export-menu__field--full">
            <span>Format</span>
            <div className="export-modal__format-grid">
              {formats.map((formatOption) => (
                <button
                  key={formatOption}
                  type="button"
                  className={`export-modal__format-option${
                    state.format === formatOption ? " is-active" : ""
                  }`}
                  onClick={() =>
                    onStateChange((current) => ({
                      ...current,
                      format: formatOption
                    }))
                  }
                >
                  {formatOption.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {isDataFormat ? null : scales?.length && selectedScale && onScaleChange ? (
            state.format === "png" ? <div className="export-menu__field export-menu__field--full">
                <span>Resolution</span>
                <div className="export-modal__scale-grid">
                  {scales.map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      className={`export-modal__format-option${selectedScale === scale ? " is-active" : ""}`}
                      onClick={() => onScaleChange(scale)}
                    >
                      {scale}×
                    </button>
                  ))}
                </div>
              </div> : null
          ) : (
            <div className="export-modal__grid">
              <label className="export-menu__field">
                <span>Width (px)</span>
                <input
                  className="field-shell__input export-menu__input"
                  type="number"
                  value={state.width}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      width: event.target.value
                    }))
                  }
                />
              </label>

              <label className="export-menu__field">
                <span>Height (px)</span>
                <input
                  className="field-shell__input export-menu__input"
                  type="number"
                  value={state.height}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      height: event.target.value
                    }))
                  }
                />
              </label>

              <label className="export-menu__field export-menu__field--full">
                <span>DPI</span>
                <input
                  className="field-shell__input export-menu__input"
                  type="number"
                  value={state.dpi}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      dpi: event.target.value
                    }))
                  }
                />
              </label>
            </div>
          )}
        </div>

        <div className="export-modal__actions">
          <button type="button" className="export-modal__submit" onClick={onSubmit}>
            {resolvedSubmitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

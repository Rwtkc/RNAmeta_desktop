import { Play, SlidersHorizontal } from "lucide-react";
import { peakDistributionFeatures } from "./peakDistributionModuleHelpers";

interface PeakDistributionControlsCardProps {
  canRunAnalysis: boolean;
  isRunning: boolean;
  onRun: () => void;
  onToggleFeature: (feature: string) => void;
  selectedFeatures: string[];
}

export function PeakDistributionControlsCard({
  canRunAnalysis,
  isRunning,
  onRun,
  onToggleFeature,
  selectedFeatures
}: PeakDistributionControlsCardProps) {
  return (
    <section className="config-card">
      <div className="config-card__head config-card__head--with-action">
        <div className="config-card__icon">
          <SlidersHorizontal size={18} />
        </div>
        <div className="config-card__copy">
          <h3>Analysis Parameters</h3>
          <p>Choose which transcript features stay visible in the rendered distribution chart.</p>
        </div>
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={onRun}
        >
          <Play size={14} />
          Run Peak Distribution
        </button>
      </div>

      <div className="peak-distribution-controls">
        <section className="control-section is-open">
          <div className="control-section__head">
            <h4>Display Settings</h4>
          </div>
          <div className="field-shell">
            <span>Visible Features</span>
            <div className="peak-distribution-feature-grid">
              {peakDistributionFeatures.map((feature) => {
                const isActive = selectedFeatures.includes(feature);
                return (
                  <button
                    key={feature}
                    type="button"
                    className={`peak-distribution-feature-chip${
                      isActive ? " is-active" : ""
                    }`}
                    onClick={() => onToggleFeature(feature)}
                  >
                    <span className="peak-distribution-feature-chip__dot" />
                    <span>{feature}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

    </section>
  );
}

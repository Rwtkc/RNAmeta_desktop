const rnaMetaIconSrc = new URL("../../../src-tauri/icons/128x128.png", import.meta.url).href;

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-screen__center">
        <div className="loading-screen__mark">
          <img src={rnaMetaIconSrc} alt="RNAmeta" />
        </div>
        <div className="loading-screen__copy">
          <h2>RNAmeta Desktop</h2>
          <div className="loading-screen__status">
            <span className="loading-screen__dot" />
            <p>System initializing...</p>
          </div>
        </div>
        <div className="loading-screen__bar">
          <span className="loading-screen__bar-fill" />
        </div>
      </div>
    </div>
  );
}
